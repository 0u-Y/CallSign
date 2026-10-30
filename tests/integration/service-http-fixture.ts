// Real HTTPS OIDC + HTTP routing + PostgreSQL. Only authority/anchor are explicit external fixtures.
if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== 'integration') throw new Error('INTEGRATION_EXECUTION_BLOCKED');
import { expect } from 'vitest';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:https';
import { createHash, randomUUID } from 'node:crypto';
import { initialDirectory } from '../../packages/protocol/src/index.js';
import postgres from 'postgres';
const { SignJWT, exportJWK, importJWK, generateKeyPair } = await import(new URL('../../services/api/node_modules/jose/dist/webapi/index.js', import.meta.url).href) as typeof import('../../services/api/node_modules/jose/dist/types/index.js');
import { bankPolicy, hashCanonical, servicePolicy, generateEd25519KeyPair, exportSigningPrivateJwk, signPayload, verifyPayload, serviceReceiptSchema, serviceLeaseSchema, type ServiceBinding } from '../../packages/protocol/src/index.js';
import { buildFinalsServer } from '../../services/api/src/finals-server.js';
import { finalsEnvironment } from '../../services/api/src/finals-config.js';
import { postgresAuthorityStore } from '../../services/api/src/finals-store.js';
import { newServiceState } from '../../services/api/src/service-state.js';
import { assertAnchorMatches, type Anchor } from '../../services/api/src/consumption-anchor.js';
import type { InstitutionRecord } from '../../services/api/src/finals-model.js';

export async function createHttpFixture(options:{web?:boolean}={}){
const root=process.env.CALLSIGN_HTTP_TEST_ROOT;
if(!root||!process.env.TEST_DATABASE_URL||!/^\/callsign_test_/.test(new URL(process.env.TEST_DATABASE_URL).pathname))throw new Error('DISPOSABLE_HTTP_TEST_CONFIGURATION_REQUIRED');
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(process.env.TEST_DATABASE_URL).hostname)||['ARI_URL','TURN_URLS','DEEPGRAM_API_KEY','ANTHROPIC_API_KEY','BESU_NODE_URLS','CONSUMPTION_ANCHOR_URL'].some(k=>process.env[k]))throw new Error('LOCAL_FIXTURE_ONLY_NO_EXTERNAL_ADAPTER_CONFIG');
const sql=postgres(process.env.TEST_DATABASE_URL,{max:2});
let runRoot:string;
const id='test-http-'+randomUUID(), deployment='test:'+id;
const records:Record<string,Anchor>={};
const anchor={read:async(i:string)=>structuredClone(records[i]!),advance:async(p:Anchor,n:Anchor)=>{assertAnchorMatches(p,records[p.institutionId]!);records[p.institutionId]=structuredClone(n);}};
const control:{current:'current'|'revoked'|'unavailable';offset:number;witnessSnapshot?:import('../../packages/verifier/src/index.js').StateSnapshot;witnessFault?:'stale'|'signature'}={current:'current',offset:0};
const registeredDigests=new Set<string>();
const longSubject='recipient-'+ 'r'.repeat(100);
let issuerApp:Awaited<ReturnType<typeof buildFinalsServer>>,platform:typeof issuerApp,senderApp:typeof issuerApp;
let web:{close():Promise<void>;resolvedUrls:{local:string[]}|null};
let provider:ReturnType<typeof createServer>,origin:string,oidc:string,apiOrigin:string,record:InstitutionRecord;
let subject='staff',mode='normal',codes=new Map<string,{nonce:string;challenge:string;client:string;redirect:string;subject:string;mode:string}>();
const issuerKey=await generateEd25519KeyPair(),serviceKey=await generateEd25519KeyPair();
const signing=await generateKeyPair('RS256',{extractable:true}),jwk={...await exportJWK(signing.publicKey),kid:'test-oidc',alg:'RS256',use:'sig'};
let issuedTokens=0;const usedTokens=new Set<string>();
const audio={streams:[] as Array<{options:Parameters<import('../../services/api/src/service-audio.js').AudioProviders['stream']>[0];pushes:number;stopped:boolean}>,calls:[] as Array<{signal:AbortSignal;resolve:(r:import('../../services/api/src/risk.js').RiskAnalysis)=>void;reject:(e:Error)=>void}>};
const audioProviders:import('../../services/api/src/service-audio.js').AudioProviders={stream(options){const item={options,pushes:0,stopped:false};audio.streams.push(item);return {connect(){options.onReady?.();},push(){item.pushes++;},stop(){item.stopped=true;}};},analyze:async(_text,_policy,signal)=>new Promise((resolve,reject)=>audio.calls.push({signal,resolve,reject}))};

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

const start=async()=>{
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
   usedTokens.add(createHash('sha256').update(token).digest('hex'));res.end(JSON.stringify({id_token:token}));return;
  }res.writeHead(404);res.end('{}');
 }catch{res.writeHead(500);res.end('{}');}});
 oidc=await serverListen(provider);
 // Vite is already installed in the web workspace; no download or webServer hook.
 const {createServer:createVite}=await import('../../apps/web/node_modules/vite/dist/node/index.js');
 const vite=options.web===false?undefined:await createVite({root:'apps/web',configFile:'apps/web/vite.config.ts',server:{host:'127.0.0.1',port:0,strictPort:false,https:tls,proxy:{'/api':{target:'http://127.0.0.1:1',rewrite:p=>p.replace(/^\/api/,'')}}}});
 if(vite){web=vite;await vite.listen();origin=vite.resolvedUrls!.local[0]!.replace(/\/$/,'');}else origin='https://127.0.0.1:1';
 record={registrationState:'confirmed',directory:{hash:`0x${hashCanonical(initialDirectory)}`,version:1,entries:initialDirectory},id,did:'https://bank.example',institutionUri:'https://bank.example',authorityCheckpointVersion:1,epoch:'1',approvalKeyVersion:1,approvalKid:issuerKey.kid,approvalPublicKey:issuerKey.publicJwk,status:'active',policy:bankPolicy,serviceV3:newServiceState(),services:{'https://center.example':{did:'https://center.example',kid:serviceKey.kid,publicKey:serviceKey.publicJwk,keyVersion:1,active:true}},members:{},intents:{},attempts:{},credentials:{},authorizations:{},consumptions:{},recipientKeys:{},audit:[]};
 for(const [s,role] of [['staff','institution'],['agent','gateway'],['recipient','recipient'],['other','recipient'],['inactive','recipient'],['approver-one','approver'],['approver-two','approver'],[longSubject,'recipient']] as const){record.members[uid(s)]={role,active:s!=='inactive',...(role==='gateway'?{serviceDid:'https://center.example'}:{}),permissions:role==='institution'?['contact.manage','delegation.manage','institution.recover','institution.suspend']:role==='approver'?['governance.approve']:[]};await sql`INSERT INTO public.users(id,display_name,role,demo_code) VALUES(${uid(s)},'Synthetic test account',${role},${randomUUID()})`;}
 // Same name/email at a different issuer/subject never implies membership in this institution.
 await sql`INSERT INTO public.users(id,display_name,role,demo_code) VALUES(${uid('tenant-b')},'Synthetic test account','institution',${randomUUID()})`;
 records[id]={deployment,institutionId:id,sequence:'0',hash:'0'.repeat(64),epoch:'1'};
 await sql`INSERT INTO issuer_v2.institutions(id,state) VALUES(${id},${sql.json(record as unknown as postgres.JSONValue)})`;await sql`INSERT INTO issuer_v2.recovery_gate VALUES(${id},'blocked',now())`;
 const witnessPairs=await Promise.all([1,2,3,4].map(()=>generateEd25519KeyPair()));const witnessKeys=witnessPairs.map((key,n)=>({witnessId:`w-${n+1}`,kid:key.kid,jwk:key.publicJwk}));
 const trust={enrollmentPublicKey:issuerKey.publicJwk,supportedProtocolVersions:[1,3],networkId:'31337',registryAddress:`0x${'1'.repeat(40)}`,genesisHash:`0x${'0'.repeat(64)}`,registryProfile:'CALLSIGN_SERVICE_JOINT_CONFIGURATION_1',policyVersion:String(bankPolicy.version),witnessThreshold:3,witnessPublicKeys:witnessKeys,endpoints:[1,2,3,4].map(n=>({witnessId:`w-${n}`,url:`https://127.0.0.1:1/w-${n}`})),service:{institutionUri:record.institutionUri,issuerKid:issuerKey.kid,issuerPublicKey:issuerKey.publicJwk,approvalKeyVersion:1,serviceUri:'https://center.example',serviceKid:serviceKey.kid,servicePublicKey:serviceKey.publicJwk,serviceKeyVersion:1,policy:servicePolicy}};
 await writeFile(`${runRoot}/trust.json`,JSON.stringify(trust),{mode:0o600});await writeFile(`${runRoot}/approval-v1.json`,JSON.stringify({kid:issuerKey.kid,privateJwk:await exportSigningPrivateJwk(issuerKey),publicJwk:issuerKey.publicJwk}),{mode:0o600});
 await writeFile(`${runRoot}/sender.json`,JSON.stringify({kid:serviceKey.kid,privateJwk:await exportSigningPrivateJwk(serviceKey),publicJwk:serviceKey.publicJwk}),{flag:'wx',mode:0o600});
 Object.assign(process.env,{SENDER_KEY_PATH:`${runRoot}/sender.json`,SERVICE_URI:'https://center.example',REGISTRY_APPROVERS:'0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf,0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF,0x6813Eb9362372EEF6200f3b1dbC3f819671cBA69',SERVICE_PROFILE:'service',DEPLOYMENT_ID:deployment,OIDC_ISSUER:oidc,OIDC_JWKS_URL:oidc+'/jwks',OIDC_AUTHORIZATION_URL:oidc+'/authorize',OIDC_TOKEN_URL:oidc+'/token',OIDC_CLIENT_ID:'work-client',OFFICIAL_OIDC_CLIENT_ID:'official-client',OIDC_AUDIENCE:'work-audience',OFFICIAL_OIDC_AUDIENCE:'official-audience',ISSUER_KEY_DIRECTORY:runRoot,VITE_SERVICE_TRUST_SHA256:hashCanonical(trust)});
 const env=finalsEnvironment({...process.env,SERVICE_ROLE:'issuer',WEB_ORIGIN:origin,PUBLIC_DEPLOYMENT:'true',PLATFORM_INTERNAL_TOKEN:'p'.repeat(40),SENDER_INTERNAL_TOKEN:'s'.repeat(40),ISSUER_URL:'http://127.0.0.1:1',SENDER_URL:'http://127.0.0.1:1',INSTITUTION_ID:id,NETWORK_ID:'31337',REGISTRY_ADDRESS:trust.registryAddress,TRUST_BUNDLE_PATH:`${runRoot}/trust.json`});
 const witnessFetch:typeof fetch=async(url,init)=>{
  const u=new URL(String(url)),index=Number(/w-(\d)/.exec(u.pathname)?.[1])-1,snapshot=control.witnessSnapshot;
  if(!snapshot||!witnessPairs[index])throw new Error('EXPLICIT_WITNESS_FIXTURE_NOT_PREPARED');
  if(u.pathname.endsWith('/head'))return Response.json({blockNumber:snapshot.blockNumber,blockHash:snapshot.blockHash});
  const query=JSON.parse(String(init?.body)),value={...snapshot,institutionId:query.institutionId,delegationId:query.delegationId,...(control.witnessFault==='stale'?{blockTimestamp:Math.floor(Date.now()/1000)-30}:{})};
  return Response.json({witnessId:`w-${index+1}`,snapshot:value,jws:await signPayload(value,control.witnessFault==='signature'?issuerKey:witnessPairs[index]!)});
 };
 issuerApp=await buildFinalsServer(env,{anchor,current:async(_record,digest)=>registeredDigests.has(digest)?control.current:'unavailable',witnessFetch,audioProviders,now:()=>Math.floor(Date.now()/1000)+control.offset});const upstream=await issuerApp.listen({host:'127.0.0.1',port:0});
 senderApp=await buildFinalsServer({...env,SERVICE_ROLE:'sender',ISSUER_URL:upstream});const senderOrigin=await senderApp.listen({host:'127.0.0.1',port:0});
 platform=await buildFinalsServer({...env,SERVICE_ROLE:'platform',ISSUER_URL:upstream,SENDER_URL:senderOrigin});apiOrigin=await platform.listen({host:'127.0.0.1',port:0});
 if(vite)(vite.config.server.proxy!['/api'] as {target:string}).target=apiOrigin;
};
const close=async()=>{await web?.close();await platform?.close();await senderApp?.close();await issuerApp?.close();if(provider)await new Promise<void>(r=>provider.close(()=>r()));const owned=(await sql`SELECT state FROM issuer_v2.institutions WHERE id=${id}`)[0]?.state as InstitutionRecord|undefined;
 for(const table of ['usage_reservations','outbox','audit','approval_consumptions','consumption_journal','recovery_gate','identity_links','account_requests','notifications','notification_preferences','configuration_history','worker_status'])await sql`DELETE FROM ${sql('issuer_v2.'+table)} WHERE institution_id=${id}`;
 await sql`DELETE FROM issuer_v2.processed_chain_events WHERE deployment_id=${deployment}`;await sql`DELETE FROM issuer_v2.event_cursor WHERE deployment_id=${deployment}`;
 await sql`DELETE FROM issuer_v2.institutions WHERE id=${id}`;const userIds=Object.keys(owned?.members??record?.members??{}).concat(uid('tenant-b'));if(userIds.length){await sql`DELETE FROM public.sessions WHERE user_id IN ${sql(userIds)}`;await sql`DELETE FROM public.users WHERE id IN ${sql(userIds)}`;}
 if(usedTokens.size)await sql`DELETE FROM public.oidc_login_uses WHERE token_hash IN ${sql([...usedTokens])}`;await sql.end();if(runRoot)await writeFile(`${runRoot}/identity.json`,JSON.stringify({institution:id,deployment,screenshots:['service-mobile.png','service-desktop.png'],scope:'synthetic-accounts-local-oidc-real-http-postgres-browser-external-authority-fixtures'}),{flag:'wx',mode:0o600});};
return {start,close,sql,id,deployment,anchor,uid,client,login,state,mutate,issuerKey,serviceKey,registeredDigests,longSubject,control,audio,
 get origin(){return origin;},get apiOrigin(){return apiOrigin;},get oidc(){return oidc;},get runRoot(){return runRoot;},
 setIdentity(s:string,variant='normal'){subject=s;mode=variant;},now:()=>Math.floor(Date.now()/1000)+control.offset};
}
export type HttpFixture=Awaited<ReturnType<typeof createHttpFixture>>;
