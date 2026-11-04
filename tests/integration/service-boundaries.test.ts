import {beforeEach,afterEach,it,expect} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium,type Page,type Browser,type BrowserContextOptions} from '@playwright/test';
import {privateKeyToAccount} from 'viem/accounts';
import {encodeEventTopics,encodeAbiParameters,keccak256,stringToHex,type Hex} from 'viem';
import {configurationTypedData,hashCanonical,policyHash,signPayload,generateEd25519KeyPair,type ServiceBinding} from '../../packages/protocol/src/index.js';
import {ledgerEventConsumer,events} from '../../services/api/src/ledger-events.js';
import {postgresWorkerStore} from '../../services/api/src/service-worker.js';
import {analyzeWithRules} from '../../services/api/src/risk.js';
import {tokenHash} from '../../services/api/src/auth.js';
import {postgresAuthorityStore} from '../../services/api/src/finals-store.js';
import {ServiceAuthority} from '../../services/api/src/service-authority.js';
import {PbxRuntime} from '../../services/api/src/pbx-runtime.js';
import {AriClient,AsteriskBridge} from '../../services/api/src/asterisk.js';
import {analysisScopes,postgresQuotaStore} from '../../services/api/src/quota.js';
import {createHttpFixture,httpBrowserOptions,type HttpFixture} from './service-http-fixture.js';
const {default:WebSocket}=await import(new URL('../../services/api/node_modules/ws/wrapper.mjs',import.meta.url).href) as typeof import('ws');
const accounts=[1,2,3,4].map(n=>privateKeyToAccount(`0x${String(n).padStart(64,'0')}`)); // Public, non-operational signing fixtures.
let f:HttpFixture,browsers:Browser[]=[],pageErrors:string[]=[],browserObservations={consoleErrors:0,failedRequests:0},expectedTransportFailure=false,closing=false;
beforeEach(async()=>{expectedTransportFailure=false;closing=false;pageErrors=[];browserObservations={consoleErrors:0,failedRequests:0},expectedTransportFailure=false,closing=false;f=await createHttpFixture({web:process.env.CALLSIGN_HTTP_API_ONLY!=='true'});await f.start();},30000);
afterEach(async()=>{closing=true;for(const b of browsers)await b.close();browsers=[];try{await writeFile(`${f.runRoot}/browser-observations.json`,JSON.stringify({...browserObservations,uncaughtPageErrors:pageErrors.length}),{mode:0o600});expect(pageErrors).toEqual([]);}finally{await f?.close();}});
async function browserPage(subject='staff',contextOptions:BrowserContextOptions={}){
 let b=browsers[0];if(!b){b=await chromium.launch(await httpBrowserOptions());browsers.push(b);}const c=await b.newContext(contextOptions);
 await c.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());c.on('page',p=>{p.on('pageerror',e=>pageErrors.push(e.name));p.on('console',m=>{if(m.type()==='error'){browserObservations.consoleErrors++;if(!/^Failed to load resource: the server responded with a status of (401|403|409|503) \([^)]*\)$/.test(m.text())&&!(expectedTransportFailure&&m.text()==='Failed to load resource: net::ERR_FAILED'))pageErrors.push(`Unexpected browser console error: ${m.text().slice(0,200)}`);}});p.on('requestfailed',r=>{browserObservations.failedRequests++;if(!closing&&!(expectedTransportFailure&&new URL(r.url()).pathname==='/api/v3/intents'))pageErrors.push('Unexpected failed network request');});});const p=await c.newPage();p.setDefaultTimeout(6000);await browserLogin(p,subject);return p;
}
async function browserLogin(p:Page,subject:string,official=false){
 const pending=new Set<string>(),failures:string[]=[];p.on('request',r=>pending.add(r.url()));p.on('requestfinished',r=>pending.delete(r.url()));p.on('requestfailed',r=>{pending.delete(r.url());failures.push(new URL(r.url()).pathname);});p.on('response',r=>{if(r.status()>=400)failures.push(`${r.status()}:${new URL(r.url()).pathname}`);});
 f.setIdentity(subject);await p.goto(f.origin+'/service');const button=p.getByRole('button',{name:official?'공식 업무 별도 로그인':'기관 계정 로그인',exact:true});
 try{await button.waitFor();}catch(error){await writeFile(`${f.runRoot}/navigation-failure.json`,JSON.stringify({path:new URL(p.url()).pathname,title:await p.title(),visibleText:(await p.locator('body').innerText()).slice(0,1000),pageErrors,pending:[...pending].map(u=>new URL(u).pathname),failures}),{mode:0o600});throw error;}
 const [done]=await Promise.all([p.waitForResponse(r=>r.url().endsWith('/api/v3/auth/callback')),button.click()]);expect(done.status()).toBe(200);
 if(official)await p.getByRole('heading',{name:'공식 업무 확인',exact:true}).waitFor();
 else {await p.getByRole('heading',{name:subject==='agent'?'배정된 연락 업무':['recipient','other'].includes(subject)?'나에게 온 연락':'기관 연락 업무',exact:true}).waitFor();await p.getByText('내 계정 식별자',{exact:true}).click();await expect.poll(()=>p.getByText('내 계정 식별자',{exact:true}).locator('..').innerText()).toContain(f.uid(subject));await p.getByText('내 계정 식별자',{exact:true}).click();}
}
async function captureUi(page:Page,label:string){
 const previous=page.viewportSize();for(const width of [1366,390]){await page.setViewportSize({width,height:768});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${f.runRoot}/${label}-${width}.png`,fullPage:true});}if(previous)await page.setViewportSize(previous);
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
  await page.getByRole('status').filter({hasText:'서명을 직접 확인했습니다'}).waitFor();const [approved]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v3/management/configuration/approve')),page.getByRole('button',{name:'확인한 승인 서명 등록',exact:true}).click()]);expect(approved.status()).toBe(200);await captureUi(page,'approver-'+n);
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
 const page=await browserPage('recipient'),other=await page.context().newPage();await other.goto(f.origin+'/service');await other.getByRole('heading',{name:'나에게 온 연락',exact:true}).waitFor();
 // Official login in this same context creates a separate cookie and CSRF context.
 const official=await page.context().newPage();await browserLogin(official,'recipient',true);expect(await post(page,'/v3/official/confirm',{intentId:'missing',answer:'recognized'}).then(r=>r.status)).toBe(403);
 const response=page.waitForResponse(r=>r.url().endsWith('/api/v3/auth/logout'));await page.getByRole('button',{name:'로그아웃 및 연결 회수',exact:true}).click();expect((await response).status()).toBe(200);
 await other.getByRole('heading',{name:'나에게 온 연락',exact:true}).waitFor({state:'hidden'});expect(await other.evaluate(()=>fetch('/api/v3/workspace').then(r=>r.status))).toBe(401);
 expect(await official.evaluate(()=>fetch('/api/v3/official-tasks').then(r=>r.status))).toBe(200);
 await official.getByRole('button',{name:'본인 거래 확인',exact:true}).waitFor();await captureUi(official,'official-normal');
 for(const status of [503,403]){await official.route('**/api/v3/official-tasks',route=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:{code:'PRIVATE_INTERNAL_CODE',message:'PRIVATE_INTERNAL_MESSAGE'}})}));await official.getByRole('button',{name:'다시 확인',exact:true}).click();await official.getByRole('alert').filter({hasText:status===403?'권한이 없습니다':'확인하지 못했습니다'}).waitFor();expect(await official.getByRole('button',{name:'본인 거래 확인',exact:true}).count()).toBe(0);expect(await official.locator('body').innerText()).not.toContain('PRIVATE_INTERNAL');await captureUi(official,'official-error-'+status);await official.unroute('**/api/v3/official-tasks');await official.getByRole('button',{name:'다시 확인',exact:true}).click();await official.getByRole('button',{name:'본인 거래 확인',exact:true}).waitFor();}
 expect(await official.getByRole('button',{name:'본인 거래 확인',exact:true}).count()).toBe(1);const cookie=(await official.context().cookies()).find(c=>c.name==='official_session')!;await f.sql`UPDATE public.sessions SET expires_at=now()-interval '1 second' WHERE token_hash=${tokenHash(cookie.value)}`;
 await official.getByRole('button',{name:'다시 확인',exact:true}).click();await official.getByRole('alert').filter({hasText:'다시 로그인'}).waitFor();await captureUi(official,'official-expired');expect(await official.getByRole('button',{name:'본인 거래 확인',exact:true}).count()).toBe(0);
 await other.reload();expect(await other.getByRole('heading',{name:'기관 업무',exact:true}).count()).toBe(0);await browserLogin(official,'recipient',true);await official.getByRole('button',{name:'본인 거래 확인',exact:true}).waitFor();await official.getByRole('button',{name:'공식 업무 로그아웃',exact:true}).click();await expect.poll(()=>official.getByRole('button',{name:'다시 확인',exact:true}).isEnabled()).toBe(true);expect(await official.evaluate(()=>fetch('/api/v3/official-tasks').then(r=>r.status))).toBe(401);
});

it('boundary: drops a held old-account response, clears management drafts on account switch and refuses revoked buttons',async()=>{
 const owner=await f.login('staff');expect((await owner.c.request('/v3/management/accounts',{issuer:f.oidc,subject:'second-manager',displayName:'두 번째 합성 담당자',role:'institution',active:true,permissions:['contact.manage','institution.recover']})).status).toBe(200);
 const page=await browserPage();await page.getByLabel('수신자 계정',{exact:true}).fill('PRIVATE-OLD-ACCOUNT-DRAFT');
 let release!:()=>void,seen!:()=>void,fulfilled!:()=>void;const waiting=new Promise<void>(r=>seen=r),gate=new Promise<void>(r=>release=r),handled=new Promise<void>(r=>fulfilled=r);
 await page.route('**/api/v3/workspace',async route=>{const response=await route.fetch();seen();await gate;await route.fulfill({response});fulfilled();});
 await page.getByRole('button',{name:'업무 새로고침',exact:true}).click();await waiting;
 const tab=await page.context().newPage();await browserLogin(tab,'second-manager'); // Cookie changes without logging out the first tab.
 await page.getByRole('heading',{name:'기관 연락 업무',exact:true}).waitFor({state:'hidden'});
 release();await handled;await page.unroute('**/api/v3/workspace');await expect.poll(()=>page.getByRole('button',{name:'업무 새로고침',exact:true}).isEnabled(),{timeout:6000}).toBe(true);await page.getByRole('button',{name:'업무 새로고침',exact:true}).click();
 await page.getByRole('heading',{name:'기관 연락 업무',exact:true}).waitFor();await page.getByText('내 계정 식별자',{exact:true}).click();await expect.poll(()=>page.getByText('내 계정 식별자',{exact:true}).locator('..').innerText()).toContain(f.uid('second-manager'));expect(await page.getByText('내 계정 식별자',{exact:true}).locator('..').innerText()).not.toContain(f.uid('staff'));await page.getByText('내 계정 식별자',{exact:true}).click();expect(await page.getByLabel('수신자 계정',{exact:true}).inputValue()).toBe('');expect(await page.evaluate(()=>[...document.querySelectorAll('input')].some(e=>e.value==='PRIVATE-OLD-ACCOUNT-DRAFT'))).toBe(false);
 const manager=await f.login('staff');expect((await manager.c.request('/v3/management/accounts',{issuer:f.oidc,subject:'second-manager',displayName:'두 번째 합성 담당자',role:'institution',active:false,permissions:['contact.manage','institution.recover']})).status).toBe(200);
 expect(await page.evaluate(()=>fetch('/api/v3/workspace').then(r=>r.status))).toBe(401);await page.getByRole('button',{name:'업무 새로고침',exact:true}).click();await page.getByRole('heading',{name:'기관 연락 업무',exact:true}).waitFor({state:'hidden'});
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
 revision(1,'OTP',false);revision(2,'OTP를 알려주세요.');await expect.poll(()=>f.audio.calls.length).toBe(2);revision(3,'OTP를 알려주지 마세요.');await expect.poll(()=>f.audio.calls[1]!.signal.aborted).toBe(true);revision(1,'OTP를 알려주세요.');
 // The bounded context analyser serializes/coalesces revisions, even if an adapter ignores abort.
 f.audio.calls[1]!.resolve(analyzeWithRules('OTP를 알려주세요.'));await expect.poll(()=>f.audio.calls.length).toBe(3);f.audio.calls[2]!.reject(new Error('FAKE_PROVIDER_UNAVAILABLE'));
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
 const row=page.getByRole('list',{name:'연락 업무 목록',exact:true}).getByRole('listitem').filter({hasText:created});await row.getByRole('button',{name:'연락 취소',exact:true}).click();await expect.poll(async()=>(await f.state()).intents[created]?.status).toBe('cancelled');await expect.poll(()=>row.getByRole('button',{name:'연락 취소',exact:true}).isEnabled()).toBe(false);
});

it.each(['lease-policy','connection-generation'] as const)('boundary: stops a pending model after %s changes without publishing the late result',async change=>{
 const call=await acceptedCall();await call.receiver.c.request('/v3/consent',{attemptId:call.attempt.id,granted:true});const active=socket(call.receiver.c,call.attempt.id);await expect.poll(()=>active.messages.some(m=>m.type==='ready')).toBe(true);active.ws.send(JSON.stringify({type:'consent',consent:true}));await expect.poll(()=>f.audio.streams.length).toBe(1);
 const stream=f.audio.streams[0]!;stream.options.onRevision({streamId:stream.options.streamId,segmentId:'pending',revision:1,final:true,text:'OTP를 알려주세요.',source:'remote'});await expect.poll(()=>f.audio.calls.length).toBe(1);
 await f.mutate(record=>{const t=record.serviceV3!.attempts[call.attempt.id]!;if(change==='lease-policy')t.lease!.payload.policyHash='0'.repeat(64);else t.generation='changed-generation';});active.ws.send(Buffer.from([0]));await expect.poll(()=>stream.stopped).toBe(true);expect(f.audio.calls[0]!.signal.aborted).toBe(true);
 const before=active.messages.filter(m=>m.type==='risk').length;f.audio.calls[0]!.resolve(analyzeWithRules('OTP를 알려주세요.'));await expect.poll(()=>active.ws.readyState).toBe(WebSocket.CLOSED);expect(active.messages.filter(m=>m.type==='risk')).toHaveLength(before);
});

async function analysisCall(){
 const call=await acceptedCall();expect((await call.receiver.c.request('/v3/consent',{attemptId:call.attempt.id,granted:true})).status).toBe(200);
 const active=socket(call.receiver.c,call.attempt.id);await expect.poll(()=>active.messages.some(m=>m.type==='ready')).toBe(true);active.ws.send(JSON.stringify({type:'consent',consent:true}));await expect.poll(()=>f.audio.streams.length).toBe(1);
 const stream=f.audio.streams[0]!,revision=(n:number,text:string,id='purpose')=>stream.options.onRevision({streamId:stream.options.streamId,segmentId:id,revision:n,final:true,text,source:'remote'});
 return {...call,...active,stream,revision};
}
const purposeResult=(text:string,relation:'suspected'|'not-detected'|'undetermined'='not-detected',evidenceSpan='')=>({...analyzeWithRules(text),purpose:{relation,evidenceSpan,reason:relation==='suspected'?'승인 목적과 다른 상품 권유':'분석 범위의 관계만 표시'}});
it('analysis HTTP/WS: preserves rule warnings alongside purpose results and retracts corrected, duplicate and reversed evidence',async()=>{
 const c=await analysisCall();try{
  const text='OTP를 알려주세요. 대출 상품을 안내하겠습니다.';c.revision(1,text);await expect.poll(()=>f.audio.calls.length).toBe(1);
  expect(hashCanonical(f.audio.calls[0]!.policy)).toBe(hashCanonical((await f.state()).policy));
  f.audio.calls[0]!.resolve(purposeResult(text,'suspected','대출 상품을 안내하겠습니다.'));
  await expect.poll(()=>c.messages.findLast(m=>m.type==='risk')?.event.purpose.relation).toBe('suspected');expect(c.messages.findLast(m=>m.type==='risk').event.signals.length).toBeGreaterThan(0);
  c.revision(2,text);await expect.poll(()=>f.audio.calls.length).toBe(2);f.audio.calls[1]!.resolve(purposeResult(text));
  await expect.poll(()=>c.messages.findLast(m=>m.type==='risk')?.event.purpose.relation).toBe('not-detected');expect(c.messages.findLast(m=>m.type==='risk').event.signals.length).toBeGreaterThan(0);
  c.revision(3,'OTP를 알려주지 마세요.');await expect.poll(()=>f.audio.calls.length).toBe(3);f.audio.calls[2]!.resolve(purposeResult('OTP를 알려주지 마세요.'));await expect.poll(()=>c.messages.findLast(m=>m.type==='risk')?.event.status).toBe('analyzed');expect(c.messages.findLast(m=>m.type==='risk').event.signals).toEqual([]);
  c.revision(2,text);c.revision(3,text);expect(f.audio.calls).toHaveLength(3);
  c.revision(1,'OTP를','1');c.revision(1,'알려주세요.','2');await expect.poll(()=>f.audio.calls.length).toBe(4);expect(f.audio.calls[3]!.text).toContain('OTP를 알려주세요.');f.audio.calls[3]!.reject(new Error('FIXTURE_PROVIDER_TIMEOUT'));
  await expect.poll(()=>c.messages.findLast(m=>m.type==='risk')?.event.status).toBe('unavailable');expect(c.messages.findLast(m=>m.type==='risk').event).toMatchObject({purpose:{relation:'undetermined'}});expect(c.messages.findLast(m=>m.type==='risk').event.signals.length).toBeGreaterThan(0);
 }finally{c.ws.terminate();}
},20000);
it.each(['invented-evidence','external-command'] as const)('analysis HTTP/WS: rejects %s while retaining supported rules and product-controlled actions',async mode=>{
 const c=await analysisCall();try{
  c.revision(1,'OTP를 알려주세요.');await expect.poll(()=>f.audio.calls.length).toBe(1);
  f.audio.calls[0]!.resolve({...purposeResult('OTP를 알려주세요.','suspected',mode==='invented-evidence'?'실제 문맥에 없는 대출 권유':'OTP를 알려주세요.'),recommendedAction:'https://untrusted.invalid/execute',purpose:{relation:'suspected',evidenceSpan:mode==='invented-evidence'?'실제 문맥에 없는 대출 권유':'OTP를 알려주세요.',reason:mode==='external-command'?'https://untrusted.invalid/execute':'분석 근거'}});
  await expect.poll(()=>c.messages.findLast(m=>m.type==='risk')?.event.status).toBe('unavailable');const event=c.messages.findLast(m=>m.type==='risk').event;expect(event.signals.length).toBeGreaterThan(0);expect(event.purpose.relation).toBe('undetermined');expect(JSON.stringify(event)).not.toContain('untrusted.invalid');expect((await f.state()).status).toBe('active');expect((await f.state()).serviceV3!.attempts[c.attempt.id]!.status).toBe('accepted');
 }finally{c.ws.terminate();}
});
it.each(['epoch','key-generation','binding'] as const)('analysis HTTP/WS: rejects %s mismatch before forwarding a new frame',async change=>{
 const c=await analysisCall();try{
  c.revision(1,'OTP를 알려주세요.');await expect.poll(()=>f.audio.calls.length).toBe(1);
  await f.mutate(r=>{const t=r.serviceV3!.attempts[c.attempt.id]!;if(change==='epoch')t.lease!.payload.epoch='999';else if(change==='key-generation')t.lease!.payload.approvalKeyVersion=999;else t.lease!.payload.bindingHash='0'.repeat(64);});
  c.ws.send(Buffer.from([0,0]));await expect.poll(()=>c.stream.stopped).toBe(true);expect(c.stream.pushes).toBe(0);expect(f.audio.calls[0]!.signal.aborted).toBe(true);
  const before=c.messages.filter(m=>m.type==='risk').length;f.audio.calls[0]!.resolve(purposeResult('OTP를 알려주세요.'));await expect.poll(()=>c.ws.readyState).toBe(WebSocket.CLOSED);expect(c.messages.filter(m=>m.type==='risk')).toHaveLength(before);
 }finally{c.ws.terminate();}
});
it('analysis HTTP/WS: account disable invalidates real authenticated sockets and pending provider work',async()=>{
 const c=await analysisCall();try{
  c.revision(1,'OTP를 알려주세요.');await expect.poll(()=>f.audio.calls.length).toBe(1);
  expect((await c.manager.c.request('/v3/management/accounts',{issuer:f.oidc,subject:'recipient',displayName:'수신자 시험 계정',role:'recipient',active:false,permissions:[]})).status).toBe(200);
  await expect.poll(()=>c.ws.readyState).toBe(WebSocket.CLOSED);expect(c.stream.stopped).toBe(true);expect(f.audio.calls[0]!.signal.aborted).toBe(true);const before=c.messages.length;f.audio.calls[0]!.resolve(purposeResult('OTP를 알려주세요.'));expect(c.messages).toHaveLength(before);expect((await c.receiver.c.request('/v3/workspace')).status).toBe(401);
 }finally{c.ws.terminate();}
});
it('analysis HTTP/WS: enforces the remote context identity cap and releases the stream',async()=>{
 const c=await analysisCall();try{
  // Wait on actual transport events; polling each of 256 messages needlessly consumes freshness.
  const received=(segmentId:string)=>new Promise<void>((resolve,reject)=>{
   const clear=()=>{clearTimeout(timer);c.ws.off('message',message);c.ws.off('close',closed);};
   const message=(raw:import('ws').RawData)=>{const m=JSON.parse(String(raw));if(m.type==='revision'&&m.revision.segmentId===segmentId){clear();resolve();}};
   const closed=()=>{clear();reject(new Error('CONTEXT_STREAM_CLOSED_BEFORE_REVISION:'+segmentId));};
   const timer=setTimeout(()=>{clear();reject(new Error('CONTEXT_REVISION_TIMEOUT:'+segmentId));},1000);c.ws.on('message',message);c.ws.on('close',closed);
  });
  for(let n=0;n<257;n++){const pending=n<256?received(String(n)):undefined;c.revision(1,'정상 확인 안내입니다.',String(n));if(pending)await pending;}
  await expect.poll(()=>c.ws.readyState).toBe(WebSocket.CLOSED);expect(c.messages.some(m=>m.type==='unavailable'&&m.code==='ANALYSIS_LIMIT')).toBe(true);expect(c.stream.stopped).toBe(true);expect(f.audio.calls.length).toBeLessThanOrEqual(20);for(const request of f.audio.calls){expect(request.signal.aborted).toBe(true);request.reject(new Error('FIXTURE_CANCELLED'));}
 }finally{c.ws.terminate();}
},20000);

it('recall HTTP/SQL: keeps DELETE success, missing resources and unavailable observation distinct through real runtime writes',async()=>{
 const c=await acceptedCall();await f.mutate(r=>{r.serviceV3!.attempts[c.attempt.id]!.pbx={bridgeId:'fixture-bridge',senderChannelId:'fixture-sender',recipientChannelId:'fixture-recipient',senderEndpoint:'cs-fixture-s',recipientEndpoint:'cs-fixture-r',state:'bridged',reports:{},credentials:{}};});
 expect((await c.manager.c.request('/v3/cancel',{intentId:c.intentId})).status).toBe(200);
 const store=postgresAuthorityStore(process.env.ISSUER_DATABASE_URL!,{anchor:f.anchor,deployment:f.deployment}),authority=new ServiceAuthority({store,networkId:'31337',registryAddress:`0x${'1'.repeat(40)}`,signingKey:async()=>f.issuerKey,current:async()=>f.control.current,now:f.now});
 let observation:'present'|'unavailable'|'absent'='present';const requests:string[]=[];
 const ari=new AriClient({base:new URL('https://ari-fixture.invalid'),application:'callsign',authorization:'synthetic-only',fetcher:async(url,init)=>{requests.push(init!.method+':'+new URL(String(url)).pathname);return init!.method==='DELETE'?new Response(null,{status:204}):new Response('{}',{status:observation==='present'?200:observation==='unavailable'?503:404});}});
 const bridge=new AsteriskBridge(ari,f.issuerKey,{networkId:'31337',registryAddress:`0x${'1'.repeat(40)}`,pbxFingerprint:'AA:'.repeat(31)+'AA'}),runtime=new PbxRuntime({authority,institutionId:f.id,bridge,endpoints:{remove:async()=>{}},sessionsAlive:async()=>true});runtime.ready=true;
 const report=async()=>(await c.manager.c.request('/v3/management/recalls?intentId='+encodeURIComponent(c.intentId))).body;
 try{
  expect((await report()).attempts[0].media).toBe('requested');await runtime.tick();expect((await report()).attempts[0]).toMatchObject({media:'retry',serverAuthority:'terminal-applied',audioInterruption:'not-observed'});
  observation='unavailable';await runtime.tick();expect((await report()).attempts[0].media).toBe('retry');observation='absent';await runtime.tick();expect((await report()).attempts[0]).toMatchObject({media:'pbx-absent',mediaObservation:{source:'ari-delete-readback'},audioInterruption:'not-observed'});
  await runtime.event({type:'ChannelDestroyed',channel:{id:'fixture-sender'}});await runtime.event({type:'StasisEnd',channel:{id:'fixture-recipient'}});expect((await report()).attempts[0]).toMatchObject({status:'cancelled',media:'pbx-absent'});expect(requests.filter(x=>x.startsWith('DELETE:')).length).toBe(9);
  for(const subject of ['agent','recipient','approver-one'])expect((await (await f.login(subject)).c.request('/v3/management/recalls')).status).toBe(403);
  expect((await c.manager.c.request('/v3/management/recalls?institutionId=foreign')).status).toBe(400);
  const foreign='foreign-'+randomUUID();await f.sql`INSERT INTO issuer_v2.institutions(id,state) VALUES(${foreign},${f.sql.json({id:foreign,secretMarker:'FOREIGN_RECALL_MUST_NOT_LEAK'})})`;
  try{expect(JSON.stringify((await report()))).not.toContain('FOREIGN_RECALL_MUST_NOT_LEAK');}finally{await f.sql`DELETE FROM issuer_v2.institutions WHERE id=${foreign}`;}
 }finally{runtime.close();await store.close();}
});

it('recall Chromium: renders real cancellation observations and clears a held response on visibility events and account switch',async()=>{
 const manager=await f.login('staff'),work='browser-recall-'+randomUUID();expect((await manager.c.request('/v3/intents',{id:work,recipientId:f.uid('recipient'),agentId:f.uid('agent'),serviceUri:'https://center.example',expiresAt:f.now()+600})).status).toBe(200);expect((await manager.c.request('/v3/cancel',{intentId:work})).status).toBe(200);
 const page=await browserPage();const panel=page.locator('section.service-recalls');await panel.getByText('생성된 통화 시도 없음',{exact:false}).waitFor();expect(await panel.innerText()).toContain(work);expect(await panel.innerText()).toContain('원장 작업 대상 아님');expect(await panel.innerText()).toContain('기관 DB 관측');
 await page.getByLabel('회수 조회 업무',{exact:true}).focus();expect(await page.getByLabel('회수 조회 업무',{exact:true}).evaluate(e=>e===document.activeElement)).toBe(true);
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${f.runRoot}/recall-${width}.png`,fullPage:true});}
 let release!:()=>void,seen!:()=>void;const gate=new Promise<void>(r=>release=r),waiting=new Promise<void>(r=>seen=r);let held=false;
 await page.route('**/api/v3/management/recalls*',async route=>{if(held){await route.continue();return;}held=true;const response=await route.fetch();seen();await gate;await route.fulfill({response});});
 try{
  await waiting;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await panel.getByText('화면을 다시 확인하는 중입니다.',{exact:false}).waitFor();
  expect(await panel.innerText()).not.toContain(work);
  await page.getByRole('button',{name:'로그아웃 및 연결 회수',exact:true}).click();await page.getByRole('heading',{name:'연락 권한·연결 회수',exact:true}).waitFor({state:'hidden'});release();
  await browserLogin(page,'recipient');expect(await page.getByRole('heading',{name:'연락 권한·연결 회수',exact:true}).count()).toBe(0);expect(await page.locator('body').innerText()).not.toContain('기관 DB 관측');expect(await page.getByRole('button',{name:'연락 업무 생성',exact:true}).count()).toBe(0);
 }finally{release?.();await page.unroute('**/api/v3/management/recalls*');}
});
it('analysis HTTP/WS: rejects an expired session row and cancels its pending provider result',async()=>{
 const c=await analysisCall();try{
  c.revision(1,'OTP를 알려주세요.');await expect.poll(()=>f.audio.calls.length).toBe(1);
  const token=c.receiver.c.cookies.get('ip_session')!;await f.sql`UPDATE public.sessions SET expires_at=now()-interval '1 second' WHERE token_hash=${tokenHash(token)}`;
  await expect.poll(()=>c.ws.readyState).toBe(WebSocket.CLOSED);expect(c.stream.stopped).toBe(true);expect(f.audio.calls[0]!.signal.aborted).toBe(true);const before=c.messages.length;f.audio.calls[0]!.resolve(purposeResult('OTP를 알려주세요.'));expect(c.messages).toHaveLength(before);expect((await c.receiver.c.request('/v3/workspace')).status).toBe(401);
 }finally{c.ws.terminate();}
});
it('analysis HTTP/WS: SQL quota denial keeps rule evidence and never invokes the model adapter',async()=>{
 const c=await analysisCall(),quota=postgresQuotaStore(process.env.ISSUER_DATABASE_URL!),reservation='fixture-quota-'+randomUUID();try{
  await quota.reserve(reservation,f.id,'llm-requests',20,analysisScopes(f.id,f.uid('recipient'),c.attempt.id,'llm-requests',20,f.now()),f.now()+120);
  c.revision(1,'OTP를 알려주세요.');await expect.poll(()=>c.messages.findLast(m=>m.type==='risk')?.event.status).toBe('unavailable');expect(f.audio.calls).toHaveLength(0);const event=c.messages.findLast(m=>m.type==='risk').event;expect(event.signals.length).toBeGreaterThan(0);expect(event.purpose.relation).toBe('undetermined');
 }finally{c.ws.terminate();await quota.settle(reservation,0);await quota.close();}
});

it('analysis Chromium: renders authenticated WebSocket results in the shipped panel with synthetic binding and no media device',async()=>{
 const c=await acceptedCall(),page=await browserPage('recipient');
 // Media/PBX are excluded here: the real panel receives the real API socket via a component host.
 await page.evaluate(async attemptId=>{
  const response=await fetch('/api/v3/consent',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':sessionStorage.getItem('ip_csrf')??'','idempotency-key':crypto.randomUUID()},body:JSON.stringify({attemptId,granted:true})});if(!response.ok)throw new Error('BROWSER_CONSENT_REJECTED:'+response.status);
  const loadModule=new Function('url','return import(url)') as (url:string)=>Promise<any>;const component=await loadModule('/src/components/ServiceAnalysisPanel.tsx');
  const domUrl=performance.getEntriesByType('resource').map(e=>e.name).find(name=>name.includes('react-dom_client'))!;if(!domUrl)throw new Error('PRODUCT_REACT_RUNTIME_NOT_LOADED');
  const dom=await loadModule(domUrl);const {createRoot}=dom.default??dom;const host=document.createElement('div');host.dataset.testid='live-analysis-component';host.className='finals-workspace';document.body.append(host);const root=createRoot(host);
  let previous:any,active=true;const state={ready:false,closed:false};(window as any).__analysisTransport=state;root.render(component.ServiceAnalysisPanel({}));
  const url=new URL('/api/v3/audio',location.href);url.protocol='wss:';url.searchParams.set('attemptId',attemptId);const ws=new window.WebSocket(url);
  ws.onmessage=raw=>{const message=JSON.parse(String(raw.data));if(message.type==='ready'){state.ready=true;ws.send(JSON.stringify({type:'consent',consent:true}));}if(active&&message.type==='risk'){previous=component.nextAnalysis(previous,message.event);root.render(component.ServiceAnalysisPanel({event:previous}));}};
  ws.onclose=()=>{active=false;state.closed=true;previous=undefined;root.render(component.ServiceAnalysisPanel({}));};
 },c.attempt.id);
 await expect.poll(()=>page.evaluate(()=>(window as any).__analysisTransport.ready)).toBe(true);await expect.poll(()=>f.audio.streams.length).toBe(1);
 const stream=f.audio.streams[0]!,revision=(n:number)=>stream.options.onRevision({streamId:stream.options.streamId,segmentId:'browser-analysis',revision:n,final:true,text:'OTP를 알려주세요. 대출 상품을 안내하겠습니다.',source:'remote'}),panel=page.getByTestId('live-analysis-component');
 await panel.screenshot({path:`${f.runRoot}/analysis-component-off.png`});revision(1);await expect.poll(()=>f.audio.calls.length).toBe(1);await panel.getByText('분석 중',{exact:true}).waitFor();await panel.screenshot({path:`${f.runRoot}/analysis-component-pending.png`});f.audio.calls[0]!.resolve(purposeResult('OTP를 알려주세요. 대출 상품을 안내하겠습니다.','suspected','대출 상품을 안내하겠습니다.'));
 await panel.getByText('승인 목적 이탈 의심',{exact:true}).waitFor();expect(await panel.locator('strong').count()).toBeGreaterThan(0);
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${f.runRoot}/analysis-component-${width}.png`,fullPage:true});}
 revision(2);await expect.poll(()=>f.audio.calls.length).toBe(2);f.audio.calls[1]!.resolve(purposeResult('OTP를 알려주세요. 대출 상품을 안내하겠습니다.'));await panel.getByText('분석 범위에서 목적 이탈 근거 미탐지 · 안전 판정 아님',{exact:true}).waitFor();expect(await panel.locator('strong').count()).toBeGreaterThan(0);
 revision(3);await expect.poll(()=>f.audio.calls.length).toBe(3);f.audio.calls[2]!.reject(new Error('FIXTURE_PROVIDER_UNAVAILABLE'));await panel.getByText('목적 분석 불가 · 규칙 근거는 별도 표시',{exact:true}).waitFor();await panel.screenshot({path:`${f.runRoot}/analysis-component-unavailable.png`});expect(await panel.locator('strong').count()).toBeGreaterThan(0);
 revision(4);await expect.poll(()=>f.audio.calls.length).toBe(4);
 expect(await page.evaluate(async attemptId=>(await fetch('/api/v3/consent',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':sessionStorage.getItem('ip_csrf')??'','idempotency-key':crypto.randomUUID()},body:JSON.stringify({attemptId,granted:false})})).status,c.attempt.id)).toBe(200);
 await expect.poll(()=>page.evaluate(()=>(window as any).__analysisTransport.closed)).toBe(true);expect(stream.stopped).toBe(true);expect(f.audio.calls[3]!.signal.aborted).toBe(true);f.audio.calls[3]!.resolve(purposeResult('OTP를 알려주세요. 대출 상품을 안내하겠습니다.'));
 await panel.getByText('아직 표시할 분석 결과가 없습니다. 실행 상태는 음성 분석 항목을 확인하세요.',{exact:true}).waitFor();await panel.screenshot({path:`${f.runRoot}/analysis-component-consent-cleared.png`});expect(await panel.locator('strong').count()).toBe(0);
 expect(await page.evaluate(async()=>(await navigator.permissions.query({name:'microphone'})).state)).not.toBe('granted');
},20000);

it('analysis HTTP/WS: drains real quota before issuer shutdown even when a provider ignores abort',async()=>{
 const c=await analysisCall();c.revision(1,'OTP를 알려주세요.');await expect.poll(()=>f.audio.calls.length).toBe(1);
 expect(Number((await f.sql`SELECT count(*) AS count FROM issuer_v2.usage_reservations WHERE institution_id=${f.id} AND state='reserved'`)[0]!.count)).toBeGreaterThan(0);
 await f.stopIssuer();expect(c.stream.stopped).toBe(true);expect(f.audio.calls[0]!.signal.aborted).toBe(true);await expect.poll(()=>c.ws.readyState).toBe(WebSocket.CLOSED);
 expect(Number((await f.sql`SELECT count(*) AS count FROM issuer_v2.usage_reservations WHERE institution_id=${f.id} AND state='reserved'`)[0]!.count)).toBe(0);
 const model=await f.sql`SELECT state,actual FROM issuer_v2.usage_reservations WHERE institution_id=${f.id} AND unit='llm-requests'`;expect(model).toHaveLength(1);expect(model[0]!.state).toBe('settled');expect(Number(model[0]!.actual)).toBe(1);
 f.audio.calls[0]!.resolve(purposeResult('OTP를 알려주세요.'));expect((await f.state()).serviceV3!.attempts[c.attempt.id]!.status).toBe('accepted');
});

async function holdAnalysisSql(take:(tx:import('postgres').TransactionSql)=>Promise<unknown>){
 let release!:()=>void,ready!:()=>void,failed!:(error:unknown)=>void;const gate=new Promise<void>(r=>{release=r;}),locked=new Promise<void>((r,j)=>{ready=r;failed=j;});
 const done=f.sql.begin(async tx=>{await take(tx);ready();await gate;});void done.catch(failed);await locked;
 return async()=>{release();await done;};
}
it('analysis HTTP/WS: shutdown during a locked consent transaction never starts STT and releases its SQL reservation',async()=>{
 const call=await acceptedCall();expect((await call.receiver.c.request('/v3/consent',{attemptId:call.attempt.id,granted:true})).status).toBe(200);
 const active=socket(call.receiver.c,call.attempt.id);await expect.poll(()=>active.messages.some(m=>m.type==='ready')).toBe(true);
 const release=await holdAnalysisSql(tx=>tx`SELECT id FROM issuer_v2.institutions WHERE id=${f.id} FOR NO KEY UPDATE`);
 try{
  active.ws.send(JSON.stringify({type:'consent',consent:true}));
  await expect.poll(async()=>Number((await f.sql`SELECT count(*) AS count FROM issuer_v2.usage_reservations WHERE institution_id=${f.id} AND state='reserved'`)[0]!.count),{timeout:1500,interval:20}).toBe(1);
  await expect.poll(async()=>Number((await f.sql`SELECT count(*) AS count FROM pg_stat_activity WHERE usename='callsign_issuer_login' AND wait_event_type='Lock'`)[0]!.count),{timeout:1500,interval:20}).toBeGreaterThan(0);
  const closing=f.stopIssuer();await expect.poll(()=>active.ws.readyState,{timeout:1500,interval:20}).toBe(WebSocket.CLOSED);await release();await closing;
  expect(f.audio.streams).toHaveLength(0);const rows=await f.sql`SELECT unit,state,actual FROM issuer_v2.usage_reservations WHERE institution_id=${f.id}`;expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({unit:'stt-seconds',state:'released'});expect(Number(rows[0]!.actual)).toBe(0);
 }finally{await release();active.ws.terminate();}
});
it('analysis HTTP/WS: shutdown during a locked session lookup leaves no provider or reservation',async()=>{
 const call=await acceptedCall();expect((await call.receiver.c.request('/v3/consent',{attemptId:call.attempt.id,granted:true})).status).toBe(200);
 const release=await holdAnalysisSql(tx=>tx`LOCK TABLE public.sessions IN ACCESS EXCLUSIVE MODE`);let active:ReturnType<typeof socket>|undefined;
 try{
  active=socket(call.receiver.c,call.attempt.id);await expect.poll(()=>active!.ws.readyState,{timeout:1500,interval:20}).toBe(WebSocket.OPEN);
  await expect.poll(async()=>Number((await f.sql`SELECT count(*) AS count FROM pg_stat_activity WHERE usename='callsign_auth_login' AND wait_event_type='Lock'`)[0]!.count),{timeout:1500,interval:20}).toBeGreaterThan(0);
  const closing=f.stopIssuer();await expect.poll(()=>active!.ws.readyState,{timeout:1500,interval:20}).toBe(WebSocket.CLOSED);await release();await closing;
  expect(f.audio.streams).toHaveLength(0);expect(f.audio.calls).toHaveLength(0);expect(Number((await f.sql`SELECT count(*) AS count FROM issuer_v2.usage_reservations WHERE institution_id=${f.id}`)[0]!.count)).toBe(0);
 }finally{await release();active?.ws.terminate();}
});
it('analysis HTTP/WS: cancellation while model reservation is blocked releases zero without invoking the provider',async()=>{
 const c=await analysisCall(),quotaId=`llm:${c.stream.options.streamId}:1`;
 const release=await holdAnalysisSql(tx=>tx`SELECT pg_advisory_xact_lock(hashtextextended(${quotaId},0))`);
 try{
  c.revision(1,'OTP를 알려주세요.');await expect.poll(async()=>Number((await f.sql`SELECT count(*) AS count FROM pg_stat_activity WHERE usename='callsign_issuer_login' AND wait_event='advisory'`)[0]!.count),{timeout:1500,interval:20}).toBeGreaterThan(0);
  const closing=f.stopIssuer();await expect.poll(()=>c.ws.readyState,{timeout:1500,interval:20}).toBe(WebSocket.CLOSED);await release();await closing;
  expect(f.audio.calls).toHaveLength(0);const rows=await f.sql`SELECT state,actual FROM issuer_v2.usage_reservations WHERE id=${quotaId}`;expect(rows).toHaveLength(1);expect(rows[0]!.state).toBe('released');expect(Number(rows[0]!.actual)).toBe(0);expect(Number((await f.sql`SELECT count(*) AS count FROM issuer_v2.usage_reservations WHERE institution_id=${f.id} AND state='reserved'`)[0]!.count)).toBe(0);
 }finally{await release();c.ws.terminate();}
});


it('UI only: keeps empty and loading work states usable with 200 percent viewport emulation and keyboard focus',async()=>{
 const page=await browserPage('other');await page.getByText('현재 접근 가능한 업무가 없습니다.',{exact:true}).waitFor();await captureUi(page,'empty-work');
 let release!:()=>void,seen!:()=>void,finished!:()=>void;const gate=new Promise<void>(r=>release=r),waiting=new Promise<void>(r=>seen=r),handled=new Promise<void>(r=>finished=r);
 await page.route('**/api/v3/workspace',async route=>{const response=await route.fetch();seen();await gate;await route.fulfill({response});finished();});
 try{await page.getByRole('button',{name:'업무 새로고침',exact:true}).click();await waiting;expect(await page.getByRole('button',{name:'업무 새로고침',exact:true}).isEnabled()).toBe(false);await captureUi(page,'loading-work');}finally{release();await handled;await page.unroute('**/api/v3/workspace');}
 await expect.poll(()=>page.getByRole('button',{name:'업무 새로고침',exact:true}).isEnabled()).toBe(true);const zoom=await browserPage('other',{viewport:{width:683,height:384},deviceScaleFactor:2});try{expect(await zoom.evaluate(()=>({width:innerWidth,scale:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth}))).toEqual({width:683,scale:2,overflow:false});await zoom.getByRole('button',{name:'업무 새로고침',exact:true}).focus();await zoom.keyboard.press('Tab');expect(await zoom.evaluate(()=>document.activeElement?.tagName)).not.toBe('BODY');await zoom.evaluate(()=>scrollTo(0,0));await zoom.screenshot({path:`${f.runRoot}/empty-work-zoom-layout-emulation-200.png`,fullPage:true});}finally{await zoom.context().close();}
 const manager=await f.login('staff');expect((await manager.c.request('/v3/intents',{id:'official-target-'+randomUUID(),recipientId:f.uid('other'),agentId:f.uid('agent'),serviceUri:'https://center.example',expiresAt:f.now()+600})).status).toBe(200);await browserLogin(page,'other',true);const confirm=page.getByRole('button',{name:'본인 거래 확인',exact:true});await confirm.waitFor();expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(44);await captureUi(page,'official-targets');
});
