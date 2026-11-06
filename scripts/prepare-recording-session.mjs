// Local operator tool: real OIDC form login in separate persistent browser profiles.
import {chromium} from '@playwright/test';
import {readFile,mkdir,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1]};
const credentialsFile=option('--credentials');
const web=option('--web')??'https://callsign-rouge.vercel.app';
const profiles=resolve(option('--profiles')??'.local/recording-browser-profiles');
const check=args.includes('--check');
const captureDir=option('--capture-dir');
if(captureDir)await mkdir(resolve(captureDir),{recursive:true,mode:0o700});
if(process.env.CALLSIGN_RECORDING_PREP_ENABLED!=='1')throw Error('RECORDING_PREPARATION_NOT_ENABLED');
if(!credentialsFile||!/^https:\/\/[a-z0-9.-]+$/i.test(web)||!['https://callsign-rouge.vercel.app'].includes(web))throw Error('PROTECTED_CREDENTIAL_FILE_AND_APPROVED_WEB_ORIGIN_REQUIRED');
const credentialStat=await lstat(resolve(credentialsFile));
if(!credentialStat.isFile()||credentialStat.isSymbolicLink()||(credentialStat.mode&0o077))throw Error('CREDENTIAL_FILE_MUST_BE_PRIVATE_REGULAR_FILE');
const all=JSON.parse(await readFile(credentialsFile,'utf8'));
const roles=['institution','gateway','recipient'];
const accounts=roles.map(role=>{const a=all.find(x=>x.role===role);if(!a?.username?.startsWith('callsign-')||!a?.password)throw Error(`MISSING_${role.toUpperCase()}_CREDENTIAL`);return a});
await mkdir(profiles,{recursive:true,mode:0o700});
const profilesStat=await lstat(profiles);
if(!profilesStat.isDirectory()||profilesStat.isSymbolicLink()||(profilesStat.mode&0o077))throw Error('PROFILE_DIRECTORY_MUST_BE_PRIVATE');
const contexts=[];
let preparing;
const preparation=await chromium.launch({headless:check});
const control=await preparation.newPage({viewport:{width:660,height:520}});
await control.exposeFunction('prepareCallsSign',async()=>{
 if(preparing)return preparing;
 preparing=(async()=>{
  const result=[];
  await Promise.allSettled(contexts.splice(0).map(x=>x.close()));
  try{for(const a of accounts){
   const dir=resolve(profiles,a.role);
   await mkdir(dir,{recursive:true,mode:0o700});
   const info=await lstat(dir);
   if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077))throw Error(`UNSAFE_PROFILE_${a.role}`);
   const context=await chromium.launchPersistentContext(dir,{headless:check,viewport:{width:1440,height:900}});
   contexts.push(context);
   const page=context.pages()[0]??await context.newPage();
   await page.goto(`${web}/demo/call`,{waitUntil:'domcontentloaded'});
   try{await page.locator('.demo-workspace').waitFor({timeout:12000})}catch{await page.reload({waitUntil:'domcontentloaded'});await page.locator('.demo-workspace').waitFor({timeout:15000})}
   await page.waitForTimeout(900);
   const label={institution:'기관 담당자',gateway:'상담원',recipient:'수신자'}[a.role];
   const marker=page.getByText(`${label} 워크스페이스 · 합성 시연 표시`,{exact:true});
   if(!await marker.isVisible().catch(()=>false)){
    await page.locator('.demo-preparation summary').click();
    await page.getByRole('button',{name:'업무 계정 로그인',exact:true}).click();
    await page.locator('#username').waitFor({timeout:20000});
    await page.locator('#username').fill(a.username);
    await page.locator('#password').fill(a.password);
    await page.locator('#kc-login').click();
    await page.waitForURL(url=>url.origin===web,{timeout:25000});
    await marker.waitFor({timeout:20000});
   }
   const work=await page.locator('.demo-work-picker select option').allTextContents();
   if(!work.some(x=>x.includes('진행 중')))result.push({role:a.role,status:'로그인됨 · 진행 중 업무 미확인'});
   else result.push({role:a.role,status:'로그인됨 · 진행 중 업무 조회됨'});
   if(a.role==='institution'){await page.goto(`${web}/demo/work`,{waitUntil:'domcontentloaded'});try{await page.locator('.work-table tbody tr').first().waitFor({timeout:12000})}catch{await page.reload({waitUntil:'domcontentloaded'});await page.locator('.work-table tbody tr').first().waitFor({timeout:15000})}}
   if(captureDir)await page.screenshot({path:resolve(captureDir,`${a.role}.png`),fullPage:true});
   if(!check)await page.bringToFront();
  }
  return result;
  }catch(error){await Promise.allSettled(contexts.splice(0).map(x=>x.close()));throw error;}
 })().finally(()=>{preparing=undefined});
 return preparing;
});
await control.setContent(`<meta charset="utf-8"><title>CallSign 촬영 준비</title><style>body{font:16px system-ui;max-width:580px;margin:48px auto;color:#14243d}button{background:#2563eb;color:white;border:0;border-radius:8px;padding:14px 20px;font-size:16px}button:disabled{opacity:.5}li{margin:12px 0}</style><h1>CallSign 촬영 준비</h1><p>보호된 로컬 계정으로 기관·상담원·수신자를 각각 독립 브라우저 프로필에 로그인합니다. 발신·동의·분석·정지는 실행하지 않습니다.</p><button id="prepare">촬영 세션 준비</button><p id="status" role="status">준비 전</p><ul id="roles"></ul><p>세션이 만료되면 이 화면에서 다시 준비하세요. 각 역할 창의 업무와 연결 상태를 확인한 뒤 촬영을 시작하세요.</p><script>const button=document.querySelector('#prepare'),status=document.querySelector('#status'),list=document.querySelector('#roles');button.onclick=async()=>{if(button.disabled)return;button.disabled=true;status.textContent='실제 계정 로그인과 업무 조회 중';list.replaceChildren();try{const items=await window.prepareCallsSign();for(const item of items){const li=document.createElement('li');li.textContent=item.role+' · '+item.status;list.append(li)}status.textContent=items.every(x=>x.status.includes('업무 조회됨'))?'준비 완료 · 역할별 창에서 촬영 시작':'로그인 완료 · 일부 업무 상태 확인 필요'}catch(e){status.textContent='준비 실패 · '+e.message+' · 다시 준비하세요'}finally{button.disabled=false}};</script>`);
if(check){await control.locator('#prepare').click();await control.waitForFunction(()=>!document.querySelector('#prepare').disabled,{timeout:120000});const state=await control.locator('#status').innerText();if(captureDir)await control.screenshot({path:resolve(captureDir,'preparation.png')});console.log(state);if(!state.startsWith('준비 완료'))process.exitCode=1;await Promise.allSettled(contexts.map(x=>x.close()));await preparation.close();}
else{await control.bringToFront();await new Promise(resolve=>process.once('SIGINT',resolve));await Promise.allSettled(contexts.map(x=>x.close()));await preparation.close();}
