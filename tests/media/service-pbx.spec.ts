import {writeFile} from 'node:fs/promises';
import {analysisControl,exerciseServiceCallAnalysis,exercisePaidCallAnalysis,installAnalysisTrackObserver} from './analysis-path.js';
import {CallObserver} from '../../scripts/evaluate-performance.js';
import {assertCallTrialTarget,callTrialBrowserArgs} from '../../scripts/call-trials.js';
import {parseSip} from '../../apps/web/src/lib/pbxSip.js';
import { expect,test,type Page,type Browser,type BrowserContext } from '@playwright/test';
test('URI PBX path: no microphone transmission before acceptance, signed connection, logout cleanup',async({playwright},testInfo)=>{
 const observation=new CallObserver('playwright-'+crypto.randomUUID());let outcome:'success'|'failure'|'timeout'='failure',reclaimed=false,testFailed=false;let attempt='';
 const pagePath=process.env.CALLSIGN_MEDIA_PAGE_PATH??'/service';if(!['/service','/demo/call'].includes(pagePath))throw new Error('MEDIA_PAGE_PATH_INVALID');
 const origin=process.env.CALLSIGN_MEDIA_ORIGIN,senderState=process.env.CALLSIGN_MEDIA_GATEWAY_STORAGE,recipientState=process.env.CALLSIGN_MEDIA_RECIPIENT_STORAGE,intentId=process.env.CALLSIGN_MEDIA_INTENT_ID,digest=process.env.CALLSIGN_MEDIA_CREDENTIAL_DIGEST;
 test.skip(!origin||!senderState||!recipientState||!intentId||!digest,'NOT-RUN: explicitly approved PBX stack, registered URI trust and separately authenticated roles required');
 const waves=[process.env.CALLSIGN_MEDIA_SENDER_WAV,process.env.CALLSIGN_MEDIA_RECIPIENT_WAV];
 if(waves.some(w=>!w)||waves[0]===waves[1])throw new Error('DISTINCT_SYNTHETIC_WAV_FILES_REQUIRED_NO_HUMAN_MICROPHONE');
 const diagnostics:unknown[]=[],diagnosticsStarted=performance.now();const note=(value:Record<string,unknown>)=>{if(diagnostics.length<150)diagnostics.push({observerElapsedMs:performance.now()-diagnosticsStarted,...value});};
 note({clock:'observer-performance.now',wallUtc:new Date().toISOString()});
 const browsers:Browser[]=[],contexts:BrowserContext[]=[];let finishAnalysis:(()=>Promise<void>)|undefined;
 try{
  for(let i=0;i<2;i++){const b=await playwright.chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+waves[i],...callTrialBrowserArgs(process.env)],...(process.env.CALLSIGN_BROWSER_PATH?{executablePath:process.env.CALLSIGN_BROWSER_PATH}:{})});browsers.push(b);contexts.push(await b.newContext({storageState:[senderState,recipientState][i]!,permissions:['microphone'],...(pagePath==='/demo/call'?{viewport:i===0?{width:1366,height:768}:{width:390,height:844}}:{})}));}
  // Chromium recommends disabling capture processing for calibrated fake WAV input; product microphone defaults stay unchanged.
  for(const context of contexts)await context.addInitScript(()=>{const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(constraints={})=>capture({...constraints,...(constraints.audio?{audio:{...(typeof constraints.audio==='object'?constraints.audio:{}),echoCancellation:false,noiseSuppression:false,autoGainControl:false}}:{})});});
  note({syntheticAudioProcessing:'disabled-for-frequency-calibration'});
  for(const context of contexts)await installAnalysisTrackObserver(context);
  for(const context of contexts){await context.route('**/*',route=>{const url=new URL(route.request().url()),signaling=process.env.CALLSIGN_MEDIA_SIGNALING_ORIGIN;return url.origin===new URL(origin!).origin||(process.env.CALLSIGN_MEDIA_PERSISTENT_DEMO_CONFIRMATION==='OWNED_PUBLIC_DEMO'&&signaling===url.origin&&url.pathname==='/pbx/ws')?route.continue():route.abort('blockedbyclient');});}
  for(const context of contexts)await context.addInitScript(({forceRelay})=>{const peers:RTCPeerConnection[]=[];(window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers=peers;const Native=window.RTCPeerConnection;window.RTCPeerConnection=class extends Native{constructor(c?:RTCConfiguration){super({...c,...(forceRelay?{iceTransportPolicy:"relay"}:{})});peers.push(this);this.addEventListener('icegatheringstatechange',()=>console.warn('CallSign ICE diagnostic',JSON.stringify({event:'gathering',state:this.iceGatheringState})));this.addEventListener('icecandidate',e=>console.warn('CallSign ICE diagnostic',JSON.stringify({event:'candidate',type:e.candidate?.type??'complete',protocol:e.candidate?.protocol})));this.addEventListener('icecandidateerror',e=>console.warn('CallSign ICE diagnostic',JSON.stringify({event:'candidate-error',code:e.errorCode,reason:/lookup/i.test(e.errorText)?'DNS_LOOKUP':/allocate.*timed out/i.test(e.errorText)?'ALLOCATION_TIMEOUT':/not associated/i.test(e.errorText)?'INTERFACE_UNAVAILABLE':'OTHER'})));}};},{forceRelay:process.env.CALLSIGN_EXPECT_TRANSPORT==='turn'});
  const connection=(page:Page)=>page.locator('.service-verification').locator('dt').filter({hasText:/^현재 연결$/}).locator('..').locator('dd');
  const sender=await contexts[0]!.newPage(),receiver=await contexts[1]!.newPage();
  for(const [role,page] of [['sender',sender],['recipient',receiver]] as const){
   page.on('console',message=>{if(message.type()==='warning'&&(message.text().startsWith('CallSign SIP negotiation failed')||message.text().startsWith('CallSign ICE diagnostic')||message.text().startsWith('CallSign call verification failed')))note({role,connectionDiagnostic:message.text()});});
   page.on('requestfailed',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/api/'))note({role,path,requestFailed:true,networkCode:/^net::ERR_[A-Z_]+$/.test(request.failure()?.errorText??'')?request.failure()?.errorText:'UNCLASSIFIED',aborted:request.failure()?.errorText==='net::ERR_ABORTED'});});
   page.on('response',response=>{const path=new URL(response.url()).pathname;if(['/api/v3/auth/me','/api/v3/workspace','/api/v3/claim'].includes(path))note({role,path,httpStatus:response.status()});if(path.startsWith('/api/')&&response.status()>=400)void response.json().then(body=>note({role,path,status:response.status(),code:/^[A-Z_]{3,80}$/.test(body?.error?.code??'')?body.error.code:'UNKNOWN'})).catch(()=>{});});
   page.on('websocket',socket=>{if(new URL(socket.url()).pathname!=='/pbx/ws')return;socket.on('framereceived',frame=>{if(typeof frame.payload!=='string')return;try{const message=parseSip(frame.payload);note({role,sip:message.start.startsWith('SIP/2.0')?message.start.split(' ').slice(0,2).join(' '):message.start.split(' ')[0],hasRecordRoute:message.headers.has('record-route'),sdp:message.headers.get('content-type')?.[0]==='application/sdp'});}catch(error){note({role,parseError:error instanceof Error?error.message:'UNKNOWN'});}});socket.on('close',()=>note({role,sipSocketClosed:true}));});
  }
  await sender.goto(`${origin}${pagePath}`);
  const identity=await sender.request.get(`${origin}/api/v3/runtime-identity`);expect(identity.ok()).toBe(true);const target=await identity.json();assertCallTrialTarget(target,process.env);

  if(pagePath==='/demo/call')await sender.getByLabel('확인할 업무',{exact:true}).selectOption(intentId!);
  if(pagePath==='/demo/call'){
   await sender.getByText('연결 준비 상세 · 위임과 통화 선택',{exact:true}).click();await sender.getByLabel('위임 증서',{exact:true}).selectOption(digest!);
   observation.mark('authorization-request');
   const created=sender.waitForResponse(r=>r.url().includes('/api/v3/attempts')&&r.request().method()==='POST',{timeout:15000}),approved=sender.waitForResponse(r=>r.url().includes('/api/v3/authorizations')&&r.request().method()==='POST',{timeout:15000});
   await sender.getByRole('button',{name:'연락 준비',exact:true}).click();const response=await created;expect(response.ok()).toBe(true);attempt=(await response.json()).id;
   await writeFile(testInfo.outputPath('attempt.json'),JSON.stringify({attemptId:attempt}),{mode:0o600});expect((await approved).ok()).toBe(true);observation.mark('authorization-response');
   await receiver.goto(`${origin}${pagePath}`);await receiver.getByLabel('확인할 업무',{exact:true}).selectOption(intentId!);await receiver.getByRole('button',{name:'연락 받을 준비',exact:true}).click();
  }else{
  const [created]=await Promise.all([sender.waitForResponse(r=>r.url().includes('/api/v3/attempts')&&r.request().method()==='POST',{timeout:15000}),(pagePath==='/demo/call'?sender:sender.locator('li').filter({hasText:intentId!})).getByRole('button',{name:'새 통화 시도',exact:true}).click()]);expect(created.ok()).toBe(true);attempt=(await created.json()).id;await expect(sender.getByLabel('선택한 통화 시도',{exact:true})).toHaveValue(attempt);await writeFile(testInfo.outputPath('attempt.json'),JSON.stringify({attemptId:attempt}),{mode:0o600});await sender.getByLabel('위임 증서',{exact:true}).selectOption(digest!);observation.mark('authorization-request');const [approvalResponse]=await Promise.all([sender.waitForResponse(r=>r.url().includes('/api/v3/authorizations')&&r.request().method()==='POST',{timeout:15000}),sender.getByRole('button',{name:'개별 연락 승인 받기'}).click()]);expect(approvalResponse.ok()).toBe(true);observation.mark('authorization-response');
  attempt=await sender.getByLabel('선택한 통화 시도',{exact:true}).inputValue();await receiver.goto(`${origin}${pagePath}`);if(pagePath==='/demo/call')await receiver.getByLabel('확인할 업무',{exact:true}).selectOption(intentId!);await receiver.getByLabel('선택한 통화 시도',{exact:true}).selectOption(attempt);
  await sender.getByRole('button',{name:'마이크 준비 및 PBX 등록'}).click();await receiver.getByRole('button',{name:'마이크 준비 및 PBX 등록'}).click();
  }
  await expect(connection(sender)).toHaveText('PBX 등록 완료: 양측 연결 준비를 기다립니다',{timeout:15000});await expect(connection(receiver)).toHaveText('PBX 등록 완료: 양측 연결 준비를 기다립니다',{timeout:15000});
  await sender.getByRole('button',{name:'양측 웹으로 발신'}).click();
  const observed=(page:Page)=>page.evaluate(async()=>{let sent=0,received=0,energy=0,samples=0;for(const pc of (window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers)for(const r of (await pc.getStats()).values())if(r.kind==='audio'){if(r.type==='outbound-rtp')sent+=Number(r.bytesSent??0);if(r.type==='inbound-rtp'){received+=Number(r.bytesReceived??0);energy+=Number(r.totalAudioEnergy??0);samples+=Number(r.totalSamplesReceived??0);}}return {sent,received,energy,samples};});
  // Disabled tracks may send silence/CN RTP; decoded energy and track gating decide pre-accept safety.
  const sent=async()=>(await observed(sender)).sent;
  await expect(connection(receiver)).toContainText('PBX 협상 완료',{timeout:20000});for(const page of [sender,receiver])expect(await page.evaluate(()=>(window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers.every(pc=>pc.getSenders().every(sender=>!sender.track||!sender.track.enabled)))).toBe(true);expect((await observed(sender)).energy).toBe(0);expect((await observed(receiver)).energy).toBe(0);await expect.poll(()=>receiver.evaluate(()=>(window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers.every(pc=>pc.getReceivers().every(r=>!r.track||!r.track.enabled)))).toBe(true);await expect.poll(()=>sender.evaluate(()=>(window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers.every(pc=>pc.getReceivers().every(r=>!r.track||!r.track.enabled)))).toBe(true);
  await testInfo.attach('before-accept-media',{body:JSON.stringify({sender:await observed(sender),recipient:await observed(receiver)}),contentType:'application/json'});
  observation.mark('connect-action');await receiver.getByRole('button',{name:'통화 수락 및 검증 시작'}).click();await expect(connection(receiver)).toHaveText('양측 세션과 PBX 연결 검증 후 통화 중',{timeout:process.env.CALLSIGN_MEDIA_PERSISTENT_DEMO_CONFIRMATION==='OWNED_PUBLIC_DEMO'?60000:20000});observation.mark('verification-visible');await expect.poll(sent).toBeGreaterThan(0);await expect.poll(async()=>(await observed(receiver)).sent).toBeGreaterThan(0);await expect.poll(async()=>(await observed(receiver)).received).toBeGreaterThan(0);await expect.poll(async()=>(await observed(sender)).received).toBeGreaterThan(0);await expect.poll(async()=>(await observed(sender)).energy).toBeGreaterThan(0);await expect.poll(async()=>(await observed(receiver)).energy).toBeGreaterThan(0);await expect.poll(async()=>(await observed(sender)).samples).toBeGreaterThan(0);await expect.poll(async()=>(await observed(receiver)).samples).toBeGreaterThan(0);
  await testInfo.attach('received-audio-before-frequency-check',{body:JSON.stringify({sender:await observed(sender),recipient:await observed(receiver)}),contentType:'application/json'});
  const decoded=async(page:Page,remoteHz:number,ownHz:number)=>page.evaluate(async({remoteHz,ownHz})=>{const ctx=new AudioContext();try{await ctx.resume();let remote=0,own=0;for(const pc of (window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers)for(const receiver of pc.getReceivers()){if(receiver.track?.kind!=='audio')continue;const analyser=ctx.createAnalyser();analyser.fftSize=4096;ctx.createMediaStreamSource(new MediaStream([receiver.track])).connect(analyser);await new Promise(r=>setTimeout(r,100));const bins=new Float32Array(analyser.frequencyBinCount);analyser.getFloatFrequencyData(bins);const power=(hz:number)=>{const index=Math.round(hz/ctx.sampleRate*analyser.fftSize);return 10**(Math.max(...Array.from(bins.slice(Math.max(0,index-2),index+3)),-120)/20);};remote=Math.max(remote,power(remoteHz));own=Math.max(own,power(ownHz));}return {remote,own,contextState:ctx.state};}finally{await ctx.close();}},{remoteHz,ownHz});
  // The two input WAVs must carry 660Hz and 990Hz respectively. Decoding, not RTP counters, decides success.
  for(const [page,remoteHz,ownHz] of [[sender,990,660],[receiver,660,990]] as const){await expect.poll(async()=>{const x=await decoded(page,remoteHz,ownHz);note({role:page===sender?'sender':'recipient',frequencyEnergy:x});return x.remote>.003&&x.remote>x.own*3;}).toBe(true);}
  for(const page of [sender,receiver]){const relayed=await page.evaluate(async()=>{const results:boolean[]=[];for(const pc of (window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers){const stats=await pc.getStats();for(const item of stats.values())if(item.type==='transport'&&item.selectedCandidatePairId){const pair=stats.get(item.selectedCandidatePairId);results.push(stats.get(pair?.localCandidateId)?.candidateType==='relay'||stats.get(pair?.remoteCandidateId)?.candidateType==='relay');}}return results;});expect(relayed.length).toBeGreaterThan(0);if(process.env.CALLSIGN_EXPECT_TRANSPORT)expect(relayed.every(v=>v===(process.env.CALLSIGN_EXPECT_TRANSPORT==='turn'))).toBe(true);}
  observation.mark('remote-decoded-both');
  if(process.env.CALLSIGN_MEDIA_RECORDING_WAV){
   const [chooser]=await Promise.all([sender.waitForEvent('filechooser',{timeout:10000}),sender.getByLabel('녹음 파일 송출 (최대 20MB)',{exact:true}).click()]);await chooser.setFiles(process.env.CALLSIGN_MEDIA_RECORDING_WAV);
   await expect(sender.getByText('녹음 파일 송출 중',{exact:true})).toBeVisible();
   await expect.poll(async()=>{const value=await decoded(receiver,440,660);return value.remote>.003&&value.remote>value.own*3;}).toBe(true);
   await sender.getByRole('button',{name:'파일 송출 중지 · 마이크 사용',exact:true}).click();
   await expect.poll(async()=>{const value=await decoded(receiver,660,440);return value.remote>.003&&value.remote>value.own*3;}).toBe(true);note({recordingSwitch:'actual-sender-track-to-remote-440Hz-and-back-to-microphone-660Hz'});
  }
  if(pagePath==='/demo/call'){
   await sender.evaluate(()=>{(window as unknown as {savedCallPeers:RTCPeerConnection[];callSignTestPeers:RTCPeerConnection[]}).savedCallPeers=[...(window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers];});
   await sender.getByRole('link',{name:'공동 관리',exact:true}).click();await sender.getByRole('link',{name:'연락 검증',exact:true}).click();
   expect(await sender.evaluate(()=>{const w=window as unknown as {savedCallPeers:RTCPeerConnection[];callSignTestPeers:RTCPeerConnection[]};return w.savedCallPeers.every((p,i)=>p===w.callSignTestPeers[i]&&p.connectionState==='connected');})).toBe(true);
   await expect.poll(async()=>(await decoded(receiver,660,990)).remote).toBeGreaterThan(.003);
  }
  for(const [name,page] of [['sender',sender],['recipient',receiver]] as const){await page.evaluate(()=>window.scrollTo(0,0));await testInfo.attach(name+'-actual-call-viewport',{body:await page.screenshot(),contentType:'image/png'});await testInfo.attach(name+'-actual-call',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});}

  if(process.env.CALLSIGN_MEDIA_ANALYSIS_MODE==='fixture')finishAnalysis=await exerciseServiceCallAnalysis(receiver,await analysisControl(process.env),observation);
  if(process.env.CALLSIGN_MEDIA_ANALYSIS_MODE==='paid-smoke')await exercisePaidCallAnalysis(sender,receiver,observation,async(events)=>{await testInfo.attach('provider-event-states',{body:JSON.stringify(events),contentType:'application/json'});await testInfo.attach('actual-provider-analysis',{body:await receiver.screenshot({fullPage:true}),contentType:'image/png'});});
  await testInfo.attach('two-way-decoded-audio',{body:JSON.stringify({sender:await observed(sender),recipient:await observed(receiver)}),contentType:'application/json'});
  observation.mark(process.env.CALLSIGN_TRIAL_MODE==='normal-end'?'termination-request':'revocation-request');
  if(['work-cancel','emergency-stop'].includes(process.env.CALLSIGN_TRIAL_MODE??'')){
   const state=process.env.CALLSIGN_MEDIA_INSTITUTION_STORAGE;if(!state)throw Error('INDEPENDENT_INSTITUTION_SESSION_REQUIRED');
   const institution=await playwright.request.newContext({storageState:state});
   try{
    const me=await institution.get(`${origin}/api/v3/auth/me?purpose=work`);expect(me.ok()).toBe(true);const auth=await me.json();
    const workspace=await institution.get(`${origin}/api/v3/workspace`);expect(workspace.ok()).toBe(true);expect((await workspace.json()).actor.role).toBe('institution');
    const stopping=process.env.CALLSIGN_TRIAL_MODE==='emergency-stop';
    if(!stopping&&pagePath==='/demo/call'){
     const context=await browsers[0]!.newContext({storageState:state});contexts.push(context);const page=await context.newPage();
     const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v3/workspace'),page.goto(`${origin}/demo/work`)]);expect(response.ok()).toBe(true);
     const data=await response.json(),index=data.intents.findIndex((work:{id:string})=>work.id===intentId);expect(index).toBeGreaterThanOrEqual(0);
     await page.locator('.work-select').nth(index).click();await page.getByRole('button',{name:'선택 업무 취소',exact:true}).click();
     const [cancelled]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v3/cancel'&&r.request().method()==='POST'),page.getByRole('button',{name:'이 업무 취소 요청',exact:true}).click()]);expect(cancelled.ok()).toBe(true);
     note({managementAction:'work-cancel',source:'actual-independent-institution-work-ui',status:cancelled.status()});
     await testInfo.attach('institution-cancelled-work',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
    }else{const cancelled=await institution.post(`${origin}/api/v3/${stopping?'management/suspend':'cancel'}`,{headers:{origin:new URL(origin!).origin,'x-csrf-token':auth.csrfToken,'idempotency-key':crypto.randomUUID()},data:stopping?{}:{intentId}});expect(cancelled.ok()).toBe(true);note({managementAction:stopping?'emergency-stop':'work-cancel',source:'actual-independent-institution-api',status:cancelled.status()});}
   }finally{await institution.dispose();}
  }else await sender.getByRole('button',{name:process.env.CALLSIGN_TRIAL_MODE==='normal-end'?'통화 종료':'로그아웃 및 연결 회수',exact:true}).click();await expect(receiver.locator('dt').filter({hasText:/^현재 연결$/}).locator('..').locator('dd').filter({hasText:/^통화 종료:/})).toBeVisible({timeout:10000});observation.mark('ui-recalled');
  await expect.poll(()=>receiver.evaluate(()=>(window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers.every(pc=>pc.connectionState==='closed'&&pc.getSenders().every(s=>!s.track||s.track.readyState==='ended')))).toBe(true);
  for(const [page,remoteHz,ownHz] of [[sender,990,660],[receiver,660,990]] as const)await expect.poll(async()=>(await decoded(page,remoteHz,ownHz)).remote).toBeLessThan(.003);observation.mark('audio-reclaimed');
  if(process.env.CALLSIGN_TRIAL_MODE==='work-cancel'){
   const auth=await(await sender.request.get(`${origin}/api/v3/auth/me?purpose=work`)).json();
   const rejected=await sender.request.post(`${origin}/api/v3/attempts`,{headers:{origin:new URL(origin!).origin,'x-csrf-token':auth.csrfToken,'idempotency-key':crypto.randomUUID()},data:{intentId,profile:'asterisk-webrtc-v3'}});
   expect(rejected.status()).toBe(409);note({cancelledWorkRedial:'rejected',status:rejected.status()});
  }
  if(finishAnalysis)await finishAnalysis();outcome='success';
  // Default mode grants no consent; fixture mode never contacts a paid provider.
 }catch(error){testFailed=true;if(testInfo.status==='timedOut'||/timeout|timed out/i.test((error as Error).message))outcome='timeout';throw error;}finally{
  note({phase:'before-cleanup'});
  for(const [role,context] of [['sender',contexts[0]],['recipient',contexts[1]]] as const){const page=context?.pages()[0];if(page)try{note({role,transport:await page.evaluate(async()=>{const results=[];for(const pc of (window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers){const stats=await pc.getStats();results.push({connection:pc.connectionState,ice:pc.iceConnectionState,gathering:pc.iceGatheringState,dtls:[...stats.values()].filter(v=>v.type==='transport').map(v=>v.dtlsState),candidatePairs:[...stats.values()].filter(v=>v.type==='candidate-pair').map(v=>({state:v.state,nominated:v.nominated})),relayCandidates:[...stats.values()].filter(v=>v.type==='local-candidate'&&v.candidateType==='relay').length});}return results;})});}catch{note({role,transport:'observation-unavailable'});}}
  await writeFile(testInfo.outputPath('pre-cleanup-diagnostics.json'),JSON.stringify(diagnostics),{mode:0o600});
  await writeFile(testInfo.outputPath('partial-call-observation.json'),JSON.stringify({...observation.finish(outcome),partial:true}),{mode:0o600});
  const receiver=contexts[1]?.pages()[0]??contexts[0]?.pages()[0];
  if(receiver&&attempt)try{
   const session=await receiver.request.get(`${origin}/api/v3/auth/me?purpose=work`,{timeout:5000});
   if(session.ok()){
    const auth=await session.json(),terminal=['ended','declined','failed','cancelled','no-answer'];
    const before=await receiver.request.get(`${origin}/api/v3/call-context?attemptId=${encodeURIComponent(attempt)}`,{timeout:5000});expect(before.ok()).toBe(true);
    if(!terminal.includes((await before.json()).attempt.status)){
     const cleanup=await receiver.request.post(`${origin}/api/v3/outcome`,{timeout:5000,headers:{origin:new URL(origin!).origin,'x-csrf-token':auth.csrfToken,'idempotency-key':crypto.randomUUID()},data:{attemptId:attempt,outcome:'failed',reason:'trial-finally-cleanup'}});expect(cleanup.ok()||cleanup.status()===409).toBe(true);
    }
    await expect.poll(async()=>{const r=await receiver.request.get(`${origin}/api/v3/call-context?attemptId=${encodeURIComponent(attempt)}`,{timeout:5000});if(!r.ok())return false;const t=(await r.json()).attempt;return terminal.includes(t.status)&&(!t.pbx||t.cleanup?.status==='pbx-absent');},{timeout:10000}).toBe(true);reclaimed=true;
   }
  }catch{/* Unknown cleanup stops subsequent trials. */}
  if(reclaimed)observation.mark('resources-reclaimed');else if(outcome!=='timeout')outcome='failure';
  await testInfo.attach('connection-diagnostics',{body:JSON.stringify(diagnostics),contentType:'application/json'});
  await Promise.all(contexts.map(c=>c.close()));await Promise.all(browsers.map(b=>b.close()));
  if(process.env.CALLSIGN_CALL_OBSERVATION_PATH)await writeFile(process.env.CALLSIGN_CALL_OBSERVATION_PATH,JSON.stringify(observation.finish(outcome)),{flag:'wx',mode:0o600});
  if(!testFailed)expect(reclaimed,'Terminal state alone is not observed PBX cleanup').toBe(true);
 }
});
