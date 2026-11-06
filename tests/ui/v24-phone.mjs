import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium,expect} from '@playwright/test';
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration')throw Error('ISOLATED_UI_APPROVAL_REQUIRED');
const require=createRequire(import.meta.url),{build}=await import(createRequire(require.resolve('tsx')).resolve('esbuild'));
const built=await build({entryPoints:['tests/ui/v24-phone-fixture.tsx'],alias:{punycode:resolve('apps/web/src/lib/unicodeEscapes.ts')},bundle:true,write:false,outdir:'.local/unused-v24',format:'iife',jsx:'automatic',nodePaths:[resolve('apps/web/node_modules')]});
const base=(await readFile('apps/web/src/styles.css','utf8')).replace(/^@import .*;$/gm,'');
const css=base+await readFile('apps/web/src/service.css','utf8')+await readFile('apps/web/src/demo-workspace.css','utf8');
const out=process.env.CALLSIGN_UI_OUTPUT??'.local/v24-review/phone';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{for(const width of [1440,390]){const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(10000);page.on('pageerror',e=>console.error('FIXTURE_PAGE_ERROR',e.message));await page.route('**/*',r=>r.request().url()==='https://callsign-fixture.invalid/'?r.fulfill({contentType:'text/html',body:`<style>${css}</style><div id="root"></div>`}):r.abort());await page.goto('https://callsign-fixture.invalid/');await page.addScriptTag({content:built.outputFiles.find(f=>f.path.endsWith('.js')).text});
 for(const state of ['waiting','incoming','connected','analyzing','risk','withdrawn','off','failure','ended']){await page.getByRole('navigation',{name:'fixture states'}).getByRole('button',{name:state,exact:true}).click();await page.screenshot({path:`${out}/${state}-${width}.png`,fullPage:true});if(state==='connected'){await page.getByRole('button',{name:'키패드',exact:true}).click();await expect(page.getByRole('region',{name:'통화 키패드'}).getByRole('button',{name:'통화 종료',exact:true})).toBeVisible();await page.screenshot({path:`${out}/keypad-${width}.png`,fullPage:true});await page.getByRole('button',{name:'가리기',exact:true}).click();}}
 await page.close();}await writeFile(`${out}/result.json`,JSON.stringify({status:'PASS',scope:'Synthetic product component props; no real auth/API/audio/provider',viewports:[1440,390]}));}finally{await browser.close();}
