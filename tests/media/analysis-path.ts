import {readFile,lstat} from 'node:fs/promises';
import {expect,type Page,type BrowserContext} from '@playwright/test';
import type {CallObserver} from '../../scripts/evaluate-performance.js';
export async function installAnalysisTrackObserver(context:BrowserContext){await context.addInitScript(()=>{
 const w=window as any,Native=window.MediaRecorder;w.callSignRecorderTracks=[];w.callSignAnalysisLifecycle=[];
 const note=(stage:string)=>{if(w.callSignAnalysisLifecycle.length<100)w.callSignAnalysisLifecycle.push({stage,atMs:performance.now(),hidden:document.hidden});};
 document.addEventListener('visibilitychange',()=>note('visibility'));
 window.MediaRecorder=class extends Native{constructor(stream:MediaStream,options?:MediaRecorderOptions){super(stream,options);w.callSignRecorderTracks.push(stream.getAudioTracks().map(t=>t.id));for(const stage of ['start','stop','error'])this.addEventListener(stage,()=>note('recorder-'+stage));}};
});}
export async function analysisControl(env:NodeJS.ProcessEnv){
 if(!['media','integration'].includes(env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION??'')||env.CALLSIGN_MEDIA_ANALYSIS_MODE!=='fixture')throw new Error('ANALYSIS_MEDIA_SCOPE_REQUIRED');
 const url=new URL(env.CALLSIGN_MEDIA_ANALYSIS_CONTROL_URL??'');if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.pathname!=='/__fixture/analysis'||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('LOOPBACK_FIXTURE_CONTROL_REQUIRED');
 const path=env.CALLSIGN_MEDIA_ANALYSIS_TOKEN_FILE!;const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077))throw new Error('PRIVATE_FIXTURE_TOKEN_REQUIRED');const token=(await readFile(path,'utf8')).trim();if(token.length<40||token.length>200)throw new Error('FIXTURE_TOKEN_INVALID');
 return async(body:Record<string,unknown>)=>{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body),signal:AbortSignal.timeout(2000)});if(!response.ok)throw new Error('FIXTURE_CONTROL_FAILED:'+response.status);return response.json() as Promise<{streams:Array<{frames:number;stopped:boolean}>;requests:Array<{aborted:boolean;done:boolean}>}>;};
}
export async function exerciseServiceCallAnalysis(page:Page,control:Awaited<ReturnType<typeof analysisControl>>,observer:CallObserver,captureWarning?:()=>Promise<void>){
 const marked=new Set<string>();page.on('websocket',socket=>{if(!new URL(socket.url()).pathname.endsWith('/v3/audio'))return;socket.on('framereceived',event=>{if(typeof event.payload!=='string')return;const value=JSON.parse(event.payload);if(value.type==='revision'&&!marked.has('transcript')){marked.add('transcript');observer.mark('transcript');}if(value.type==='risk'&&value.event?.status==='analyzed'&&!marked.has('analysis')){marked.add('analysis');observer.mark('analysis');}});});
 await control({op:'reset'});const before=await control({op:'state'});expect(before.streams).toHaveLength(0);expect(before.requests).toHaveLength(0);
 await page.getByRole('button',{name:'상대 음성 분석에 동의',exact:true}).click();await expect.poll(async()=>(await control({op:'state'})).streams[0]?.frames??0).toBeGreaterThan(0);
 // Observe accepted authenticated WS audio at the provider boundary, not CDP payload representation.
 marked.add('ai-input');observer.mark('ai-input');
 expect(await page.evaluate(()=>{const w=window as any,peers=w.callSignTestPeers as RTCPeerConnection[],remote=peers.flatMap(p=>p.getReceivers().map(r=>r.track.id)),local=peers.flatMap(p=>p.getSenders().flatMap(s=>s.track?[s.track.id]:[]));return w.callSignRecorderTracks.length>0&&w.callSignRecorderTracks.flat().every((id:string)=>remote.includes(id)&&!local.includes(id));})).toBe(true);
 await control({op:'emit',stream:0,revision:1});await expect.poll(async()=>(await control({op:'state'})).requests.length).toBe(1);await control({op:'resolve',request:0,mode:'suspected'});
 const panel=page.locator('.service-analysis');await expect(panel.getByRole('heading',{name:'위험 요구 분석'})).toBeVisible();expect(await panel.locator('strong').count()).toBeGreaterThan(0);await expect(page.getByText('상대 발화 분석 결과 수신 · 통화 전체 안전 판정 아님',{exact:true})).toBeVisible();observer.mark('warning-visible');if(captureWarning)await captureWarning();expect(marked.has('ai-input')&&marked.has('transcript')&&marked.has('analysis')).toBe(true);
 await control({op:'emit',stream:0,revision:2});await expect.poll(async()=>(await control({op:'state'})).requests.length).toBe(2);
 await page.getByRole('button',{name:'분석 동의 철회·삭제',exact:true}).click();await expect.poll(async()=>(await control({op:'state'})).streams[0]?.stopped).toBe(true);await expect.poll(async()=>(await control({op:'state'})).requests[1]?.aborted).toBe(true);
 const stopped=await control({op:'state'});await control({op:'resolve',request:1,mode:'suspected'});await expect(panel.locator('strong')).toHaveCount(0);expect((await control({op:'state'})).streams[0]!.frames).toBe(stopped.streams[0]!.frames);
 // Regrant leaves one pending result so termination/authority revocation must cancel the real ServiceCall.
 await page.getByRole('button',{name:'상대 음성 분석에 동의',exact:true}).click();await expect.poll(async()=>(await control({op:'state'})).streams.length).toBe(2);await control({op:'emit',stream:1,revision:1});await expect.poll(async()=>(await control({op:'state'})).requests.length).toBe(3);
 return async()=>{await expect.poll(async()=>(await control({op:'state'})).streams.every(s=>s.stopped)).toBe(true);await expect.poll(async()=>(await control({op:'state'})).requests[2]?.aborted).toBe(true);const state=await control({op:'state'});await control({op:'resolve',request:2,mode:'suspected'});expect((await control({op:'state'})).streams.map(s=>s.frames)).toEqual(state.streams.map(s=>s.frames));await expect(panel.locator('strong')).toHaveCount(0);};
}

export async function exercisePaidCallAnalysis(sender:Page,recipient:Page,observer:CallObserver,capture:(events:unknown[])=>Promise<void>){
 const audio=process.env.CALLSIGN_MEDIA_PAID_AUDIO;
 if(process.env.CALLSIGN_MEDIA_PERSISTENT_DEMO_CONFIRMATION!=='OWNED_PUBLIC_DEMO'||process.env.CALLSIGN_MEDIA_PAID_APPROVAL!=='public-audio-20261106-completion2'||!audio)throw Error('EXPLICIT_PAID_SMOKE_APPROVAL_REQUIRED');
 let revisions=0,analyses=0,sent=0;const started=performance.now(),events:unknown[]=[];
 recipient.on('websocket',socket=>{if(!new URL(socket.url()).pathname.endsWith('/v3/audio'))return;const closed=(type:string)=>{if(events.length<100)events.push({elapsedMs:Math.round(performance.now()-started),utc:new Date().toISOString(),type});};socket.on('close',()=>closed('close'));socket.on('socketerror',()=>closed('socketerror'));socket.on('framesent',()=>{sent++;});socket.on('framereceived',frame=>{if(typeof frame.payload!=='string')return;const value=JSON.parse(frame.payload);if(events.length<100)events.push({elapsedMs:Math.round(performance.now()-started),utc:new Date().toISOString(),type:value.type,status:value.event?.status,engine:value.event?.engine,code:value.code,final:value.revision?.final,contextRevision:value.event?.contextRevision});if(value.type==='revision')revisions++;if(value.type==='risk'&&value.event?.status==='analyzed'&&value.event.engine==='rules+llm')analyses++;});});
 expect(await recipient.evaluate(()=>(window as any).callSignRecorderTracks.length)).toBe(0);
 await recipient.getByRole('button',{name:'상대 음성 분석에 동의',exact:true}).click();
 try{
  await expect.poll(()=>recipient.evaluate(()=>{const w=window as any,peers=w.callSignTestPeers as RTCPeerConnection[],remote=peers.flatMap(p=>p.getReceivers().map(r=>r.track.id)),local=peers.flatMap(p=>p.getSenders().flatMap(s=>s.track?[s.track.id]:[]));return w.callSignRecorderTracks.length>0&&w.callSignRecorderTracks.flat().every((id:string)=>remote.includes(id)&&!local.includes(id));})).toBe(true);
  const [chooser]=await Promise.all([sender.waitForEvent('filechooser'),sender.getByLabel('녹음 파일 송출 (최대 20MB)',{exact:true}).click()]);await chooser.setFiles(audio);
  await expect(sender.getByText('녹음 파일 송출 중',{exact:true})).toBeVisible();
  await expect.poll(()=>revisions,{timeout:20000}).toBeGreaterThan(0);observer.mark('transcript');
  await expect.poll(()=>analyses,{timeout:40000}).toBeGreaterThan(0);observer.mark('analysis');
  const finding=recipient.locator('.service-analysis article').filter({hasText:/· AI · 요구 탐지/}).first();
  await expect(finding).toBeVisible();await expect(finding.locator('q').first()).toContainText(/\S/);
  await expect(finding.getByText('적용 기준·근거 정보',{exact:true})).toBeVisible();
  await expect(recipient.getByText('상대 발화 분석 결과 수신 · 통화 전체 안전 판정 아님',{exact:true})).toBeVisible();observer.mark('warning-visible');
 }finally{
  try{events.push({type:'browser-lifecycle',sentFrames:sent,...await recipient.evaluate(()=>({clock:'recipient-performance.now',nowMs:performance.now(),hidden:document.hidden,lifecycle:(window as any).callSignAnalysisLifecycle}))});await capture(events);}finally{
  await recipient.getByRole('button',{name:'분석 동의 철회·삭제',exact:true}).click();
  const stop=sender.getByRole('button',{name:'파일 송출 중지 · 마이크 사용',exact:true});if(await stop.isVisible())await stop.click();
  }
 }
 const before=sent;await recipient.waitForTimeout(1500);expect(sent).toBe(before);
 await expect(recipient.locator('.service-analysis strong')).toHaveCount(0);
 await expect.poll(()=>recipient.evaluate(()=>(window as any).callSignTestPeers.some((peer:RTCPeerConnection)=>peer.connectionState==='connected'))).toBe(true);
}
