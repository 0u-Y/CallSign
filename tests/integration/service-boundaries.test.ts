import {beforeEach,afterEach,it,expect} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium,type Page,type Browser} from '@playwright/test';
import {privateKeyToAccount} from 'viem/accounts';
import {encodeEventTopics,encodeAbiParameters,keccak256,stringToHex,type Hex} from 'viem';
import {configurationTypedData,hashCanonical,policyHash,signPayload,generateEd25519KeyPair,type ServiceBinding} from '../../packages/protocol/src/index.js';
import {ledgerEventConsumer,events} from '../../services/api/src/ledger-events.js';
import {postgresWorkerStore} from '../../services/api/src/service-worker.js';
import {analyzeWithRules} from '../../services/api/src/risk.js';
import {tokenHash} from '../../services/api/src/auth.js';
import {createHttpFixture,type HttpFixture} from './service-http-fixture.js';
const {default:WebSocket}=await import(new URL('../../services/api/node_modules/ws/wrapper.mjs',import.meta.url).href) as typeof import('ws');
const accounts=[1,2,3,4].map(n=>privateKeyToAccount(`0x${String(n).padStart(64,'0')}`)); // Public, non-operational signing fixtures.
let f:HttpFixture,browsers:Browser[]=[],pageErrors:string[]=[],browserObservations={consoleErrors:0,failedRequests:0},expectedTransportFailure=false,closing=false;
beforeEach(async()=>{expectedTransportFailure=false;closing=false;pageErrors=[];browserObservations={consoleErrors:0,failedRequests:0},expectedTransportFailure=false,closing=false;f=await createHttpFixture();await f.start();},30000);
afterEach(async()=>{closing=true;for(const b of browsers)await b.close();browsers=[];try{await writeFile(`${f.runRoot}/browser-observations.json`,JSON.stringify({...browserObservations,uncaughtPageErrors:pageErrors.length}),{mode:0o600});expect(pageErrors).toEqual([]);}finally{await f?.close();}});
async function browserPage(subject='staff'){
 let b=browsers[0];if(!b){b=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});browsers.push(b);}const c=await b.newContext({ignoreHTTPSErrors:true});
 await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());c.on('page',p=>{p.on('pageerror',e=>pageErrors.push(e.name));p.on('console',m=>{if(m.type()==='error'){browserObservations.consoleErrors++;if(!/^Failed to load resource: the server responded with a status of (401|403|409|503) \([^)]*\)$/.test(m.text())&&!(expectedTransportFailure&&m.text()==='Failed to load resource: net::ERR_FAILED'))pageErrors.push(`Unexpected browser console error: ${m.text().slice(0,200)}`);}});p.on('requestfailed',r=>{browserObservations.failedRequests++;if(!closing&&!(expectedTransportFailure&&new URL(r.url()).pathname==='/api/v3/intents'))pageErrors.push('Unexpected failed network request');});});const p=await c.newPage();p.setDefaultTimeout(6000);await browserLogin(p,subject);return p;
}
async function browserLogin(p:Page,subject:string,official=false){
 const pending=new Set<string>(),failures:string[]=[];p.on('request',r=>pending.add(r.url()));p.on('requestfinished',r=>pending.delete(r.url()));p.on('requestfailed',r=>{pending.delete(r.url());failures.push(new URL(r.url()).pathname);});p.on('response',r=>{if(r.status()>=400)failures.push(`${r.status()}:${new URL(r.url()).pathname}`);});
 f.setIdentity(subject);await p.goto(f.origin+'/service');const button=p.getByRole('button',{name:official?'공식 업무 별도 로그인':'기관 계정 로그인',exact:true});
 try{await button.waitFor();}catch(error){await writeFile(`${f.runRoot}/navigation-failure.json`,JSON.stringify({path:new URL(p.url()).pathname,title:await p.title(),visibleText:(await p.locator('body').innerText()).slice(0,1000),pageErrors,pending:[...pending].map(u=>new URL(u).pathname),failures}),{mode:0o600});throw error;}
 const [done]=await Promise.all([p.waitForResponse(r=>r.url().endsWith('/api/v3/auth/callback')),button.click()]);expect(done.status()).toBe(200);
 if(official)await p.getByRole('heading',{name:'공식 업무 확인',exact:true}).waitFor();
 else await p.getByRole('heading',{name:`내 업무 · ${f.uid(subject)}`,exact:true}).waitFor();
}
async function post(p:Page,path:string,body:unknown,key=randomUUID()){
 return p.evaluate(async({path,body,key})=>{const me=await fetch('/api/v3/auth/me?purpose=work').then(r=>r.json());const response=await fetch('/api'+path,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':me.csrfToken,'idempotency-key':key},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};},{path,body,key});
}
const signature=async(request:Parameters<typeof configurationTypedData>[2],n=0)=>accounts[n]!.signTypedData(configurationTypedData(31337,`0x${'1'.repeat(40)}`,request));
async function proposal(manager:Awaited<ReturnType<HttpFixture['login']>>,title='긴 기관명 · 공식 확인 업무'){
 const r=await f.state(),response=await manager.c.request('/v3/management/configuration',{directory:[{path:'/official',title}],policy:r.policy});expect(response.status).toBe(200);return response.body;
}
async function approve(p:{operation:string;request:Parameters<typeof configurationTypedData>[2]}){
 for(const [index,subject]of ['approver-one','approver-two'].entries()){const user=await f.login(subject);expect((await user.c.request('/v3/management/configuration/approve',{operation:p.operation,signature:await signature(p.request,index)})).status).toBe(200);}
}
async function eventFor(operation:string,fault?:'nonce'|'state'){
 const r=await f.state(),p=r.configurationProposals![operation]!,q=p.request,epoch=BigInt(q.expectedEpoch)+(q.newPolicyHash!==q.expectedPolicyHash?1n:0n);
 const cursor=await f.sql`SELECT block_number FROM issuer_v2.event_cursor WHERE deployment_id=${f.deployment}`;const height=BigInt(cursor[0]?.block_number??99)+1n,blockHash=(h:bigint)=>`0x${h.toString(16).padStart(64,'0')}` as Hex;
 const hash=blockHash(height),tx=keccak256(stringToHex(`${f.id}:${height}`));
 const log={address:`0x${'1'.repeat(40)}`,transactionHash:tx,logIndex:0,blockNumber:height,blockHash:hash,
  topics:encodeEventTopics({abi:events,eventName:'ConfigurationUpdated',args:{institutionId:keccak256(stringToHex(f.id))}}),
  data:encodeAbiParameters([{type:'uint64'},{type:'bytes32'},{type:'uint64'},{type:'uint64'},{type:'bytes32'},{type:'bool'},{type:'bytes32'}],[epoch,q.newDirectoryHash as Hex,BigInt(q.newDirectoryVersion),BigInt(q.newPolicyVersion),q.newPolicyHash as Hex,q.newPolicyHash!==q.expectedPolicyHash,(fault==='nonce'?`0x${'4'.repeat(64)}`:q.nonce) as Hex])};
 const client={getBlock:async(input:{blockNumber:bigint})=>({hash:blockHash(input.blockNumber)}),getBlockNumber:async()=>height,getLogs:async()=>[log],readContract:async(input:{functionName:string})=>input.functionName==='policyHashes'?q.newPolicyHash:[0,epoch,accounts[0]!.address,`0x${Buffer.from(f.issuerKey.publicJwk.x!,'base64url').toString('hex')}`,accounts[1]!.address,fault==='state'?`0x${'f'.repeat(64)}`:q.newDirectoryHash,BigInt(q.newDirectoryVersion),BigInt(q.newPolicyVersion),true]};
 const consumer=ledgerEventConsumer({databaseUrl:process.env.WORKER_DATABASE_URL!,client:client as unknown as Parameters<typeof ledgerEventConsumer>[0]['client'],registry:`0x${'1'.repeat(40)}`,deploymentId:f.deployment,institutionId:f.id,deploymentBlock:100n});
 try{await consumer.tick();}finally{await consumer.close();}
 f.control.witnessSnapshot={protocol:'callsign',version:1,type:'SignedStateSnapshot',networkId:'31337',registryAddress:`0x${'1'.repeat(40)}`,genesisHash:`0x${'0'.repeat(64)}`,registryProfile:'CALLSIGN_SERVICE_JOINT_CONFIGURATION_1',policyHash:q.newPolicyHash as Hex,policyVersion:q.newPolicyVersion,blockNumber:String(height),blockHash:hash,blockTimestamp:Math.floor(Date.now()/1000),institutionId:f.id,institutionState:{exists:true,status:'Active',epoch:String(epoch),approvalPublicKey:`0x${Buffer.from(f.issuerKey.publicJwk.x!,'base64url').toString('hex')}`,policyVersion:q.newPolicyVersion},delegationId:'0'.repeat(64),delegationState:{exists:false,epoch:String(epoch),gatewayPublicKey:`0x${'0'.repeat(64)}`,purposeMask:'0',validFrom:0,validUntil:0,revoked:false},directoryHash:q.newDirectoryHash as Hex,directoryVersion:q.newDirectoryVersion};
}

it('boundary: reviews and exports a real proposal, imports independent signatures, then distinguishes submission, confirmation and activation',async()=>{
 const manager=await browserPage();await manager.getByRole('button',{name:'현재 설정 불러오기',exact:true}).click();await manager.getByLabel('공식 업무 표시명',{exact:true}).fill('매우 긴 모의 금융기관 공식 업무 확인 · 변경 후 표시명');
 const proposed=manager.waitForResponse(r=>r.url().endsWith('/api/v3/management/configuration'));await manager.getByRole('button',{name:'새 변경 요청 생성 · 이전 서명 사용 안 함',exact:true}).click();const body=await (await proposed).json();const operation=body.operation as string;
 const article=manager.locator('article').filter({has:manager.getByRole('heading',{name:`공동 변경 ${operation.slice(0,12)}`,exact:true})});await article.getByText('UPDATE_CONFIGURATION',{exact:true}).waitFor();
 expect(await article.textContent()).toContain(body.request.nonce);expect(await article.textContent()).toContain(body.digest);expect(await article.getByRole('table').textContent()).toContain('변경 후 표시명');
 const downloaded=manager.waitForEvent('download');await article.getByRole('button',{name:'검토한 제안 파일 내보내기',exact:true}).click();const file=await downloaded,review=JSON.parse(await readFile((await file.path())!,'utf8'));expect(review.operation).toBe(operation);expect(review.request).toEqual(body.request);
 for(const [n,subject]of ['approver-one','approver-two'].entries()){
  const page=await browserPage(subject);await page.getByLabel('검토 요청',{exact:true}).locator('option').filter({hasText:operation.slice(0,12)}).waitFor({state:'attached'});await page.getByLabel('제안 파일 가져오기',{exact:true}).setInputFiles({name:'review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(review))});
  const sigFile={format:'callsign-configuration-signature',version:1,operation,digest:body.digest,signer:accounts[n]!.address,signature:await signature(body.request,n)};
  await expect.poll(()=>page.getByLabel('서명 파일 가져오기',{exact:true}).isEnabled(),{timeout:6000}).toBe(true);
  if(n===0){await page.getByLabel('서명 파일 가져오기',{exact:true}).setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{')});await page.getByRole('alert').waitFor();await expect.poll(()=>page.getByLabel('서명 파일 가져오기',{exact:true}).isEnabled(),{timeout:6000}).toBe(true);}
  await page.getByLabel('서명 파일 가져오기',{exact:true}).setInputFiles({name:'signature.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sigFile))});
  await page.getByRole('status').filter({hasText:'서명을 직접 확인했습니다'}).waitFor();const [approved]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v3/management/configuration/approve')),page.getByRole('button',{name:'확인한 승인 서명 등록',exact:true}).click()]);expect(approved.status()).toBe(200);
 }
 await article.getByRole('button',{name:'유효 공동 승인으로 제출',exact:true}).waitFor();await expect.poll(()=>article.getByRole('button',{name:'유효 공동 승인으로 제출',exact:true}).isEnabled(),{timeout:6000}).toBe(true);
 const submitted=manager.waitForResponse(r=>r.url().endsWith('/api/v3/management/configuration/submit'));await article.getByRole('button',{name:'유효 공동 승인으로 제출',exact:true}).click();expect((await submitted).status()).toBe(200);await article.getByText(/제출됨 · 원장 확정 대기/).waitFor();expect((await f.state()).configurationProposals![operation]!.activatedAt).toBeUndefined();
 await eventFor(operation);await article.getByRole('button',{name:'최신 원장 상태 확인 후 활성화',exact:true}).waitFor();
 const active=manager.waitForResponse(r=>r.url().endsWith('/api/v3/management/configuration/activate'));await article.getByRole('button',{name:'최신 원장 상태 확인 후 활성화',exact:true}).click();expect((await active).status()).toBe(200);await article.getByText(/활성화됨/).waitFor();expect((await f.state()).epoch).toBe('1');expect((await f.state()).configurationProposals![operation]!.activatedAt).toBeGreaterThan(0);
 await manager.setViewportSize({width:390,height:844});expect(await manager.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await manager.screenshot({path:`${f.runRoot}/joint-mobile.png`,fullPage:true});await manager.setViewportSize({width:1440,height:1000});await manager.screenshot({path:`${f.runRoot}/joint-desktop.png`,fullPage:true});
},45000);

it('boundary: rejects replayed joint signatures and forged event/state/witness evidence without prematurely activating a directory-only change',async()=>{
 const manager=await f.login('staff'),joint=await f.login('approver-one'),p=await proposal(manager),second=await proposal(manager,'다른 요청');
 const valid=await signature(p.request),badAction=await accounts[0]!.signTypedData({...configurationTypedData(31337,`0x${'1'.repeat(40)}`,p.request),message:{...configurationTypedData(31337,`0x${'1'.repeat(40)}`,p.request).message,actionType:keccak256(stringToHex('RECOVER'))}});
 for(const sig of [await signature(p.request,3),badAction,await signature({...p.request,institutionId:`0x${'f'.repeat(64)}`}),await signature({...p.request,newDirectoryHash:`0x${'e'.repeat(64)}`})])expect((await joint.c.request('/v3/management/configuration/approve',{operation:p.operation,signature:sig})).status).toBeGreaterThanOrEqual(400);
 expect((await joint.c.request('/v3/management/configuration/approve',{operation:p.operation,signature:valid})).status).toBe(200);expect((await joint.c.request('/v3/management/configuration/approve',{operation:p.operation,signature:valid})).status).toBe(409);
 expect((await joint.c.request('/v3/management/configuration/approve',{operation:second.operation,signature:valid})).status).toBeGreaterThanOrEqual(400);
 const secondJoint=await f.login('approver-two');expect((await secondJoint.c.request('/v3/management/configuration/approve',{operation:p.operation,signature:await signature(p.request,1)})).status).toBe(200);await approve(second);
 const headers={'idempotency-key':'joint-submit-once'},submitted=await manager.c.request('/v3/management/configuration/submit',{operation:p.operation},headers);expect(submitted.status).toBe(200);expect(await manager.c.request('/v3/management/configuration/submit',{operation:p.operation},headers).then(r=>r.body)).toEqual(submitted.body);
 expect((await f.sql`SELECT count(*) FROM issuer_v2.outbox WHERE institution_id=${f.id} AND kind='institution.configure'`)[0]!.count).toBe('1');
 expect((await manager.c.request('/v3/management/configuration/activate',{operation:p.operation})).status).toBe(409);
 await expect(eventFor(p.operation,'nonce')).rejects.toThrow('CONFIGURATION_EVENT_RECONCILIATION_REQUIRED');await expect(eventFor(p.operation,'state')).rejects.toThrow('CONFIGURATION_EVENT_RECONCILIATION_REQUIRED');expect((await f.state()).configurationProposals![p.operation]!.status).toBe('submitted');
 await eventFor(p.operation);f.control.witnessFault='stale';expect((await manager.c.request('/v3/management/configuration/activate',{operation:p.operation})).status).toBe(503);f.control.witnessFault='signature';expect((await manager.c.request('/v3/management/configuration/activate',{operation:p.operation})).status).toBe(503);delete f.control.witnessFault;
 f.control.witnessSnapshot!.directoryHash=`0x${'e'.repeat(64)}`;expect((await manager.c.request('/v3/management/configuration/activate',{operation:p.operation})).status).toBe(409);f.control.witnessSnapshot!.directoryHash=p.request.newDirectoryHash;
 expect((await manager.c.request('/v3/management/configuration/activate',{operation:p.operation})).status).toBe(200);
 expect((await manager.c.request('/v3/management/configuration/submit',{operation:second.operation})).status).toBe(409);
 // Expiry uses the existing authority clock injection, not altered production policy.
 const expiring=await proposal(manager,'만료된 제안');f.control.offset=601;expect((await joint.c.request('/v3/management/configuration/approve',{operation:expiring.operation,signature:await signature(expiring.request)})).status).toBe(409);f.control.offset=0;
});

it('boundary: shows durable worker failure instead of active configuration',async()=>{
 const manager=await f.login('staff'),p=await proposal(manager);await approve(p);expect((await manager.c.request('/v3/management/configuration/submit',{operation:p.operation})).status).toBe(200);
 const page=await browserPage();const worker=postgresWorkerStore(process.env.WORKER_DATABASE_URL!,async()=>{},f.id);try{let failed=false;for(let n=0;n<12;n++){const job=await worker.claim();if(!job)break;expect(job.institution_id).toBe(f.id);if(job.kind==='institution.configure'){await page.getByText(/처리 중 · 원장 확정 대기/).waitFor();await worker.retry(job,'FIXTURE_LEDGER_REJECTED',true);failed=true;break;}await worker.complete(job);}expect(failed).toBe(true);}finally{await worker.close();}
 await page.getByText(/실패 · 운영자 확인 필요/).waitFor();expect((await f.state()).configurationProposals![p.operation]!.status).toBe('failed');expect((await f.state()).configurationProposals![p.operation]!.activatedAt).toBeUndefined();
});

it('boundary: synchronizes work logout across tabs while keeping official session separate, and clears expired official tasks',async()=>{
 const prepared=await f.login('staff');expect((await prepared.c.request('/v3/intents',{id:'official-owned-task',recipientId:f.uid('recipient'),agentId:f.uid('agent'),serviceUri:'https://center.example',expiresAt:f.now()+3600})).status).toBe(200);
 const page=await browserPage('recipient'),other=await page.context().newPage();await other.goto(f.origin+'/service');await other.getByRole('heading',{name:`내 업무 · ${f.uid('recipient')}`,exact:true}).waitFor();
 // Official login in this same context creates a separate cookie and CSRF context.
 const official=await page.context().newPage();await browserLogin(official,'recipient',true);expect(await post(page,'/v3/official/confirm',{intentId:'missing',answer:'recognized'}).then(r=>r.status)).toBe(403);
 const response=page.waitForResponse(r=>r.url().endsWith('/api/v3/auth/logout'));await page.getByRole('button',{name:'로그아웃 및 연결 회수',exact:true}).click();expect((await response).status()).toBe(200);
 await other.getByRole('heading',{name:`내 업무 · ${f.uid('recipient')}`,exact:true}).waitFor({state:'hidden'});expect(await other.evaluate(()=>fetch('/api/v3/workspace').then(r=>r.status))).toBe(401);
 expect(await official.evaluate(()=>fetch('/api/v3/official-tasks').then(r=>r.status))).toBe(200);
 await official.getByRole('button',{name:'본인 거래 확인',exact:true}).waitFor();expect(await official.getByRole('button',{name:'본인 거래 확인',exact:true}).count()).toBe(1);const cookie=(await official.context().cookies()).find(c=>c.name==='official_session')!;await f.sql`UPDATE public.sessions SET expires_at=now()-interval '1 second' WHERE token_hash=${tokenHash(cookie.value)}`;
 await official.getByRole('button',{name:'다시 확인',exact:true}).click();await official.getByRole('alert').filter({hasText:'다시 로그인'}).waitFor();expect(await official.getByRole('button',{name:'본인 거래 확인',exact:true}).count()).toBe(0);
 await other.reload();expect(await other.getByRole('heading',{name:'기관 업무',exact:true}).count()).toBe(0);await browserLogin(official,'recipient',true);await official.getByRole('button',{name:'본인 거래 확인',exact:true}).waitFor();await official.getByRole('button',{name:'공식 업무 로그아웃',exact:true}).click();await expect.poll(()=>official.getByRole('button',{name:'다시 확인',exact:true}).isEnabled()).toBe(true);expect(await official.evaluate(()=>fetch('/api/v3/official-tasks').then(r=>r.status))).toBe(401);
});

it('boundary: drops a held old-account response, clears management drafts on account switch and refuses revoked buttons',async()=>{
 const owner=await f.login('staff');expect((await owner.c.request('/v3/management/accounts',{issuer:f.oidc,subject:'second-manager',displayName:'두 번째 합성 담당자',role:'institution',active:true,permissions:['contact.manage','institution.recover']})).status).toBe(200);
 const page=await browserPage();await page.getByLabel('수신자 계정',{exact:true}).fill('PRIVATE-OLD-ACCOUNT-DRAFT');
 let release!:()=>void,seen!:()=>void,fulfilled!:()=>void;const waiting=new Promise<void>(r=>seen=r),gate=new Promise<void>(r=>release=r),handled=new Promise<void>(r=>fulfilled=r);
 await page.route('**/api/v3/workspace',async route=>{const response=await route.fetch();seen();await gate;await route.fulfill({response});fulfilled();});
 await page.getByRole('button',{name:'업무 새로고침',exact:true}).click();await waiting;
 const tab=await page.context().newPage();await browserLogin(tab,'second-manager'); // Cookie changes without logging out the first tab.
 await page.getByRole('heading',{name:`내 업무 · ${f.uid('staff')}`,exact:true}).waitFor({state:'hidden'});
 release();await handled;await page.unroute('**/api/v3/workspace');await expect.poll(()=>page.getByRole('button',{name:'업무 새로고침',exact:true}).isEnabled(),{timeout:6000}).toBe(true);await page.getByRole('button',{name:'업무 새로고침',exact:true}).click();
 await page.getByRole('heading',{name:`내 업무 · ${f.uid('second-manager')}`,exact:true}).waitFor();expect(await page.getByLabel('수신자 계정',{exact:true}).inputValue()).toBe('');expect(await page.evaluate(()=>[...document.querySelectorAll('input')].some(e=>e.value==='PRIVATE-OLD-ACCOUNT-DRAFT'))).toBe(false);
 const manager=await f.login('staff');expect((await manager.c.request('/v3/management/accounts',{issuer:f.oidc,subject:'second-manager',displayName:'두 번째 합성 담당자',role:'institution',active:false,permissions:['contact.manage','institution.recover']})).status).toBe(200);
 expect(await page.evaluate(()=>fetch('/api/v3/workspace').then(r=>r.status))).toBe(401);await page.getByRole('button',{name:'업무 새로고침',exact:true}).click();await page.getByRole('heading',{name:`내 업무 · ${f.uid('second-manager')}`,exact:true}).waitFor({state:'hidden'});
 expect(await post(page,'/v3/intents',{id:'revoked-account-work',recipientId:f.uid('recipient'),agentId:f.uid('agent'),serviceUri:'https://center.example',expiresAt:f.now()+100}).then(r=>r.status)).toBe(401);
});

async function acceptedCall(){
 const manager=await f.login('staff'),agent=await f.login('agent'),receiver=await f.login('recipient'),intentId='boundary-call-'+randomUUID();
 expect((await manager.c.request('/v3/intents',{id:intentId,recipientId:f.uid('recipient'),agentId:f.uid('agent'),serviceUri:'https://center.example',expiresAt:f.now()+3600})).status).toBe(200);
 const vc=await manager.c.request('/v3/credentials',{serviceUri:'https://center.example'});f.registeredDigests.add(vc.body.digest);
 const attempt=(await agent.c.request('/v3/attempts',{intentId,profile:'direct-webrtc-v3'})).body,sender=await generateEd25519KeyPair(),recipient=await generateEd25519KeyPair();
 const challenge=await agent.c.request('/v3/challenge',{attemptId:attempt.id,digest:vc.body.digest,publicKey:sender.publicJwk}),serviceProof=await agent.c.request('/v3/sender-proof',{challengeId:challenge.body.challengeId});
 const auth=(await agent.c.request('/v3/authorizations',{challengeId:challenge.body.challengeId,proofJws:serviceProof.body.jws})).body;
 const nonce=randomUUID();await receiver.c.request('/v3/enroll',{attemptId:attempt.id,publicKey:recipient.publicJwk,nonce});
 const binding:ServiceBinding={protocol:'callsign',version:3,networkId:'31337',registryAddress:`0x${'1'.repeat(40)}`,type:'ServiceSessionBinding',authorizationHash:hashCanonical(auth.payload),sessionId:attempt.sessionId,connectionGeneration:attempt.generation,recipientId:f.uid('recipient'),recipientNonce:nonce,recipientKeyHash:hashCanonical(recipient.publicJwk),senderSdpHash:'a'.repeat(64),recipientSdpHash:'b'.repeat(64),senderFingerprint:'AA:'.repeat(31)+'AA',recipientFingerprint:'BB:'.repeat(31)+'BB',callProfile:'direct-webrtc-v3',issuedAt:f.now(),expiresAt:auth.payload.firstConsumeBy};
 const proof=async(role:'sender'|'recipient',key:typeof sender)=>signPayload({protocol:'callsign',version:3,networkId:binding.networkId,registryAddress:binding.registryAddress,type:'ServicePossession',role,authorizationId:auth.payload.authorizationId,sessionId:attempt.sessionId,bindingHash:hashCanonical(binding),nonce,issuedAt:f.now(),expiresAt:f.now()+30},{privateKey:key.privateKey,kid:hashCanonical(key.publicJwk)});
 expect((await receiver.c.request('/v3/consume',{attemptId:attempt.id,binding,senderProof:await proof('sender',sender),recipientProof:await proof('recipient',recipient)})).status).toBe(200);
 const {proofs:_,...round}=(await receiver.c.request('/v3/lease-challenge',{attemptId:attempt.id})).body;
 const renew=async(role:'sender'|'recipient',key:typeof sender)=>signPayload({protocol:'callsign',version:3,networkId:binding.networkId,registryAddress:binding.registryAddress,type:'LeaseRenewalProof',role,authorizationId:auth.payload.authorizationId,sessionId:attempt.sessionId,bindingHash:hashCanonical(binding),...round},{privateKey:key.privateKey,kid:hashCanonical(key.publicJwk)});
 const senderProof=await renew('sender',sender),proofJws=await renew('recipient',recipient);await agent.c.request('/v3/lease-proof',{attemptId:attempt.id,jws:senderProof});await receiver.c.request('/v3/lease-proof',{attemptId:attempt.id,jws:proofJws});expect((await receiver.c.request('/v3/lease',{attemptId:attempt.id,sequence:round.sequence,nonce:round.nonce,senderProof,proofJws})).status).toBe(200);
 return {manager,agent,receiver,intentId,attempt};
}
function socket(client:Awaited<ReturnType<HttpFixture['login']>>['c'],attemptId:string){
 const ws=new WebSocket(f.apiOrigin.replace('http:','ws:')+'/v3/audio?attemptId='+attemptId,{headers:{origin:f.origin,cookie:[...client.cookies].map(([k,v])=>`${k}=${v}`).join('; ')}});
 const messages:any[]=[];ws.on('message',raw=>messages.push(JSON.parse(String(raw))));return {ws,messages};
}
it('boundary: stops analysis transport and late model results after consent withdrawal, then isolates new revisions and provider failure',async()=>{
 const call=await acceptedCall(),denied=socket(call.receiver.c,call.attempt.id);await expect.poll(()=>denied.ws.readyState).toBe(WebSocket.CLOSED);expect(f.audio.streams).toHaveLength(0);
 expect((await call.receiver.c.request('/v3/consent',{attemptId:call.attempt.id,granted:true})).status).toBe(200);
 const first=socket(call.receiver.c,call.attempt.id);await expect.poll(()=>first.messages.some(m=>m.type==='ready')).toBe(true);first.ws.send(JSON.stringify({type:'consent',consent:true}));await expect.poll(()=>f.audio.streams.length).toBe(1);
 const stream=f.audio.streams[0]!;stream.options.onRevision({streamId:stream.options.streamId,segmentId:'seg',revision:1,final:true,text:'OTP를 알려주세요.',source:'remote'});await expect.poll(()=>f.audio.calls.length).toBe(1);
 expect((await call.receiver.c.request('/v3/consent',{attemptId:call.attempt.id,granted:false})).status).toBe(200);first.ws.send(Buffer.from([0,0]));await expect.poll(()=>stream.stopped).toBe(true);expect(stream.pushes).toBe(0);expect(f.audio.calls[0]!.signal.aborted).toBe(true);
 const before=first.messages.filter(m=>m.type==='risk').length;f.audio.calls[0]!.resolve(analyzeWithRules('OTP를 알려주세요.'));await expect.poll(()=>first.ws.readyState).toBe(WebSocket.CLOSED);expect(first.messages.filter(m=>m.type==='risk')).toHaveLength(before);
 await call.receiver.c.request('/v3/consent',{attemptId:call.attempt.id,granted:true});const next=socket(call.receiver.c,call.attempt.id);await expect.poll(()=>next.messages.some(m=>m.type==='ready')).toBe(true);next.ws.send(JSON.stringify({type:'consent',consent:true}));await expect.poll(()=>f.audio.streams.length).toBe(2);
 const current=f.audio.streams[1]!,revision=(n:number,text:string,final=true)=>current.options.onRevision({streamId:current.options.streamId,segmentId:'new-seg',revision:n,final,text,source:'remote'});
 revision(1,'OTP',false);revision(2,'OTP를 알려주세요.');await expect.poll(()=>f.audio.calls.length).toBe(2);revision(3,'OTP를 알려주지 마세요.');await expect.poll(()=>f.audio.calls.length).toBe(3);revision(1,'OTP를 알려주세요.');
 f.audio.calls[1]!.resolve(analyzeWithRules('OTP를 알려주세요.'));f.audio.calls[2]!.reject(new Error('FAKE_PROVIDER_UNAVAILABLE'));
 await expect.poll(()=>next.messages.some(m=>m.type==='risk'&&m.event.revision===3&&m.event.status==='unavailable')).toBe(true);expect(next.messages.filter(m=>m.type==='risk').at(-1).event.signals).toEqual([]);
 await call.receiver.c.request('/v3/auth/logout',{purpose:'work'});await expect.poll(()=>next.ws.readyState).toBe(WebSocket.CLOSED);expect(current.stopped).toBe(true);
},20000);

it('boundary: separates first-connect expiry from lease expiry and never reactivates terminal attempts',async()=>{
 const call=await acceptedCall();f.control.offset=31;expect((await call.receiver.c.request('/v3/lease-challenge',{attemptId:call.attempt.id})).status).toBe(409);
 expect((await call.receiver.c.request('/v3/outcome',{attemptId:call.attempt.id,outcome:'ended',reason:'expired-session'})).status).toBe(200);expect((await call.receiver.c.request('/v3/enroll',{attemptId:call.attempt.id,nonce:randomUUID(),publicKey:(await generateEd25519KeyPair()).publicJwk})).status).toBe(409);
 f.control.offset=0;const newAttempt=(await call.agent.c.request('/v3/attempts',{intentId:call.intentId,profile:'direct-webrtc-v3'})).body;f.control.offset=121;
 expect((await call.agent.c.request('/v3/challenge',{attemptId:newAttempt.id,digest:[...f.registeredDigests][0],publicKey:(await generateEd25519KeyPair()).publicJwk})).status).toBe(409);
 expect((await call.receiver.c.request('/v3/outcome',{attemptId:newAttempt.id,outcome:'no-answer',reason:'ring-expired'})).status).toBe(200);expect((await f.state()).serviceV3!.attempts[newAttempt.id]!.status).toBe('no-answer');
});

it('boundary: preserves a live synthetic lease for display changes but revokes it on confirmed policy generation changes',async()=>{
 const call=await acceptedCall(),directory=await proposal(call.manager,'표시명만 변경');await approve(directory);await call.manager.c.request('/v3/management/configuration/submit',{operation:directory.operation});await eventFor(directory.operation);
 expect((await call.manager.c.request('/v3/management/configuration/activate',{operation:directory.operation})).status).toBe(200);expect((await f.state()).serviceV3!.attempts[call.attempt.id]!.status).toBe('accepted');
 const record=await f.state(),contents={directory:record.directory!.entries,policy:{...record.policy,version:record.policy.version+1,allowedQuestions:[...record.policy.allowedQuestions,'공식 경로에서 별도 확인하셨나요?']}};
 const p=(await call.manager.c.request('/v3/management/configuration',contents)).body;await approve(p);expect((await call.manager.c.request('/v3/management/configuration/submit',{operation:p.operation})).status).toBe(200);
 expect((await f.state()).epoch).toBe('1');await eventFor(p.operation);const confirmed=await f.state();expect(confirmed.policy.version).toBe(1);expect(confirmed.serviceV3!.attempts[call.attempt.id]!.status).toBe('cancelled');
 expect((await call.manager.c.request('/v3/management/configuration/activate',{operation:p.operation})).status).toBe(200);const active=await f.state();expect(active.epoch).toBe('2');expect(active.policy.version).toBe(2);
 expect((await call.receiver.c.request('/v3/lease-challenge',{attemptId:call.attempt.id})).status).toBe(409);
 expect((await call.agent.c.request('/v3/attempts',{intentId:call.intentId,profile:'direct-webrtc-v3'})).status).toBeGreaterThanOrEqual(400);
 await writeFile(`${f.runRoot}/policy-observations.json`,JSON.stringify({displayChangePreservedLease:true,submittedPolicyVersion:1,confirmedOldCall:'cancelled',activeEpoch:'2',activePolicyVersion:2,oldLeaseRejected:true,chainSource:'fixture logs plus real SQL event consumer and real witness signature verifier'}),{flag:'wx',mode:0o600});
});

it('boundary: disables ungranted manager actions, rejects their HTTP bypass and clears work expiry on reload',async()=>{
 const owner=await f.login('staff');expect((await owner.c.request('/v3/management/accounts',{issuer:f.oidc,subject:'read-only-manager',displayName:'조회 전용 합성 담당자',role:'institution',active:true,permissions:[]})).status).toBe(200);
 const page=await browserPage('read-only-manager');await page.getByLabel('수신자 계정',{exact:true}).fill(f.uid('recipient'));await page.getByLabel('할당 상담원',{exact:true}).fill(f.uid('agent'));await page.getByLabel('등록된 콜센터 URI',{exact:true}).selectOption('https://center.example');
 expect(await page.getByRole('button',{name:'연락 업무 생성',exact:true}).isEnabled()).toBe(false);expect(await page.getByRole('button',{name:'업무 위임 증서 발급',exact:true}).isEnabled()).toBe(false);
 expect((await post(page,'/v3/intents',{id:'forbidden-work',recipientId:f.uid('recipient'),agentId:f.uid('agent'),serviceUri:'https://center.example',expiresAt:f.now()+100})).status).toBe(403);
 const cookie=(await page.context().cookies()).find(c=>c.name==='ip_session')!;await f.sql`UPDATE public.sessions SET expires_at=now()-interval '1 second' WHERE token_hash=${tokenHash(cookie.value)}`;
 await page.getByRole('button',{name:'업무 새로고침',exact:true}).click();await page.getByRole('heading',{name:'기관 업무',exact:true}).waitFor({state:'hidden'});await page.reload();await page.getByRole('alert').waitFor();expect(await page.getByRole('heading',{name:'기관 업무',exact:true}).count()).toBe(0);
});

it('boundary: recovers a committed creation after a lost response without duplicating the intent and cancels it safely',async()=>{
 expectedTransportFailure=true;const page=await browserPage();await page.getByLabel('수신자 계정',{exact:true}).fill(f.uid('recipient'));await page.getByLabel('할당 상담원',{exact:true}).fill(f.uid('agent'));await page.getByLabel('등록된 콜센터 URI',{exact:true}).selectOption('https://center.example');
 const requests:Array<{key:string;body:any}>=[];let committed!:()=>void,release!:()=>void;const stored=new Promise<void>(r=>committed=r),gate=new Promise<void>(r=>release=r);
 await page.route('**/api/v3/intents',async route=>{requests.push({key:route.request().headers()['idempotency-key']!,body:route.request().postDataJSON()});const response=await route.fetch();expect(response.status()).toBe(200);if(requests.length===1){committed();await gate;await route.abort('failed');}else await route.fulfill({response});});
 const button=page.getByRole('button',{name:'연락 업무 생성',exact:true});await button.click();await stored;expect(await button.isEnabled()).toBe(false);expect(requests).toHaveLength(1);release();await page.getByRole('alert').waitFor();await expect.poll(()=>button.isEnabled()).toBe(true);await button.click();await expect.poll(()=>requests.length).toBe(2);await expect.poll(()=>button.isEnabled()).toBe(true);
 expect(requests[1]).toEqual(requests[0]);const record=await f.state(),created=requests[0]!.body.id;expect(Object.values(record.intents).filter(i=>i.id===created)).toHaveLength(1);
 const row=page.getByRole('listitem').filter({has:page.getByText(created,{exact:true})});await row.getByRole('button',{name:'연락 취소',exact:true}).click();await expect.poll(async()=>(await f.state()).intents[created]?.status).toBe('cancelled');await expect.poll(()=>row.getByRole('button',{name:'연락 취소',exact:true}).isEnabled()).toBe(false);
});
