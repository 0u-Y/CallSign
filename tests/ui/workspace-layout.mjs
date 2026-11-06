// Built frontend only: all API traffic is intercepted; no backend or media is started.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium,expect} from '@playwright/test';
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration')throw new Error('BLOCKED: isolated frontend browser fixture requires explicit integration approval');
const root=resolve('apps/web/dist'),out=resolve(process.env.CALLSIGN_UI_OUTPUT??'.impeccable/review');
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;assert(!path.startsWith('/api'));const file=path.startsWith('/assets/')?resolve(root,'.'+path):resolve(root,'index.html');assert(file.startsWith(root+'/'));res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff'})[extname(file)]??'text/html');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.env.CALLSIGN_BROWSER_PATH?{executablePath:process.env.CALLSIGN_BROWSER_PATH}:{})});
const policy={id:'mock-bank-fds',version:1,purpose:'FRAUD_CONFIRMATION',allowedQuestions:['본인이 해당 거래를 시도했는지 여부','거래 시각과 가맹점 확인'],forbiddenRequests:['OTP','TRANSFER','REMOTE_CONTROL','SECRECY'],followUpPath:'/official'};
const service='https://callsign-demo.example/services/demo-center',institution='https://callsign-demo.example/institutions/demo-bank';
const allPermissions=['contact.manage','delegation.manage','institution.suspend','institution.recover','key.activate'];
const errors=[],writes=[],checks=[],captures=[];
let loseCreate=true,suspended=false,releaseLate;let attempts=[];
let role='institution',managementFails=false,healthFails=false,callbackFails=false,callbackCount=0,meCount=0;
let intents=[{id:'fixture-work-1',agentId:'agent-01',recipientId:'customer-01',status:'open',serviceDid:service,policyHash:'fixture-policy'}];
const user=()=>role==='institution'?'manager-01':role==='gateway'?'agent-01':role==='recipient'?'customer-01':'approver-01';
const management=()=>({status:suspended?'suspended':'active',epoch:'2',observedEpoch:'2',chainId:'2026',registryAddress:'0x'+'1'.repeat(40),institutionKey:'0x'+'2'.repeat(64),approvers:['1','2','3'].map(n=>'0x'+n.repeat(40)),policy,directory:null,configurationProposals:[],recovery:null,members:[{id:'agent-01',role:'gateway',serviceDid:service,active:true},{id:'customer-01',role:'recipient',active:true}],marker:'fixture-management-success'});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();const path=url.pathname.slice(4);let value={};let status=200;
 if(req.method()==='POST'){
  const body=req.postDataJSON();writes.push({path,body,key:req.headers()['idempotency-key']});
  if(path==='/v3/auth/callback'){callbackCount++;value={official:false};if(callbackFails)status=500;}
  else if(path==='/v3/intents'){assert.deepEqual(Object.keys(body).sort(),['agentId','expiresAt','id','recipientId','serviceUri'].sort());assert(req.headers()['idempotency-key']);value={...body,serviceDid:body.serviceUri,status:'open'};if(!intents.some(i=>i.id===body.id))intents.push(value);if(loseCreate){loseCreate=false;status=503;}}
  else if(path==='/v3/attempts'){assert.deepEqual(Object.keys(body).sort(),['intentId','profile']);assert.equal(body.profile,'asterisk-webrtc-v3');value={id:'fixture-attempt',intentId:body.intentId,status:'created'};attempts.push(value);}
  else if(path==='/v3/cancel'){assert.equal(role,'institution');intents=intents.map(i=>i.id===body.intentId?{...i,status:'cancelled'}:i);}
  else throw new Error('Unexpected fixture write '+path);
 }else if(path==='/v3/auth/me'){meCount++;value={csrfToken:'fixture-csrf',user:{id:user(),role,displayName:'시험 계정'}};}
 else if(path==='/v3/workspace')value={institutionUri:institution,actor:{userId:user(),role,institutionId:'fixture-bank'},permissions:role==='institution'?allPermissions:role==='approver'?['governance.approve']:[],policy,analysisAvailability:{mode:'disabled',speech:false,model:false},runtimePolicy:{},services:role==='institution'?[service]:[],intents:role==='approver'?[]:intents,attempts,credentials:role==='recipient'||role==='approver'?[]:[{digest:'fixture-vc',state:'registered',vc:{credentialSubject:{id:service}}}]};
 else if(path==='/v3/management'){status=managementFails?503:200;value=management();}
 else if(path==='/v3/management/measurements'){await new Promise(r=>{releaseLate=r;});value={marker:'late-old-account'};}
 else if(path==='/v3/management/jobs')value={jobs:[]};
 else if(path==='/v3/management/health'){status=healthFails?503:200;value={checkedAt:Math.floor(Date.now()/1000),institution:'active',epoch:'2',ledger:[1,2,3,4].map(node=>({node,status:'current',height:'40',hash:'0xfixture-block'}))};}
 else if(path==='/v3/management/recalls')value={checkedAt:Math.floor(Date.now()/1000),freshForSeconds:10,institutionStatus:'active',epoch:'2',observedEpoch:'2',changes:[],configurations:[],attempts:[],intents:[],truncated:false};
 else if(path==='/v3/call-context')value={attempt:attempts.find(a=>a.id===url.searchParams.get('attemptId')),policy};
 else if(path==='/v3/notifications')value={enabled:true,items:[]};
 else if(path==='/v3/official')value={intents:[],attempts:[]};
 else {status=404;value={};}
 await route.fulfill({status,json:status>=400?{error:{code:'FIXTURE_FAILURE',message:'fixture unavailable'}}:value});
});
const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));

try{
 intents=Array.from({length:24},(_,n)=>({id:'fixture-work-'+String(n).padStart(2,'0'),agentId:'agent-01',recipientId:'customer-'+n,status:n===23?'cancelled':'open',expiresAt:Math.floor(Date.now()/1000)+3600,serviceDid:service,policyHash:'fixture-policy'}));
 await page.goto(origin+'/demo/work');await expect(page.locator('.work-select')).toHaveCount(10);
 const search=page.getByRole('searchbox');await search.fill('customer-1');await search.press('Space');assert.equal(writes.length,0);await search.fill('');
 await page.getByRole('button',{name:'다음',exact:true}).click();const first=page.locator('.work-select').first();const selected=await first.getAttribute('aria-label');await first.click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog')).toContainText('현재 유효성 미확인');assert.equal(await page.getByRole('dialog').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');assert(await page.evaluate(()=>document.body.hasAttribute('data-scroll-locked')));await page.keyboard.press('Escape');await expect(first).toBeFocused();
 await first.click();await page.getByRole('link',{name:'연락 검증으로 이동',exact:true}).click();await page.getByRole('navigation',{name:'주요 탐색'}).getByRole('link',{name:'업무 관리',exact:true}).click();await expect(page.locator('.work-select').first()).toHaveAttribute('aria-label',selected);await expect(page.locator('.work-select').first()).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('f');await expect(page.locator('#callsign-recording')).toHaveClass(/recording/);await page.keyboard.press('Escape');assert(!(await page.locator('#callsign-recording').getAttribute('class')).split(' ').includes('recording'));
 await page.getByRole('button',{name:'촬영 가이드',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 for(const route of ['work','call','governance']){await page.getByRole('navigation',{name:'주요 탐색'}).getByRole('link',{name:{work:'업무 관리',call:'연락 검증',governance:'공동 관리'}[route],exact:true}).click();if(route==='governance'){await expect(page.locator('.approver-list .approver')).toHaveCount(3);await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Space');assert.equal(writes.length,0);}
 for(const width of [1440,1920,390]){await page.setViewportSize({width,height:width===1920?1080:900});await page.screenshot({path:out+'/fixture-'+route+'-'+width+'.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'PAGE_OVERFLOW_'+route+'_'+width);}
 }
 role='gateway';await page.reload();await expect(page.locator('.governance-access')).toBeVisible();assert.equal(await page.locator('.recording-gov-summary').count(),0);
 role='approver';await page.reload();await expect(page.locator('.approver-list .approver')).toHaveCount(3);await expect(page.getByRole('button',{name:'기관 정지',exact:true})).toHaveCount(0);
 role='institution';managementFails=true;await page.reload();await expect(page.getByText('관리 상태를 조회하지 못했습니다. 변경이 확정됐다고 간주하지 마세요.',{exact:true})).toBeVisible();await expect(page.locator('.recording-gov-summary h2')).toHaveText('확인 불가');await expect(page.getByRole('button',{name:'기관 정지',exact:true})).toBeDisabled();
 assert.equal(writes.length,0);assert.deepEqual(errors,[]);await writeFile(out+'/result.json',JSON.stringify({status:'PASS',fixture:true,checks:['search-space-no-command','pagination-navigation-selection','drawer-escape-focus-scroll-lock','F-Escape-guide','governance-role-boundary','governance-space-no-command','1440-1920-390'],writes},null,2));
}catch(e){await writeFile(out+'/result.json',JSON.stringify({status:'FAIL',message:e.message,errors,writes},null,2));process.exitCode=1;}finally{await browser.close();await new Promise(r=>server.close(r));}
