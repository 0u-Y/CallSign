import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {chromium,expect} from '@playwright/test';
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration')throw Error('ISOLATED_UI_APPROVAL_REQUIRED');
const require=createRequire(import.meta.url),{build}=await import(createRequire(require.resolve('tsx')).resolve('esbuild'));
const result=await build({entryPoints:['tests/ui/workspace-recovery-fixture.tsx'],bundle:true,write:false,outdir:'.local/unused-workspace-recovery',format:'iife',jsx:'automatic',define:{'import.meta.env':'{}'},alias:{punycode:resolve('apps/web/src/lib/unicodeEscapes.ts')},nodePaths:[resolve('apps/web/node_modules')]});
const check=expect.configure({timeout:12000});
const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage();page.setDefaultTimeout(12000);await page.route('**/*',r=>r.request().url()==='https://callsign-fixture.invalid/'?r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}):r.abort());await page.goto('https://callsign-fixture.invalid/');await page.addScriptTag({content:result.outputFiles.find(f=>f.path.endsWith('.js')).text});await check(page.locator('.demo-environment')).toContainText('기관 담당자');
 await page.evaluate(()=>window.fixture.mode='timeout');await check(page.getByRole('alert')).toContainText('요청 시간이 초과');await check(page.getByText('signal timed out',{exact:true})).toHaveCount(0);await check(page.getByText('현재 업무 상태를 확인할 수 없습니다.',{exact:false})).toBeVisible();
 await page.evaluate(()=>window.fixture.mode='ok');await check(page.getByRole('alert')).toHaveCount(0);await check(page.getByText('현재 업무 상태를 확인할 수 없습니다.',{exact:false})).toHaveCount(0);
 await page.getByText('로그인 · 역할 연결 · 실행 준비',{exact:true}).click();const before=await page.evaluate(()=>window.fixture.reads);await page.getByRole('button',{name:'업무 새로고침',exact:true}).click();await check.poll(()=>page.evaluate(()=>window.fixture.reads)).toBe(before+1);
 await page.getByRole('button',{name:'업무 계정 로그인',exact:true}).click();await check(page.getByRole('alert')).toContainText('권한이 없');const actionReads=await page.evaluate(()=>window.fixture.reads);await check.poll(()=>page.evaluate(()=>window.fixture.reads)).toBeGreaterThan(actionReads);await check(page.getByRole('alert')).toContainText('권한이 없');
 console.log('PASS: timeout distinguished, polling recovery clears only lookup failure, manual refresh is single, command rejection retained; synthetic API only');
}finally{await browser.close();}
