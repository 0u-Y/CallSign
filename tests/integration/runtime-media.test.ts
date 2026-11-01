// Starts only the local OIDC fixture. Owned final-image services are started by the operator outside this process.
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration'||process.env.CALLSIGN_RUNTIME_IMAGE_CONFIRMATION!=='OWNED_FINAL_IMAGE'||!process.env.CALLSIGN_CHAIN_TEST_ROOT)throw new Error('OWNED_RUNTIME_MEDIA_REQUIRED');
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHttpFixture,type HttpFixture} from './service-http-fixture.js';
const root=process.env.CALLSIGN_CHAIN_TEST_ROOT!;
let f:HttpFixture;
beforeAll(async()=>{
 f=await createHttpFixture({web:false,liveDirectory:root,...(process.env.CALLSIGN_RUNTIME_RESUME_OIDC?{resumeOidc:process.env.CALLSIGN_RUNTIME_RESUME_OIDC}:{}),webOrigin:'https://127.0.0.1:8443',startExternal:async prepared=>{
  await writeFile(join(root,'image-services-request.json'),JSON.stringify(prepared),{flag:'wx',mode:0o600});
  await vi.waitFor(async()=>{const r=JSON.parse(await readFile(join(root,'image-services-started.json'),'utf8'));expect(r.appImage).toBe(process.env.CALLSIGN_EXPECTED_RUNTIME_IMAGE);expect(r.noApplicationSourceMounts).toBe(true);},{timeout:120000,interval:250});
  return 'http://127.0.0.1:4100';
 }});await f.start();
},150000);
afterAll(async()=>{await f?.close();});
it('boots final image roles with real SQL, CA, RPC and processes an actual delegation',async()=>{
 const staff=await f.login('staff');expect(staff.done.status,JSON.stringify(staff.done.body)).toBe(200);
 const c=JSON.parse(await readFile(join(root,'live-http-context.json'),'utf8'));
 if(process.env.CALLSIGN_RUNTIME_RESUME_OIDC){const record=await f.state();const credential=Object.values(record.serviceV3!.credentials).find(c=>c.state==='registered');expect(credential,'Existing real worker delegation must be confirmed').toBeDefined();const digest=Object.entries(record.serviceV3!.credentials).find(([,c])=>c===credential)![0];await writeFile(join(root,'media-contact.json'),JSON.stringify({intentId:'media-contact',digest,institutionId:f.id,apiOrigin:f.apiOrigin,webOrigin:f.origin}),{flag:'wx',mode:0o600});return;}
 const intent=await staff.c.request('/v3/intents',{id:'media-contact',recipientId:f.uid('recipient'),agentId:f.uid('agent'),serviceUri:c.serviceUri,expiresAt:Math.floor(Date.now()/1000)+3600});expect(intent.status,JSON.stringify(intent.body)).toBe(200);
 const vc=await staff.c.request('/v3/credentials',{serviceUri:c.serviceUri});expect(vc.status,JSON.stringify(vc.body)).toBe(200);expect(vc.body.state).toBe('pending');
 await vi.waitFor(async()=>{expect((await f.state()).serviceV3!.credentials[vc.body.digest]!.state).toBe('registered');},{timeout:20000,interval:250});
 const snapshot=await staff.c.request('/v3/state?digest='+vc.body.digest);expect(snapshot.status,JSON.stringify(snapshot.body)).toBe(200);expect(snapshot.body.signatures.length).toBeGreaterThanOrEqual(3);
 await writeFile(join(root,'media-contact.json'),JSON.stringify({intentId:'media-contact',digest:vc.body.digest,institutionId:f.id,apiOrigin:f.apiOrigin,webOrigin:f.origin}),{flag:'wx',mode:0o600});
});

it.each(['logout','work-cancel','lease-expiry','delegation-revoke','emergency-stop'] as const)('proves decoded relay-only two-way audio and reclamation after %s',async outcome=>{
 const {chromium}=await import('@playwright/test');
 const browsers=await Promise.all(['sender','recipient'].map(role=>chromium.launch({executablePath:'/opt/browser-cache/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--allow-loopback-in-peer-connection','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture=/run/callsign/'+role+'.wav','--autoplay-policy=no-user-gesture-required'],env:{...process.env,LD_LIBRARY_PATH:'/host-libs',HOME:'/tmp/callsign-media-home'}})));
 const contexts=await Promise.all(browsers.map(b=>b.newContext({permissions:['microphone']})));
 const responses:{path:string;status:number}[]=[];const sipFrames:unknown[]=[];const errors:string[]=[];const failures:{path:string;status:number;code?:string}[]=[];
 try{
  for(const context of contexts)await context.addInitScript(()=>{const peers:RTCPeerConnection[]=[];(window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers=peers;const Native=window.RTCPeerConnection;window.RTCPeerConnection=class extends Native{constructor(c?:RTCConfiguration){super({...c,iceTransportPolicy:'relay'});peers.push(this);const timeline:unknown[]=[];(this as unknown as {timeline:unknown[]}).timeline=timeline;for(const event of ['iceconnectionstatechange','connectionstatechange','signalingstatechange'])this.addEventListener(event,()=>timeline.push({at:performance.now(),event,ice:this.iceConnectionState,connection:this.connectionState,signaling:this.signalingState}));}};});
  const sender=await contexts[0]!.newPage(),receiver=await contexts[1]!.newPage();
  for(const page of [sender,receiver]){page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.stack??e.message));page.on('websocket',ws=>{if(!ws.url().includes('/pbx/ws'))return;const capture=(event:string,frame:{payload:string|Buffer})=>sipFrames.push({event,headers:(String(frame.payload).split('\r\n\r\n')[0]??'').split('\r\n').filter(line=>!/^Authorization:/i.test(line))});ws.on('framereceived',frame=>capture('received',frame));ws.on('framesent',frame=>capture('sent',frame));});page.on('response',async response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/api/'))responses.push({path,status:response.status()});if(path.startsWith('/api/')&&response.status()>=400){const body=await response.json().catch(()=>({}));failures.push({path,status:response.status(),code:body.error?.code});}});}
  const contact=JSON.parse(await readFile(join(root,'media-contact.json'),'utf8'));
  const staff=await f.login('staff'),live=JSON.parse(await readFile(join(root,'live-http-context.json'),'utf8'));contact.intentId='media-'+outcome+'-'+crypto.randomUUID();
  const intent=await staff.c.request('/v3/intents',{id:contact.intentId,recipientId:f.uid('recipient'),agentId:f.uid('agent'),serviceUri:live.serviceUri,expiresAt:Math.floor(Date.now()/1000)+3600});expect(intent.status,JSON.stringify(intent.body)).toBe(200);
  const vc=await staff.c.request('/v3/credentials',{serviceUri:live.serviceUri});expect(vc.status,JSON.stringify(vc.body)).toBe(200);contact.digest=vc.body.digest;
  await vi.waitFor(async()=>expect((await f.state()).serviceV3!.credentials[contact.digest]!.state).toBe('registered'),{timeout:20000,interval:250});
  const login=async(page:typeof sender,subject:string)=>{f.setIdentity(subject);await page.goto(f.origin+'/service');await page.getByRole('button',{name:'기관 계정 로그인',exact:true}).click();await page.getByRole('button',{name:'로그아웃 및 연결 회수',exact:true}).waitFor();};
  await login(sender,'agent');await login(receiver,'recipient');
  await sender.locator('li').filter({hasText:contact.intentId}).getByRole('button',{name:'새 통화 시도'}).click();await sender.getByLabel('위임 증서',{exact:true}).selectOption(contact.digest);await sender.getByRole('button',{name:'개별 연락 승인 받기'}).click();
  const attempt=await sender.getByLabel('선택한 통화 시도',{exact:true}).inputValue();expect(attempt).not.toBe('');await receiver.getByRole('button',{name:'업무 새로고침',exact:true}).click();await receiver.getByLabel('선택한 통화 시도',{exact:true}).selectOption(attempt);
  await sender.getByRole('button',{name:'마이크 준비 및 PBX 등록'}).click();await receiver.getByRole('button',{name:'마이크 준비 및 PBX 등록'}).click();
  await sender.getByText('PBX 등록 완료: 양측 연결 준비를 기다립니다',{exact:true}).waitFor();await receiver.getByText('PBX 등록 완료: 양측 연결 준비를 기다립니다',{exact:true}).waitFor();
  await sender.getByRole('button',{name:'양측 웹으로 발신'}).click();await receiver.getByText(/PBX 협상 완료/).waitFor({timeout:20000});
  // Clone/enable the receiver track only in the observer, so UI track muting alone cannot satisfy silence.
  const audio=async(page:typeof sender,expectedHz:number,ownHz:number)=>page.evaluate(async({expectedHz,ownHz})=>{
   const w=window as unknown as {callSignTestPeers:RTCPeerConnection[];callSignAudioProof?:{context:AudioContext;probes:Map<string,{analyser:AnalyserNode;track:MediaStreamTrack}>}};
   const proof=w.callSignAudioProof??={context:new AudioContext(),probes:new Map()};await proof.context.resume();
   for(const peer of w.callSignTestPeers)for(const receiver of peer.getReceivers()){const track=receiver.track;if(track?.kind==='audio'&&!proof.probes.has(track.id)){const clone=track.clone();clone.enabled=true;const analyser=proof.context.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=0;proof.context.createMediaStreamSource(new MediaStream([clone])).connect(analyser);proof.probes.set(track.id,{analyser,track:clone});}}
   let target=0,self=0,rms=0;
   for(let n=0;n<20;n++){for(const {analyser} of proof.probes.values()){const bins=new Float32Array(analyser.frequencyBinCount),wave=new Float32Array(analyser.fftSize);analyser.getFloatFrequencyData(bins);analyser.getFloatTimeDomainData(wave);rms=Math.max(rms,Math.sqrt(wave.reduce((s,v)=>s+v*v,0)/wave.length));const magnitude=(hz:number)=>{const bin=Math.round(hz/proof.context.sampleRate*analyser.fftSize);return Math.max(...Array.from(bins.slice(Math.max(0,bin-2),bin+3)), -120);};target=Math.max(target,10**(magnitude(expectedHz)/20));self=Math.max(self,10**(magnitude(ownHz)/20));}await new Promise(r=>setTimeout(r,50));}
   return {target,self,rms,receiverTracks:proof.probes.size,source:'actual-decoded-remote-track',syntheticMicrophone:true};
  },{expectedHz,ownHz});
  const before={sender:await audio(sender,990,660),recipient:await audio(receiver,660,990)};expect(before.sender.target).toBeLessThan(.003);expect(before.recipient.target).toBeLessThan(.003);
  await receiver.getByRole('button',{name:'통화 수락 및 검증 시작'}).click();await receiver.getByText('양측 세션과 PBX 연결 검증 후 통화 중',{exact:true}).waitFor({timeout:30000});await sender.getByText('양측 세션과 PBX 연결 검증 후 통화 중',{exact:true}).waitFor({timeout:30000});
  const during={sender:await audio(sender,990,660),recipient:await audio(receiver,660,990)};
  for(const result of [during.sender,during.recipient]){expect(result.receiverTracks).toBeGreaterThan(0);expect(result.target).toBeGreaterThan(.003);expect(result.target).toBeGreaterThan(result.self*3);expect(result.rms).toBeGreaterThan(.003);}
  const saved=(await f.state()).serviceV3!.attempts[attempt]!;expect(saved.status).toBe('accepted');expect(saved.profile).toBe('asterisk-webrtc-v3');expect(saved.lease?.payload.authority).toBe('current');expect(saved.pbx?.state).toBe('bridged');
  const selectedRelay=await Promise.all([sender,receiver].map(page=>page.evaluate(async()=>{const observations=[];for(const pc of (window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers){const stats=await pc.getStats();for(const t of stats.values())if(t.type==='transport'&&t.dtlsState==='connected'){const pair=stats.get(t.selectedCandidatePairId);observations.push({local:stats.get(pair?.localCandidateId)?.candidateType,remote:stats.get(pair?.remoteCandidateId)?.candidateType,dtls:t.dtlsState});}}return observations;})));
  for(const side of selectedRelay){expect(side.length).toBeGreaterThan(0);for(const selected of side){expect(selected.local).toBe('relay');expect(selected.remote).toBe('relay');}}
  const stop=performance.now();let blockedRenewals=0;
  if(outcome==='logout')await sender.getByRole('button',{name:'로그아웃 및 연결 회수',exact:true}).click();
  if(outcome==='work-cancel')expect((await staff.c.request('/v3/cancel',{intentId:contact.intentId})).status).toBe(200);
  if(outcome==='lease-expiry')await receiver.route('**/api/v3/lease',route=>{blockedRenewals++;return route.abort('failed');});
  if(outcome==='delegation-revoke')expect((await staff.c.request('/v3/revoke',{digest:contact.digest})).status).toBe(200);
  if(outcome==='emergency-stop')expect((await staff.c.request('/v3/management/suspend',{})).status).toBe(200);
  await vi.waitFor(async()=>expect((await f.state()).serviceV3!.attempts[attempt]!.pbx!.state).toBe('ended'),{timeout:outcome==='lease-expiry'?40000:15000,interval:250});
  if(outcome==='lease-expiry')expect(blockedRenewals).toBeGreaterThan(0);
  await receiver.locator('dt').filter({hasText:/^현재 연결$/}).locator('..').locator('dd').filter({hasText:/^통화 종료:/}).waitFor({timeout:10000});
  let after=await audio(receiver,660,990);await vi.waitFor(async()=>{after=await audio(receiver,660,990);expect(after.target).toBeLessThan(.003);},{timeout:5000,interval:100});
  if(['delegation-revoke','emergency-stop'].includes(outcome))await vi.waitFor(async()=>{const jobs=await staff.c.request('/v3/management/jobs');expect(jobs.status).toBe(200);expect(jobs.body.jobs.some((j:{kind:string})=>j.kind===(outcome==='delegation-revoke'?'credential.revoke':'institution.suspend'))).toBe(false);const state=await staff.c.request('/v3/state?digest='+contact.digest);expect(state.status,JSON.stringify(state.body)).toBe(200);expect(state.body.signatures.length).toBeGreaterThanOrEqual(3);if(outcome==='delegation-revoke')expect((await f.state()).serviceV3!.credentials[contact.digest]!.state).toBe('revoked');else expect((await f.state()).status).toBe('suspended');},{timeout:20000,interval:300});
  expect(errors).toEqual([]);
  await writeFile(join(root,'decoded-audio-'+outcome+'.json'),JSON.stringify({outcome,before,during,after,selectedRelay,blockedRenewals,reclaimObservationMs:performance.now()-stop,clock:'one test-controller monotonic clock; one sample, not SLA',realHumanAudio:false,externalNatVerified:false}),{flag:'wx',mode:0o600});
 }catch(error){await writeFile(join(root,'media-failure-'+outcome+'.json'),JSON.stringify({outcome,failures,errors,responses,sipFrames,peers:await Promise.all(contexts.flatMap(c=>c.pages()).map(p=>p.evaluate(()=>((window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers??[]).map(p=>({ice:p.iceConnectionState,connection:p.connectionState,timeline:(p as unknown as {timeline:unknown[]}).timeline,remoteCandidates:p.remoteDescription?.sdp.split('\r\n').filter(l=>l.startsWith('a=candidate:')),localCandidates:p.localDescription?.sdp.split('\r\n').filter(l=>l.startsWith('a=candidate:'))}))).catch(()=>[]))),state:await f.state()}),{flag:'wx',mode:0o600});for(let i=0;i<contexts.length;i++){const pages=contexts[i]!.pages();for(const page of pages)await page.screenshot({path:join(root,'media-failure-'+outcome+'-'+i+'.png'),fullPage:true}).catch(()=>{});}throw error;}
 finally{await Promise.all(contexts.map(c=>c.close()));await Promise.all(browsers.map(b=>b.close()));}
},180000);
