// Existing success-path regression; boundary scenarios use the same isolated fixture in a separate file.
import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {bankPolicy,hashCanonical,generateEd25519KeyPair,signPayload,verifyPayload,serviceReceiptSchema,serviceLeaseSchema,type ServiceBinding} from '../../packages/protocol/src/index.js';
import {postgresAuthorityStore} from '../../services/api/src/finals-store.js';
import {createHttpFixture} from './service-http-fixture.js';
const {importJWK}=await import(new URL('../../services/api/node_modules/jose/dist/webapi/index.js',import.meta.url).href) as typeof import('../../services/api/node_modules/jose/dist/types/index.js');
const f=await createHttpFixture({web:process.env.CALLSIGN_HTTP_API_ONLY!=='true'});
const {sql,id,deployment,anchor,uid,client,login,state,mutate,issuerKey,serviceKey,registeredDigests,longSubject}=f;
let origin:string,runRoot:string,oidc:string;
beforeAll(async()=>{await f.start();origin=f.origin;runRoot=f.runRoot;oidc=f.oidc;},30000);
afterAll(()=>f.close());
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
 f.control.current='unavailable';expect((await agent.c.request('/v3/challenge',{attemptId:a.body.id,digest:vc.body.digest,publicKey:sender.publicJwk})).status).toBe(503);
 f.control.current='revoked';expect((await agent.c.request('/v3/challenge',{attemptId:a.body.id,digest:vc.body.digest,publicKey:sender.publicJwk})).status).toBe(409);f.control.current='current';
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
  f.setIdentity('staff');await page.goto(origin+'/service');await page.getByRole('button',{name:'기관 계정 로그인',exact:true}).click();
  await page.getByRole('heading',{name:'기관 업무',exact:true}).waitFor({timeout:15000});allowUnauthenticated=false;
  await page.getByLabel('수신자 계정',{exact:true}).fill(uid(longSubject));await page.getByLabel('할당 상담원',{exact:true}).fill(uid('agent'));await page.getByLabel('등록된 콜센터 URI',{exact:true}).selectOption('https://center.example');
  const [createdResponse]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v3/intents')&&r.request().method()==='POST'),page.getByRole('button',{name:'연락 업무 생성',exact:true}).click()]);expect(createdResponse.status()).toBe(200);const created=(await createdResponse.json()).id as string;expect((await state()).intents[created]).toBeDefined();
  const item=page.locator('li').filter({has:page.locator('strong',{hasText:created!})});await item.getByRole('button',{name:'연락 취소',exact:true}).click();await page.getByRole('button',{name:'업무 새로고침',exact:true}).click();
  expect((await state()).intents[created!]!.status).toBe('cancelled');
  const cookies=await context.cookies(origin);const session=cookies.find(c=>c.name==='ip_session');expect(session).toMatchObject({secure:true,httpOnly:true,sameSite:'Strict'});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`${runRoot}/service-mobile.png`,fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:`${runRoot}/service-desktop.png`,fullPage:true});
  allowUnauthenticated=true;await page.getByRole('button',{name:'로그아웃 및 연결 회수',exact:true}).click();await page.getByRole('heading',{name:'기관 업무',exact:true}).waitFor({state:'hidden'});
  f.setIdentity('recipient');await page.getByRole('button',{name:'기관 계정 로그인',exact:true}).click();await page.getByRole('heading',{name:'위임 및 통화',exact:true}).waitFor({timeout:15000});allowUnauthenticated=false;expect(await page.getByRole('heading',{name:'기관 업무',exact:true}).count()).toBe(0);
  expect(await page.getByText('안전 판정 아님',{exact:false}).count()).toBeGreaterThan(0);await page.getByRole('button',{name:'업무 새로고침',exact:true}).focus();expect(await page.getByRole('button',{name:'업무 새로고침',exact:true}).evaluate(e=>e===document.activeElement)).toBe(true);
  await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('BODY');
  expect(failures).toEqual([]);await writeFile(`${runRoot}/browser-observations.json`,JSON.stringify({uncaughtErrors:failures,consoleErrors,unsuccessfulRequests:requests,viewportChecks:[390,1440],routeMocking:false,externalRequestsBlocked:true,permissions:[],traceStored:false}),{flag:'wx',mode:0o600});
 }catch(error){await writeFile(`${runRoot}/browser-failure.json`,JSON.stringify({failures,consoleErrors,requests}),{flag:'wx',mode:0o600});console.error(JSON.stringify({browserFailure:{path:new URL(page.url()).pathname,alerts:await page.getByRole('alert').allTextContents(),requests,failures}}));throw error;}finally{await context.close();await browser.close();}
},45000);
