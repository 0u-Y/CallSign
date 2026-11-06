// Synthetic markup with production CSS only; no API, microphone, or call.
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration')throw Error('ISOLATED_UI_APPROVAL_REQUIRED');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});await page.route('**/*',r=>r.abort());
 const css=(await readFile('apps/web/src/service.css','utf8'))+'\n'+await readFile('apps/web/src/demo-workspace.css','utf8');
 await page.setContent(`<style>${css}</style><div class="demo-workspace service-app"><section data-attention="recipient"><div class="demo-call-grid"><aside class="demo-institution"><h2>상담원</h2><div style="height:700px">합성 상태: 실제 통화 없음</div><section class="service-call-controls" data-connected="true" data-active="true"><button class="button service-end is-live">통화 종료</button></section></aside></div></section></div>`);
 await page.evaluate(()=>{window.result={clicks:0,events:[]};const b=document.querySelector('button');for(const name of ['pointerdown','pointerup','click','focus'])b.addEventListener(name,()=>{const r=b.getBoundingClientRect();window.result.events.push({name,x:r.x,y:r.y});if(name==='click')window.result.clicks++;});});
 await page.getByRole('button',{name:'통화 종료',exact:true}).click();await page.waitForTimeout(600);const result=await page.evaluate(()=>window.result);console.log(JSON.stringify(result));assert.equal(result.clicks,1);
}finally{await browser.close();}
