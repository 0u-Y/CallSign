import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration')throw Error('ISOLATED_UI_APPROVAL_REQUIRED');
const require=createRequire(import.meta.url),{build}=await import(createRequire(require.resolve('tsx')).resolve('esbuild'));
const result=await build({entryPoints:['tests/ui/work-queue-fixture.tsx'],bundle:true,write:false,outdir:'.local/unused-work-queue',format:'iife',jsx:'automatic',define:{'import.meta.env':'{}'},alias:{punycode:resolve('apps/web/src/lib/unicodeEscapes.ts')},nodePaths:[resolve('apps/web/node_modules')]});
const out='.local/v24-review/work-queue-20261107/fixture';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();page.on('pageerror',e=>console.error('Fixture error:',e.message));await page.route('**/*',r=>r.request().url()==='https://callsign-fixture.invalid/'?r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}):r.abort());await page.goto('https://callsign-fixture.invalid/');await page.addStyleTag({content:(await readFile('apps/web/src/styles.css','utf8')).replace(/^@import .*;$/gm,'')+await readFile('apps/web/src/service.css','utf8')+await readFile('apps/web/src/demo-workspace.css','utf8')});await page.addScriptTag({content:result.outputFiles.find(f=>f.path.endsWith('.js')).text});
 await expect(page.locator('tbody tr')).toHaveCount(10);expect(new Set(await page.locator('tbody td:first-child small').allTextContents()).size).toBe(10);
 await page.getByRole('button',{name:/^취소/}).click();await expect(page.locator('tbody tr')).toHaveCount(9);await expect(page.locator('tbody tr').first()).toContainText('취소됨');
 await page.getByRole('button',{name:/^전체/}).click();await page.getByLabel('담당자',{exact:true}).selectOption('agent-long-23456789');await expect(page.getByRole('status')).toHaveText('검색 결과 13건');
 await page.getByRole('searchbox').fill('00000001');await expect(page.locator('tbody tr')).toHaveCount(1);await page.locator('.work-select').click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog')).toContainText('업무 00000001');await page.keyboard.press('Escape');await page.getByRole('searchbox').fill('');await page.getByLabel('담당자',{exact:true}).selectOption('all');
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`${out}/work-${width}.png`,fullPage:true});}
 await page.getByRole('button',{name:'+ 업무 등록',exact:true}).click();await expect(page.getByRole('dialog')).not.toContainText('연락 검증으로 이동');await expect(page.getByRole('heading',{name:'연락 업무 만들기',exact:true})).toBeVisible();await page.keyboard.press('Escape');await page.getByRole('searchbox').fill('no-such-work');await expect(page.getByText('조건에 맞는 업무가 없습니다.',{exact:true})).toBeVisible();
 console.log('PASS: distinct real-ID labels, status/owner/search filters, selection, empty state, create/detail separation, desktop/mobile; synthetic data only');
}finally{await browser.close();}
