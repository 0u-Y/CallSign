import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration')throw Error('ISOLATED_UI_APPROVAL_REQUIRED');
const require=createRequire(import.meta.url),{build}=await import(createRequire(require.resolve('tsx')).resolve('esbuild'));
const result=await build({entryPoints:['tests/ui/recording-shell-fixture.tsx'],bundle:true,write:false,outdir:'.local/unused-shell',format:'iife',jsx:'automatic',define:{'import.meta.env':'{}'},nodePaths:[resolve('apps/web/node_modules')]});
const browser=await chromium.launch();try{const page=await browser.newPage();await page.route('**/*',r=>r.abort());await page.setContent('<div id="root"></div>');await page.addStyleTag({content:await readFile('apps/web/src/recording-adapters.css','utf8')});await page.addScriptTag({content:result.outputFiles.find(f=>f.path.endsWith('.js')).text});
 const shell=page.locator('#callsign-recording');const unfocus=()=>page.evaluate(()=>document.activeElement?.blur());
 await page.keyboard.press('f');await expect(shell).toHaveClass(/recording/);await expect(page.locator('.demo-tools')).not.toBeVisible();await expect(page.getByRole('button',{name:'통화 종료 · 합성'})).toBeVisible();await page.keyboard.press('Escape');await expect(shell).not.toHaveClass(/\brecording\b/);
 await page.getByLabel('검색').fill('');await page.keyboard.press('f');await expect(page.getByLabel('검색')).toHaveValue('f');await expect(shell).not.toHaveClass(/\brecording\b/);
 await page.getByRole('button',{name:'촬영 가이드'}).click();await expect(page.getByRole('dialog')).toContainText('독립 브라우저');await unfocus();await page.keyboard.press('f');await expect(shell).not.toHaveClass(/\brecording\b/);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('link',{name:'연락 검증',exact:true}).click();await unfocus();await page.keyboard.down('f');await expect(shell).toHaveClass(/\brecording\b/);await page.keyboard.down('f');await expect(shell).toHaveClass(/\brecording\b/);await page.keyboard.up('f');await page.getByRole('button',{name:'편집 화면'}).click();await expect(shell).not.toHaveClass(/\brecording\b/);
 await page.getByRole('link',{name:'공동 관리',exact:true}).click();await expect(shell).toHaveClass(/govpage/);console.log('PASS: one F owner, repeat/editing/dialog/Escape, nav, guide, end remains accessible; fixture only');
}finally{await browser.close();}
