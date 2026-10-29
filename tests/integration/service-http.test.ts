// Real HTTPS OIDC + HTTP routing + PostgreSQL. Only authority/anchor are explicit external fixtures.
if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== 'integration') throw new Error('INTEGRATION_EXECUTION_BLOCKED');
import { beforeAll, afterAll, it, expect } from 'vitest';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:https';
import { createHash, randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import postgres from 'postgres';
const { SignJWT, exportJWK, importJWK, generateKeyPair } = await import(new URL('../../services/api/node_modules/jose/dist/webapi/index.js', import.meta.url).href) as typeof import('../../services/api/node_modules/jose/dist/types/index.js');
import { bankPolicy, hashCanonical, servicePolicy, generateEd25519KeyPair, exportSigningPrivateJwk, signPayload, verifyPayload, serviceReceiptSchema, serviceLeaseSchema, type ServiceBinding } from '../../packages/protocol/src/index.js';
import { buildFinalsServer } from '../../services/api/src/finals-server.js';
import { finalsEnvironment } from '../../services/api/src/finals-config.js';
import { postgresAuthorityStore } from '../../services/api/src/finals-store.js';
import { newServiceState } from '../../services/api/src/service-state.js';
import { assertAnchorMatches, type Anchor } from '../../services/api/src/consumption-anchor.js';
import type { InstitutionRecord } from '../../services/api/src/finals-model.js';

const root=process.env.CALLSIGN_HTTP_TEST_ROOT;
if(!root||!process.env.TEST_DATABASE_URL||!/^\/callsign_test_/.test(new URL(process.env.TEST_DATABASE_URL).pathname))throw new Error('DISPOSABLE_HTTP_TEST_CONFIGURATION_REQUIRED');
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(process.env.TEST_DATABASE_URL).hostname)||['ARI_URL','TURN_URLS','DEEPGRAM_API_KEY','ANTHROPIC_API_KEY','BESU_NODE_URLS','CONSUMPTION_ANCHOR_URL'].some(k=>process.env[k]))throw new Error('LOCAL_FIXTURE_ONLY_NO_EXTERNAL_ADAPTER_CONFIG');
const sql=postgres(process.env.TEST_DATABASE_URL,{max:2});
let runRoot:string;
const id='test-http-'+randomUUID(), deployment='test:'+id;
const records:Record<string,Anchor>={};
const anchor={read:async(i:string)=>structuredClone(records[i]!),advance:async(p:Anchor,n:Anchor)=>{assertAnchorMatches(p,records[p.institutionId]!);records[p.institutionId]=structuredClone(n);}};
let current:'current'|'revoked'|'unavailable'='current';
const registeredDigests=new Set<string>();
const longSubject='recipient-'+ 'r'.repeat(100);
let issuerApp:Awaited<ReturnType<typeof buildFinalsServer>>,platform:typeof issuerApp,senderApp:typeof issuerApp;
let web:{close():Promise<void>;resolvedUrls:{local:string[]}|null};
let provider:ReturnType<typeof createServer>,origin:string,oidc:string,apiOrigin:string,record:InstitutionRecord;
let subject='staff',mode='normal',codes=new Map<string,{nonce:string;challenge:string;client:string;redirect:string;subject:string;mode:string}>();
const issuerKey=await generateEd25519KeyPair(),serviceKey=await generateEd25519KeyPair();
const signing=await generateKeyPair('RS256',{extractable:true}),jwk={...await exportJWK(signing.publicKey),kid:'test-oidc',alg:'RS256',use:'sig'};
let issuedTokens=0;
const uid=(s:string)=>`${oidc}|${s}`;
const serverListen=(server:ReturnType<typeof createServer>)=>new Promise<string>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const a=server.address();if(!a||typeof a==='string')return reject(new Error('NO_PORT'));resolve(`https://127.0.0.1:${a.port}`);});});
interface Client {cookies:Map<string,string>;csrf:string;request(path:string,body?:unknown,headers?:Record<string,string>):Promise<{status:number;body:any;headers:Headers}>}
function client():Client {
 const c:Client={cookies:new Map(),csrf:'',async request(path,body,headers={}){
  const r=await fetch(apiOrigin+path,{method:body===undefined?'GET':'POST',headers:{origin,cookie:[...c.cookies].map(([k,v])=>`${k}=${v}`).join('; '),'content-type':'application/json','x-csrf-token':c.csrf,'idempotency-key':randomUUID(),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  for(const cookie of r.headers.getSetCookie()){const [key,value]=cookie.split(';')[0]!.split('=');if(value)c.cookies.set(key!,value);else c.cookies.delete(key!);}
  return {status:r.status,body:await r.json(),headers:r.headers};
 }};return c;
}
async function login(s:string,official=false,variant='normal',c=client()){
 subject=s;mode=variant;const start=await c.request('/v3/auth/start',{official});expect(start.status).toBe(200);
 const auth=await fetch(start.body.url,{redirect:'manual'});expect(auth.status).toBe(302);
 const redirect=new URL(auth.headers.get('location')!);const body={state:redirect.searchParams.get('state'),code:redirect.searchParams.get('code')};
 const done=await c.request('/v3/auth/callback',body);if(done.status===200)c.csrf=done.body.csrfToken;
 return {c,start,body,done};
}
async function state(){return (await sql`SELECT state FROM issuer_v2.institutions WHERE id=${id}`)[0]!.state as InstitutionRecord;}
async function mutate(op:(r:InstitutionRecord)=>void){const store=postgresAuthorityStore(process.env.ISSUER_DATABASE_URL!,{anchor,deployment});try{await store.transact(id,async r=>op(r));}finally{await store.close();}}

beforeAll(async()=>{
 runRoot=await mkdtemp(join(root!,'run-'));
 const tls={key:await readFile(`${root}/tls.key`),cert:await readFile(`${root}/tls.crt`)};
 provider=createServer(tls,async(req,res)=>{try{
  const url=new URL(req.url!,'https://127.0.0.1');res.setHeader('content-type','application/json');
  if(url.pathname==='/jwks'){res.end(JSON.stringify({keys:[jwk]}));return;}
  if(url.pathname==='/.well-known/openid-configuration'){res.end(JSON.stringify({issuer:oidc,authorization_endpoint:oidc+'/authorize',token_endpoint:oidc+'/token',jwks_uri:oidc+'/jwks'}));return;}
  if(url.pathname==='/authorize'){
   const code=randomUUID();codes.set(code,{nonce:url.searchParams.get('nonce')!,challenge:url.searchParams.get('code_challenge')!,client:url.searchParams.get('client_id')!,redirect:url.searchParams.get('redirect_uri')!,subject,mode});
   const next=new URL(url.searchParams.get('redirect_uri')!);next.searchParams.set('state',url.searchParams.get('state')!);next.searchParams.set('code',code);res.writeHead(302,{location:next.href});res.end();return;
  }
  if(url.pathname==='/token'){
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384)throw new Error('SIZE');}const b=new URLSearchParams(raw),entry=codes.get(b.get('code')!);codes.delete(b.get('code')!);
   if(!entry||b.get('client_id')!==entry.client||b.get('redirect_uri')!==entry.redirect||createHash('sha256').update(b.get('code_verifier')??'').digest('base64url')!==entry.challenge){res.writeHead(400);res.end('{}');return;}
   const now=Math.floor(Date.now()/1000),official=entry.client==='official-client';
   const payload={nonce:entry.mode==='nonce'?'wrong':entry.nonce,azp:entry.mode==='client'?'wrong':entry.client,auth_time:entry.mode==='old-auth'?now-600:now,name:'Same Display Name',email:'same@example.invalid'};
   const key=entry.mode==='signature'?(await generateKeyPair('RS256')).privateKey:signing.privateKey;
   const token=await new SignJWT(payload).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer(entry.mode==='issuer'?'https://wrong.example':oidc).setAudience(entry.mode==='audience'?'wrong':official?'official-audience':'work-audience').setSubject(entry.subject).setIssuedAt(now).setExpirationTime(entry.mode==='expired'?now-1:now+240).setJti(String(++issuedTokens)).sign(key);
   res.end(JSON.stringify({id_token:token}));return;
  }res.writeHead(404);res.end('{}');
 }catch{res.writeHead(500);res.end('{}');}});
 oidc=await serverListen(provider);
 // Vite is already installed in the web workspace; no download or webServer hook.
 const {createServer:createVite}=await import('../../apps/web/node_modules/vite/dist/node/index.js');
 const vite=await createVite({root:'apps/web',configFile:'apps/web/vite.config.ts',server:{host:'127.0.0.1',port:0,strictPort:false,https:tls,proxy:{'/api':{target:'http://127.0.0.1:1',rewrite:p=>p.replace(/^\/api/,'')}}}});
 web=vite;await vite.listen();origin=vite.resolvedUrls!.local[0]!.replace(/\/$/,'');
 record={id,did:'https://bank.example',institutionUri:'https://bank.example',authorityCheckpointVersion:1,epoch:'1',approvalKeyVersion:1,approvalKid:issuerKey.kid,approvalPublicKey:issuerKey.publicJwk,status:'active',policy:bankPolicy,serviceV3:newServiceState(),services:{'https://center.example':{did:'https://center.example',kid:serviceKey.kid,publicKey:serviceKey.publicJwk,keyVersion:1,active:true}},members:{},intents:{},attempts:{},credentials:{},authorizations:{},consumptions:{},recipientKeys:{},audit:[]};
 for(const [s,role] of [['staff','institution'],['agent','gateway'],['recipient','recipient'],['other','recipient'],['inactive','recipient'],[longSubject,'recipient']] as const){record.members[uid(s)]={role,active:s!=='inactive',...(role==='gateway'?{serviceDid:'https://center.example'}:{}),permissions:role==='institution'?['contact.manage','delegation.manage','institution.recover','institution.suspend']:[]};await sql`INSERT INTO public.users(id,display_name,role,demo_code) VALUES(${uid(s)},'Synthetic test account',${role},${randomUUID()})`;}
 // Same name/email at a different issuer/subject never implies membership in this institution.
 await sql`INSERT INTO public.users(id,display_name,role,demo_code) VALUES(${uid('tenant-b')},'Synthetic test account','institution',${randomUUID()})`;
 records[id]={deployment,institutionId:id,sequence:'0',hash:'0'.repeat(64),epoch:'1'};
 await sql`INSERT INTO issuer_v2.institutions(id,state) VALUES(${id},${sql.json(record as unknown as postgres.JSONValue)})`;await sql`INSERT INTO issuer_v2.recovery_gate VALUES(${id},'blocked',now())`;
 const witnessKeys=await Promise.all([1,2,3,4].map(async n=>({witnessId:`w-${n}`,kid:`test-witness-${n}`,jwk:(await generateEd25519KeyPair()).publicJwk})));
 const trust={enrollmentPublicKey:issuerKey.publicJwk,supportedProtocolVersions:[3],networkId:'31337',registryAddress:`0x${'1'.repeat(40)}`,genesisHash:`0x${'0'.repeat(64)}`,registryProfile:'CALLSIGN_SERVICE_JOINT_CONFIGURATION_1',policyVersion:String(bankPolicy.version),witnessThreshold:3,witnessPublicKeys:witnessKeys,endpoints:[1,2,3,4].map(n=>({witnessId:`w-${n}`,url:'https://127.0.0.1:1'})),service:{institutionUri:record.institutionUri,issuerKid:issuerKey.kid,issuerPublicKey:issuerKey.publicJwk,approvalKeyVersion:1,serviceUri:'https://center.example',serviceKid:serviceKey.kid,servicePublicKey:serviceKey.publicJwk,serviceKeyVersion:1,policy:servicePolicy}};
 await writeFile(`${runRoot}/trust.json`,JSON.stringify(trust),{mode:0o600});await writeFile(`${runRoot}/approval-v1.json`,JSON.stringify({kid:issuerKey.kid,privateJwk:await exportSigningPrivateJwk(issuerKey),publicJwk:issuerKey.publicJwk}),{mode:0o600});
 await writeFile(`${runRoot}/sender.json`,JSON.stringify({kid:serviceKey.kid,privateJwk:await exportSigningPrivateJwk(serviceKey),publicJwk:serviceKey.publicJwk}),{flag:'wx',mode:0o600});
 Object.assign(process.env,{SENDER_KEY_PATH:`${runRoot}/sender.json`,SERVICE_URI:'https://center.example',SERVICE_PROFILE:'service',DEPLOYMENT_ID:deployment,OIDC_ISSUER:oidc,OIDC_JWKS_URL:oidc+'/jwks',OIDC_AUTHORIZATION_URL:oidc+'/authorize',OIDC_TOKEN_URL:oidc+'/token',OIDC_CLIENT_ID:'work-client',OFFICIAL_OIDC_CLIENT_ID:'official-client',OIDC_AUDIENCE:'work-audience',OFFICIAL_OIDC_AUDIENCE:'official-audience',ISSUER_KEY_DIRECTORY:runRoot,VITE_SERVICE_TRUST_SHA256:hashCanonical(trust)});
 const env=finalsEnvironment({...process.env,SERVICE_ROLE:'issuer',WEB_ORIGIN:origin,PUBLIC_DEPLOYMENT:'true',PLATFORM_INTERNAL_TOKEN:'p'.repeat(40),SENDER_INTERNAL_TOKEN:'s'.repeat(40),ISSUER_URL:'http://127.0.0.1:1',SENDER_URL:'http://127.0.0.1:1',INSTITUTION_ID:id,NETWORK_ID:'31337',REGISTRY_ADDRESS:trust.registryAddress,TRUST_BUNDLE_PATH:`${runRoot}/trust.json`});
 issuerApp=await buildFinalsServer(env,{anchor,current:async(_record,digest)=>registeredDigests.has(digest)?current:'unavailable'});const upstream=await issuerApp.listen({host:'127.0.0.1',port:0});
 senderApp=await buildFinalsServer({...env,SERVICE_ROLE:'sender',ISSUER_URL:upstream});const senderOrigin=await senderApp.listen({host:'127.0.0.1',port:0});
 platform=await buildFinalsServer({...env,SERVICE_ROLE:'platform',ISSUER_URL:upstream,SENDER_URL:senderOrigin});apiOrigin=await platform.listen({host:'127.0.0.1',port:0});
 (vite.config.server.proxy!['/api'] as {target:string}).target=apiOrigin;
},30000);
afterAll(async()=>{await web?.close();await platform?.close();await senderApp?.close();await issuerApp?.close();if(provider)await new Promise<void>(r=>provider.close(()=>r()));await sql`DELETE FROM issuer_v2.outbox WHERE institution_id=${id}`;await sql.end();if(runRoot)await writeFile(`${runRoot}/identity.json`,JSON.stringify({institution:id,deployment,screenshots:['service-mobile.png','service-desktop.png'],scope:'synthetic-accounts-local-oidc-real-http-postgres-browser-external-authority-fixtures'}),{flag:'wx',mode:0o600});});

it('uses real authorization-code/PKCE login and keeps Secure cookies, purpose and replay boundaries',async()=>{
 const r=await login('recipient');expect(r.done.status).toBe(200);expect(r.done.headers.get('set-cookie')).toContain('Secure');expect(r.done.headers.get('set-cookie')).toContain('HttpOnly');expect(r.done.headers.get('set-cookie')).toContain('SameSite=Strict');
 expect((await r.c.request('/v3/auth/me?purpose=work')).body.user.id).toBe(uid('recipient'));
 expect((await r.c.request('/v3/official-tasks')).status).toBe(401);expect((await r.c.request('/v3/auth/callback',r.body)).status).toBe(401);
 const official=await login('recipient',true,'normal',r.c);expect(official.done.status).toBe(200);expect((await r.c.request('/v3/official-tasks')).status).toBe(200);
 const stored=await sql`SELECT purpose,oidc_client_id,oidc_audience FROM public.sessions WHERE user_id=${uid('recipient')}`;expect(new Set(stored.map(s=>s.purpose))).toEqual(new Set(['work','official']));
 r.c.csrf=(await r.c.request('/v3/auth/me?purpose=work')).body.csrfToken;expect((await r.c.request('/v3/auth/logout',{purpose:'work'})).status).toBe(200);expect((await r.c.request('/v3/workspace')).status).toBe(401);expect((await r.c.request('/v3/official-tasks')).status).toBe(200);
});
it('rejects issuer/audience/client/nonce/signature/expiry mismatches and unregistered/inactive/cross-tenant subjects',async()=>{
 for(const variant of ['issuer','audience','client','nonce','signature','expired']){const r=await login('recipient',false,variant);expect(r.done.status,variant).toBe(401);expect(r.c.cookies.has('ip_session'),variant).toBe(false);}
 for(const s of ['unregistered','inactive','tenant-b'])expect((await login(s)).done.status,s).toBeGreaterThanOrEqual(400);
 const r=await login('staff');const start=await r.c.request('/v3/auth/start',{official:false});expect((await r.c.request('/v3/auth/callback',{state:start.body.url?'wrong':'invalid',code:'made-up'})).status).toBeGreaterThanOrEqual(400);
 expect((await r.c.request('/v3/login',{idToken:'unused',official:false})).status).toBe(404);
});
it('enforces CSRF, tenant assignment, strict schemas, durable idempotency and pending delegation status over HTTP',async()=>{
 const {c}=await login('staff');const body={id:'http-case',recipientId:uid('recipient'),agentId:uid('agent'),serviceUri:'https://center.example',expiresAt:Math.floor(Date.now()/1000)+3600},headers={'idempotency-key':'http-create-once'};
 expect((await c.request('/v3/intents',body,{'x-csrf-token':''})).status).toBe(403);expect((await c.request('/v3/intents',body,{origin:'https://evil.example'})).status).toBe(403);
 expect((await c.request('/v3/intents',{...body,extra:true})).status).toBe(400);expect((await c.request('/v3/intents',{...body,recipientId:uid('tenant-b')})).status).toBe(409);
 const responses=await Promise.all([c.request('/v3/intents',body,headers),c.request('/v3/intents',body,headers)]);expect(responses.map(r=>r.status)).toEqual([200,200]);expect(responses[0]!.body).toEqual(responses[1]!.body);
 expect((await c.request('/v3/intents',{...body,id:'changed-case'},headers)).status).toBe(409);
 const vc=await c.request('/v3/credentials',{serviceUri:'https://center.example'});expect(vc.status).toBe(200);expect(vc.body.state).toBe('pending');
 expect((await sql`SELECT count(*) FROM issuer_v2.outbox WHERE institution_id=${id} AND kind='intent.created'`)[0]!.count).toBe('1');
 const other=await login('other');expect((await other.c.request('/v3/workspace')).body.intents).toHaveLength(0);expect((await other.c.request('/v3/cancel',{intentId:body.id})).status).toBe(403);
 const agent=await login('agent');expect((await agent.c.request('/v3/intents',body)).status).toBe(403);
});
it('issues and consumes real signed authorizations once across concurrent HTTP requests, rejecting tampering and unavailable authority',async()=>{
 const staff=await login('staff'),agent=await login('agent'),receiver=await login('recipient'),other=await login('other');
 const vc=await staff.c.request('/v3/credentials',{serviceUri:'https://center.example'});expect(vc.status).toBe(200);
 const a=await agent.c.request('/v3/attempts',{intentId:'http-case',profile:'direct-webrtc-v3'});expect(a.status).toBe(200);
 const sender=await generateEd25519KeyPair(),recipient=await generateEd25519KeyPair();
 expect((await agent.c.request('/v3/challenge',{attemptId:a.body.id,digest:vc.body.digest,publicKey:sender.publicJwk})).status).toBe(503);registeredDigests.add(vc.body.digest);
 current='unavailable';expect((await agent.c.request('/v3/challenge',{attemptId:a.body.id,digest:vc.body.digest,publicKey:sender.publicJwk})).status).toBe(503);
 current='revoked';expect((await agent.c.request('/v3/challenge',{attemptId:a.body.id,digest:vc.body.digest,publicKey:sender.publicJwk})).status).toBe(409);current='current';
 const challenge=await agent.c.request('/v3/challenge',{attemptId:a.body.id,digest:vc.body.digest,publicKey:sender.publicJwk});expect(challenge.status).toBe(200);
 expect((await other.c.request('/v3/sender-proof',{challengeId:challenge.body.challengeId})).status).toBe(403);
 expect((await agent.c.request('/v3/sender-context',{challengeId:challenge.body.challengeId,serviceUri:'https://center.example'})).status).toBe(404);
 const signedProof=await agent.c.request('/v3/sender-proof',{challengeId:challenge.body.challengeId});expect(signedProof.status).toBe(200);expect(signedProof.body.proof).toEqual(challenge.body);
 const auth=await agent.c.request('/v3/authorizations',{challengeId:challenge.body.challengeId,proofJws:signedProof.body.jws});expect(auth.status).toBe(200);
 expect(auth.body.payload.firstConsumeBy).toBe(a.body.firstConnectBy);
 const nonce=randomUUID();expect((await other.c.request('/v3/enroll',{attemptId:a.body.id,publicKey:recipient.publicJwk,nonce})).status).toBe(404);
 expect((await receiver.c.request('/v3/enroll',{attemptId:a.body.id,publicKey:recipient.publicJwk,nonce})).status).toBe(200);
 const b:ServiceBinding={protocol:'callsign',version:3,networkId:'31337',registryAddress:`0x${'1'.repeat(40)}`,type:'ServiceSessionBinding',authorizationHash:hashCanonical(auth.body.payload),sessionId:a.body.sessionId,connectionGeneration:a.body.generation,recipientId:uid('recipient'),recipientNonce:nonce,recipientKeyHash:hashCanonical(recipient.publicJwk),senderSdpHash:'a'.repeat(64),recipientSdpHash:'b'.repeat(64),senderFingerprint:'AA:'.repeat(31)+'AA',recipientFingerprint:'BB:'.repeat(31)+'BB',callProfile:'direct-webrtc-v3',issuedAt:auth.body.payload.issuedAt,expiresAt:auth.body.payload.firstConsumeBy};
 const proof=async(role:'sender'|'recipient',key:typeof sender)=>signPayload({protocol:'callsign',version:3,networkId:b.networkId,registryAddress:b.registryAddress,type:'ServicePossession',role,authorizationId:auth.body.payload.authorizationId,sessionId:b.sessionId,bindingHash:hashCanonical(b),nonce,issuedAt:Math.floor(Date.now()/1000),expiresAt:Math.floor(Date.now()/1000)+30},{privateKey:key.privateKey,kid:hashCanonical(key.publicJwk)});
 const input={attemptId:a.body.id,binding:b,senderProof:await proof('sender',sender),recipientProof:await proof('recipient',recipient)};
 expect((await receiver.c.request('/v3/consume',{...input,binding:{...b,recipientNonce:'changed-recipient-nonce'}})).status).toBe(409);
 const results=await Promise.all([receiver.c.request('/v3/consume',input),receiver.c.request('/v3/consume',input)]);expect(results.map(r=>r.status)).toEqual([200,200]);expect(results[0]!.body).toEqual(results[1]!.body);
 const recovered=await receiver.c.request('/v3/consume',input);expect(recovered.body).toEqual(results[0]!.body);
 expect((await receiver.c.request('/v3/consume',{...input,binding:{...b,senderSdpHash:'c'.repeat(64)}})).status).toBe(409);
 expect((await sql`SELECT count(*) FROM issuer_v2.approval_consumptions WHERE institution_id=${id}`)[0]!.count).toBe('1');
 const issuerPublic=await importJWK(issuerKey.publicJwk,'EdDSA');
 expect(await verifyPayload(recovered.body.jws,issuerPublic,{type:'ServiceConsumptionReceipt',kid:issuerKey.kid,schema:serviceReceiptSchema})).toEqual(recovered.body.payload);
 const renewal=await receiver.c.request('/v3/lease-challenge',{attemptId:a.body.id});expect(renewal.status).toBe(200);const {proofs:_,...round}=renewal.body;
 const renewalProof=async(role:'sender'|'recipient',key:typeof sender)=>signPayload({protocol:'callsign',version:3,networkId:b.networkId,registryAddress:b.registryAddress,type:'LeaseRenewalProof',role,authorizationId:auth.body.payload.authorizationId,sessionId:b.sessionId,bindingHash:hashCanonical(b),...round},{privateKey:key.privateKey,kid:hashCanonical(key.publicJwk)});
 const senderRenewal=await renewalProof('sender',sender),recipientRenewal=await renewalProof('recipient',recipient);
 expect((await agent.c.request('/v3/lease-proof',{attemptId:a.body.id,jws:senderRenewal})).status).toBe(200);expect((await receiver.c.request('/v3/lease-proof',{attemptId:a.body.id,jws:recipientRenewal})).status).toBe(200);
 const lease=await receiver.c.request('/v3/lease',{attemptId:a.body.id,sequence:round.sequence,nonce:round.nonce,proofJws:recipientRenewal,senderProof:senderRenewal,choice:'pause'});expect(lease.status).toBe(200);
 expect(await verifyPayload(lease.body.lease.jws,issuerPublic,{type:'CallLease',kid:issuerKey.kid,schema:serviceLeaseSchema})).toEqual(lease.body.lease.payload);
 expect((await state()).serviceV3!.attempts[a.body.id]!.status).toBe('accepted');
 expect((await staff.c.request('/v3/cancel',{intentId:'http-case'})).status).toBe(200);expect((await receiver.c.request('/v3/outcome',{attemptId:a.body.id,outcome:'accepted',reason:'late'})).status).not.toBe(200);
 expect((await state()).serviceV3!.attempts[a.body.id]!.status).toBe('cancelled');
});
it('requires real recent auth_time and revokes active sessions through the account-management API',async()=>{
 const stale=await login('staff',false,'old-auth');expect(stale.done.status).toBe(200);expect((await stale.c.request('/v3/credentials',{serviceUri:'https://center.example'})).status).toBe(403);
 const manager=await login('staff'),target=await login('other');const input={issuer:oidc,subject:'other',displayName:'Synthetic recipient',role:'recipient',active:false,permissions:[]};
 expect((await manager.c.request('/v3/management/accounts',input)).status).toBe(200);
 expect((await target.c.request('/v3/auth/me?purpose=work')).status).toBe(401);expect((await login('other')).done.status).not.toBe(200);
 expect((await manager.c.request('/v3/management/accounts',{...input,role:'approver'})).status).toBe(400);
 expect((await manager.c.request('/v3/management/accounts',{...input,subject:'staff',role:'institution'})).status).toBe(403);
 expect((await manager.c.request('/v3/management/accounts',{...input,issuer:'https://other-tenant.example'})).status).toBe(403);
 const oldAgent=await login('agent');expect(oldAgent.done.status).toBe(200);
 expect((await manager.c.request('/v3/management/member',{userId:uid('agent'),active:true,permissions:[],serviceUri:'https://center.example'})).status).toBe(200);
 expect((await oldAgent.c.request('/v3/auth/me?purpose=work')).status).toBe(401);
 expect((await login('agent')).done.status).toBe(200);
 expect((await state()).members[uid('agent')]!.sessionGeneration).toBe(1);
});
it('blocks new work after trust publication or recovery mismatch without creating partial state',async()=>{
 const staff=await login('staff');await mutate(r=>{r.policy={...r.policy,version:r.policy.version+1};});
 const input={id:'blocked-work',recipientId:uid('recipient'),agentId:uid('agent'),serviceUri:'https://center.example',expiresAt:Math.floor(Date.now()/1000)+100};
 expect((await staff.c.request('/v3/intents',input)).status).toBe(503);expect((await state()).intents['blocked-work']).toBeUndefined();
 await mutate(r=>{r.policy=bankPolicy;});await sql`UPDATE issuer_v2.recovery_gate SET status='blocked' WHERE institution_id=${id}`;
 expect((await staff.c.request('/v3/intents',input)).status).toBe(503);
 const store=postgresAuthorityStore(process.env.ISSUER_DATABASE_URL!,{anchor,deployment});try{await store.verifyRecovery(id);}finally{await store.close();}
});
it('renders the actual service in Chromium, completes OIDC login, creates/cancels work and isolates recipient menus',async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});const context=await browser.newContext({ignoreHTTPSErrors:true});
 let allowUnauthenticated=true;const failures:string[]=[],requests:string[]=[],consoleErrors:string[]=[];const page=await context.newPage();page.on('response',r=>{if(r.status()>=400)requests.push(`${r.status()}:${new URL(r.url()).pathname}`);});page.setDefaultTimeout(6000);page.on('pageerror',e=>failures.push(e.message));page.on('console',m=>{if(m.type()==='error'){consoleErrors.push(m.text());const path=new URL(m.location().url||origin).pathname;if(!(allowUnauthenticated&&path==='/api/v3/auth/me'&&/^Failed to load resource: the server responded with a status of 401 \([^)]*\)$/.test(m.text())))failures.push(`${path}:${m.text()}`);}});
 try{
  // No device grants, fake media, route mocks, storage injection or provider calls.
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  subject='staff';mode='normal';await page.goto(origin+'/service');await page.getByRole('button',{name:'기관 계정 로그인',exact:true}).click();
  await page.getByRole('heading',{name:'기관 업무',exact:true}).waitFor({timeout:15000});allowUnauthenticated=false;
  await page.getByLabel('수신자 계정',{exact:true}).fill(uid(longSubject));await page.getByLabel('할당 상담원',{exact:true}).fill(uid('agent'));await page.getByLabel('등록된 콜센터 URI',{exact:true}).selectOption('https://center.example');
  const [createdResponse]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v3/intents')&&r.request().method()==='POST'),page.getByRole('button',{name:'연락 업무 생성',exact:true}).click()]);expect(createdResponse.status()).toBe(200);const created=(await createdResponse.json()).id as string;expect((await state()).intents[created]).toBeDefined();
  const item=page.locator('li').filter({has:page.locator('strong',{hasText:created!})});await item.getByRole('button',{name:'연락 취소',exact:true}).click();await page.getByRole('button',{name:'업무 새로고침',exact:true}).click();
  expect((await state()).intents[created!]!.status).toBe('cancelled');
  const cookies=await context.cookies(origin);const session=cookies.find(c=>c.name==='ip_session');expect(session).toMatchObject({secure:true,httpOnly:true,sameSite:'Strict'});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`${runRoot}/service-mobile.png`,fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:`${runRoot}/service-desktop.png`,fullPage:true});
  allowUnauthenticated=true;await page.getByRole('button',{name:'로그아웃 및 연결 회수',exact:true}).click();await page.getByRole('heading',{name:'기관 업무',exact:true}).waitFor({state:'hidden'});
  subject='recipient';await page.getByRole('button',{name:'기관 계정 로그인',exact:true}).click();await page.getByRole('heading',{name:'위임 및 통화',exact:true}).waitFor({timeout:15000});allowUnauthenticated=false;expect(await page.getByRole('heading',{name:'기관 업무',exact:true}).count()).toBe(0);
  expect(await page.getByText('안전 판정 아님',{exact:false}).count()).toBeGreaterThan(0);await page.getByRole('button',{name:'업무 새로고침',exact:true}).focus();expect(await page.getByRole('button',{name:'업무 새로고침',exact:true}).evaluate(e=>e===document.activeElement)).toBe(true);
  await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('BODY');
  expect(failures).toEqual([]);await writeFile(`${runRoot}/browser-observations.json`,JSON.stringify({uncaughtErrors:failures,consoleErrors,unsuccessfulRequests:requests,viewportChecks:[390,1440],routeMocking:false,externalRequestsBlocked:true,permissions:[],traceStored:false}),{flag:'wx',mode:0o600});
 }catch(error){await writeFile(`${runRoot}/browser-failure.json`,JSON.stringify({failures,consoleErrors,requests}),{flag:'wx',mode:0o600});console.error(JSON.stringify({browserFailure:{path:new URL(page.url()).pathname,alerts:await page.getByRole('alert').allTextContents(),requests,failures}}));throw error;}finally{await context.close();await browser.close();}
},45000);
