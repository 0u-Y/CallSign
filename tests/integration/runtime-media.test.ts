// Starts only the local OIDC fixture. Owned final-image services are started by the operator outside this process.
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration'||process.env.CALLSIGN_RUNTIME_IMAGE_CONFIRMATION!=='OWNED_FINAL_IMAGE'||!process.env.CALLSIGN_CHAIN_TEST_ROOT)throw new Error('OWNED_RUNTIME_MEDIA_REQUIRED');
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHttpFixture,type HttpFixture} from './service-http-fixture.js';
const root=process.env.CALLSIGN_CHAIN_TEST_ROOT!;
let f:HttpFixture;
beforeAll(async()=>{
 f=await createHttpFixture({web:false,liveDirectory:root,...(process.env.CALLSIGN_PREPARED_TRUST?{preparedTrust:process.env.CALLSIGN_PREPARED_TRUST}:{}),...(process.env.CALLSIGN_RUNTIME_RESUME_OIDC?{resumeOidc:process.env.CALLSIGN_RUNTIME_RESUME_OIDC}:{}),webOrigin:'https://127.0.0.1:8443',startExternal:async prepared=>{
  await writeFile(join(root,'image-services-request.json'),JSON.stringify(prepared),{flag:'wx',mode:0o600});
  await vi.waitFor(async()=>{const r=JSON.parse(await readFile(join(root,'image-services-started.json'),'utf8'));expect(r.appImage).toBe(process.env.CALLSIGN_EXPECTED_RUNTIME_IMAGE);expect(r.noApplicationSourceMounts).toBe(true);},{timeout:120000,interval:250});
  return 'http://127.0.0.1:4100';
 }});await f.start();
},150000);
afterAll(async()=>{await f?.close();});
it('boots final image roles with real SQL, CA, RPC and processes an actual delegation',async()=>{
 const staff=await f.login('staff');expect(staff.done.status,JSON.stringify(staff.done.body)).toBe(200);
 const c=JSON.parse(await readFile(join(root,'live-http-context.json'),'utf8'));
 if(process.env.CALLSIGN_RUNTIME_RESUME_OIDC&&Object.values((await f.state()).serviceV3!.credentials).some(c=>c.state==='registered')){const record=await f.state();const credential=Object.values(record.serviceV3!.credentials).find(c=>c.state==='registered');expect(credential,'Existing real worker delegation must be confirmed').toBeDefined();const digest=Object.entries(record.serviceV3!.credentials).find(([,c])=>c===credential)![0];try{const saved=JSON.parse(await readFile(join(root,'media-contact.json'),'utf8'));expect(saved.institutionId).toBe(f.id);expect(record.serviceV3!.credentials[saved.digest]?.state).toBe('registered');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await writeFile(join(root,'media-contact.json'),JSON.stringify({intentId:'media-contact',digest,institutionId:f.id,apiOrigin:f.apiOrigin,webOrigin:f.origin}),{flag:'wx',mode:0o600});}return;}
 if(process.env.CALLSIGN_DELIVERY_NEW&&(await f.state()).registrationState!=='confirmed'){
  const {keccak256,stringToHex}=await import('viem');const {privateKeyToAccount}=await import('viem/accounts');const {registrationTypedData}=await import('../../services/api/src/governance-v2.js');const {initialDirectory}=await import('../../services/api/src/configuration.js');const {hashCanonical}=await import('../../packages/protocol/src/index.js');
  const d=JSON.parse(await readFile(join(root,'data/deployment.json'),'utf8'));const request={institutionId:keccak256(stringToHex(f.id)),administrator:c.publicAddresses.administrator,approvalPublicKey:`0x${Buffer.from(f.issuerKey.publicJwk.x!,'base64url').toString('hex')}`,emergencyStopper:c.publicAddresses.stopper,directoryHash:`0x${hashCanonical(initialDirectory)}`,directoryVersion:'1',policyVersion:'1',nonce:keccak256(stringToHex(crypto.randomUUID())),deadline:String(Math.floor(Date.now()/1000)+300)};
  const signatures=await Promise.all([1,2].map(async n=>privateKeyToAccount((await readFile(join(root,'private-keys/approver'+n+'.txt'),'utf8')).trim() as `0x${string}`).signTypedData(registrationTypedData(Number(c.networkId),d.registryAddress,request))));
  const registered=await staff.c.request('/v3/management/register',{request,signatures});expect(registered.status,JSON.stringify(registered.body)).toBe(200);expect(registered.body.ledger).toBe('pending');await vi.waitFor(async()=>expect((await f.state()).registrationState).toBe('confirmed'),{timeout:20000,interval:250});
 }
 const authority=await f.state(),workId='media-contact-'+authority.epoch+'-'+authority.approvalKeyVersion;
 const intent=await staff.c.request('/v3/intents',{id:workId,recipientId:f.uid('recipient'),agentId:f.uid('agent'),serviceUri:c.serviceUri,expiresAt:Math.floor(Date.now()/1000)+3600});expect(intent.status,JSON.stringify(intent.body)).toBe(200);
 const vc=await staff.c.request('/v3/credentials',{serviceUri:c.serviceUri});expect(vc.status,JSON.stringify(vc.body)).toBe(200);expect(vc.body.state).toBe('pending');
 await vi.waitFor(async()=>{expect((await f.state()).serviceV3!.credentials[vc.body.digest]!.state).toBe('registered');},{timeout:20000,interval:250});
 const snapshot=await staff.c.request('/v3/state?digest='+vc.body.digest);expect(snapshot.status,JSON.stringify(snapshot.body)).toBe(200);expect(snapshot.body.signatures.length).toBeGreaterThanOrEqual(3);
 await writeFile(join(root,'media-contact.json'),JSON.stringify({intentId:workId,digest:vc.body.digest,institutionId:f.id,apiOrigin:f.apiOrigin,webOrigin:f.origin}),{flag:'wx',mode:0o600});
});

it.each(['logout','work-cancel','lease-expiry','delegation-revoke','emergency-stop','session-expiry','pbx-outage','policy-change','key-change'] as const)('proves decoded relay-only two-way audio and reclamation after %s',async outcome=>{
 const {chromium}=await import('@playwright/test');
 const browsers=await Promise.all(['sender','recipient'].map(role=>chromium.launch({executablePath:'/opt/browser-cache/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--allow-loopback-in-peer-connection','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture=/run/callsign/'+role+'.wav','--autoplay-policy=no-user-gesture-required'],env:{...process.env,LD_LIBRARY_PATH:'/host-libs',HOME:process.env.CALLSIGN_BROWSER_HOME??'/tmp/callsign-media-home'}})));
 const contexts=await Promise.all(browsers.map(b=>b.newContext({permissions:['microphone']})));
 const responses:{path:string;status:number}[]=[];const sipFrames:unknown[]=[];const errors:string[]=[];const failures:{path:string;status:number;code?:string}[]=[];
 try{
  for(const context of contexts)await context.addInitScript(()=>{const peers:RTCPeerConnection[]=[];(window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers=peers;const Native=window.RTCPeerConnection;window.RTCPeerConnection=class extends Native{constructor(c?:RTCConfiguration){super({...c,iceTransportPolicy:'relay'});peers.push(this);const timeline:unknown[]=[];(this as unknown as {timeline:unknown[]}).timeline=timeline;for(const event of ['iceconnectionstatechange','connectionstatechange','signalingstatechange'])this.addEventListener(event,()=>timeline.push({at:performance.now(),event,ice:this.iceConnectionState,connection:this.connectionState,signaling:this.signalingState}));}};});
  const sender=await contexts[0]!.newPage(),receiver=await contexts[1]!.newPage();
  for(const page of [sender,receiver]){page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.stack??e.message));page.on('websocket',ws=>{if(!ws.url().includes('/pbx/ws'))return;const capture=(event:string,frame:{payload:string|Buffer})=>sipFrames.push({event,headers:(String(frame.payload).split('\r\n\r\n')[0]??'').split('\r\n').filter(line=>!/^Authorization:/i.test(line))});ws.on('framereceived',frame=>capture('received',frame));ws.on('framesent',frame=>capture('sent',frame));});page.on('response',async response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/api/'))responses.push({path,status:response.status()});if(path.startsWith('/api/')&&response.status()>=400){const body=await response.json().catch(()=>({}));failures.push({path,status:response.status(),code:body.error?.code});}});}
  const login=async(page:typeof sender,subject:string)=>{f.setIdentity(subject);await page.goto(f.origin+'/service');await page.getByRole('button',{name:'기관 계정 로그인',exact:true}).click();await page.getByRole('button',{name:'로그아웃 및 연결 회수',exact:true}).waitFor();};
  let naturalExpiry:number|undefined;
  if(outcome==='session-expiry'){
   await login(sender,'agent');await login(receiver,'recipient');
   const rows=await f.sql`SELECT max(expires_at) AS expiry FROM public.sessions WHERE purpose='work' AND user_id IN ${f.sql([f.uid('agent'),f.uid('recipient')])} GROUP BY user_id`;
   expect(rows).toHaveLength(2);naturalExpiry=Math.min(...rows.map(r=>new Date(r.expiry).getTime()));expect(naturalExpiry-Date.now()).toBeGreaterThan(3500000);
   await writeFile(join(root,'natural-session-wait.json'),JSON.stringify({startedAt:new Date().toISOString(),expiresAt:new Date(naturalExpiry).toISOString(),method:'unmodified real PostgreSQL session expiry; no clock injection or SQL expiry changes'}),{flag:'wx',mode:0o600});
   while(naturalExpiry-Date.now()>60000)await new Promise(r=>setTimeout(r,Math.min(10000,naturalExpiry!-Date.now()-60000)));
  }
  const contact=JSON.parse(await readFile(join(root,'media-contact.json'),'utf8'));
  const staff=await f.login('staff'),live=JSON.parse(await readFile(join(root,'live-http-context.json'),'utf8'));contact.intentId='media-'+outcome+'-'+crypto.randomUUID();
  if(process.env.CALLSIGN_DELIVERY_NEW){
   const management=await browsers[0]!.newContext();const page=await management.newPage();await login(page,'staff');
   await page.getByLabel('수신자 계정',{exact:true}).fill(f.uid('recipient'));await page.getByLabel('할당 상담원',{exact:true}).fill(f.uid('agent'));await page.getByLabel('등록된 콜센터 URI',{exact:true}).selectOption(live.serviceUri);
   const created=page.waitForResponse(r=>r.url().endsWith('/api/v3/intents')&&r.request().method()==='POST');await page.getByRole('button',{name:'연락 업무 생성',exact:true}).click();const response=await created;expect(response.status()).toBe(200);contact.intentId=(await response.json()).id;
   const issued=page.waitForResponse(r=>r.url().endsWith('/api/v3/credentials')&&r.request().method()==='POST');await page.getByRole('button',{name:'업무 위임 증서 발급',exact:true}).click();const vc=await issued;expect(vc.status()).toBe(200);contact.digest=(await vc.json()).digest;
   await page.screenshot({path:join(root,'delivery-work-'+outcome+'.png'),fullPage:true});await management.close();
  }else{
   const intent=await staff.c.request('/v3/intents',{id:contact.intentId,recipientId:f.uid('recipient'),agentId:f.uid('agent'),serviceUri:live.serviceUri,expiresAt:Math.floor(Date.now()/1000)+3600});expect(intent.status,JSON.stringify(intent.body)).toBe(200);
   const vc=await staff.c.request('/v3/credentials',{serviceUri:live.serviceUri});expect(vc.status,JSON.stringify(vc.body)).toBe(200);contact.digest=vc.body.digest;
  }
  await vi.waitFor(async()=>expect((await f.state()).serviceV3!.credentials[contact.digest]!.state).toBe('registered'),{timeout:20000,interval:250});
  if(outcome!=='session-expiry'){await login(sender,'agent');await login(receiver,'recipient');}else{await sender.getByRole('button',{name:'업무 새로고침',exact:true}).click();await receiver.getByRole('button',{name:'업무 새로고침',exact:true}).click();}
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
  if(outcome==='session-expiry'){
   expect(naturalExpiry).toBeDefined();await vi.waitFor(()=>expect(Date.now()).toBeGreaterThanOrEqual(naturalExpiry!),{timeout:65000,interval:250});
   for(const page of [sender,receiver])expect(await page.evaluate(async()=>{const r=await fetch('/api/v3/auth/me');return r.status;})).toBe(401);
  }
  if(outcome==='pbx-outage'){
   await writeFile(join(root,'pbx-control-pause.request'),'owned-pbx-only',{flag:'wx',mode:0o600});await vi.waitFor(async()=>expect(JSON.parse(await readFile(join(root,'pbx-control-pause.done'),'utf8')).paused).toBe(true),{timeout:10000,interval:100});
   expect((await staff.c.request('/v3/cancel',{intentId:contact.intentId})).status).toBe(200);
   await vi.waitFor(async()=>expect(['ended','failed','cancelled']).toContain((await f.state()).serviceV3!.attempts[attempt]!.status),{timeout:10000,interval:100});
   const end=await staff.c.request('/v3/pbx/cleanup',{attemptId:attempt});expect(end.status,JSON.stringify(end.body)).toBe(503);expect(end.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
   expect((await f.state()).serviceV3!.attempts[attempt]!.pbx!.state).not.toBe('ended');await writeFile(join(root,'pbx-control-unpause.request'),'owned-pbx-only',{flag:'wx',mode:0o600});await vi.waitFor(async()=>expect(JSON.parse(await readFile(join(root,'pbx-control-unpause.done'),'utf8')).unpaused).toBe(true),{timeout:10000,interval:100});
  }
  if(outcome==='policy-change'){
   const {configurationTypedData}=await import('../../packages/protocol/src/index.js');const {privateKeyToAccount}=await import('viem/accounts');const record=await f.state(),d=JSON.parse(await readFile(join(root,'data/deployment.json'),'utf8'));
   const p=await staff.c.request('/v3/management/configuration',{directory:record.directory!.entries,policy:{...record.policy,version:record.policy.version+1}});expect(p.status,JSON.stringify(p.body)).toBe(200);
   for(const [n,subject] of [[1,'approver-one'],[2,'approver-two']] as const){const signer=privateKeyToAccount((await readFile(join(root,'private-keys/approver'+n+'.txt'),'utf8')).trim() as `0x${string}`);const user=await f.login(subject);const signed=await user.c.request('/v3/management/configuration/approve',{operation:p.body.operation,signature:await signer.signTypedData(configurationTypedData(Number(live.networkId),d.registryAddress,p.body.request))});expect(signed.status,JSON.stringify(signed.body)).toBe(200);}
   const submitted=await staff.c.request('/v3/management/configuration/submit',{operation:p.body.operation});expect(submitted.status,JSON.stringify(submitted.body)).toBe(200);expect(submitted.body.activePolicyUnchanged).toBe(true);
   await vi.waitFor(async()=>{const next=await f.state();expect(next.configurationProposals![p.body.operation]!.status).toBe('confirmed');expect(next.observedEpoch).toBe(String(BigInt(record.epoch)+1n));},{timeout:20000,interval:250});
   expect((await f.state()).policy.version).toBe(record.policy.version);const activated=await staff.c.request('/v3/management/configuration/activate',{operation:p.body.operation});expect(activated.status,JSON.stringify(activated.body)).toBe(200);expect(activated.body.newDelegationAndTrustPublicationRequired).toBe(true);expect((await f.state()).policy.version).toBe(record.policy.version+1);
  }
  if(outcome==='key-change'){
   const {recoveryTypedData}=await import('../../services/api/src/governance-v2.js');const {privateKeyToAccount}=await import('viem/accounts');const {keccak256,stringToHex}=await import('viem');const old=await f.state(),next=JSON.parse(await readFile(join(root,'data/issuer/approval-v2.json'),'utf8')),d=JSON.parse(await readFile(join(root,'data/deployment.json'),'utf8'));
   expect((await staff.c.request('/v3/management/suspend',{})).status).toBe(200);await vi.waitFor(async()=>{const r=await f.state();expect(r.observedEpoch).toBe(String(BigInt(old.epoch)+1n));expect(r.status).toBe('suspended');},{timeout:20000,interval:250});
   const request={institutionId:keccak256(stringToHex(f.id)),expectedEpoch:String(BigInt(old.epoch)+1n),newAdministrator:live.publicAddresses.administrator,newApprovalPublicKey:`0x${Buffer.from(next.publicJwk.x,'base64url').toString('hex')}`,newEmergencyStopper:live.publicAddresses.stopper,nonce:keccak256(stringToHex(crypto.randomUUID())),deadline:String(Math.floor(Date.now()/1000)+300)};
   const signatures=await Promise.all([1,2].map(async n=>privateKeyToAccount((await readFile(join(root,'private-keys/approver'+n+'.txt'),'utf8')).trim() as `0x${string}`).signTypedData(recoveryTypedData(Number(live.networkId),d.registryAddress,request))));
   const recovered=await staff.c.request('/v3/management/recover',{request,signatures});expect(recovered.status,JSON.stringify(recovered.body)).toBe(200);expect(recovered.body.ledger).toBe('pending');await vi.waitFor(async()=>expect((await f.state()).observedEpoch).toBe(String(BigInt(old.epoch)+2n)),{timeout:20000,interval:250});
   const activated=await staff.c.request('/v3/management/activate-key',{kid:next.kid,publicKey:next.publicJwk,epoch:String(BigInt(old.epoch)+2n),version:2});expect(activated.status,JSON.stringify(activated.body)).toBe(200);const current=await f.state();expect(current.approvalKid).toBe(next.kid);expect(current.approvalKeyVersion).toBe(2);expect(current.serviceV3!.credentials[contact.digest]!.state).toBe('revoked');expect(current.serviceV3!.authorizations[saved.authorizationId!]!.cancelled).toBe(true);expect(current.serviceV3!.consumptions[saved.authorizationId!]).toBeDefined();
   const stale=await staff.c.request('/v3/intents',{id:'old-trust-'+crypto.randomUUID(),recipientId:f.uid('recipient'),agentId:f.uid('agent'),serviceUri:live.serviceUri,expiresAt:Math.floor(Date.now()/1000)+600});expect(stale.status).toBe(503);expect(stale.body.error.code).toBe('TRUST_PUBLICATION_REQUIRED');
  }
  if(outcome==='emergency-stop')expect((await staff.c.request('/v3/management/suspend',{})).status).toBe(200);
  await vi.waitFor(async()=>expect((await f.state()).serviceV3!.attempts[attempt]!.pbx!.state).toBe('ended'),{timeout:outcome==='lease-expiry'?40000:15000,interval:250});
  if(outcome==='lease-expiry')expect(blockedRenewals).toBeGreaterThan(0);
  if(outcome!=='session-expiry')await receiver.locator('dt').filter({hasText:/^현재 연결$/}).locator('..').locator('dd').filter({hasText:/^통화 종료:/}).waitFor({timeout:10000});
  let after={sender:await audio(sender,990,660),recipient:await audio(receiver,660,990)};await vi.waitFor(async()=>{after={sender:await audio(sender,990,660),recipient:await audio(receiver,660,990)};expect(after.sender.target).toBeLessThan(.003);expect(after.recipient.target).toBeLessThan(.003);},{timeout:5000,interval:100});
  const keys=JSON.parse(await readFile(join(root,'private-app.json'),'utf8'));const authorization='Basic '+Buffer.from('callsign:'+keys.ariPassword).toString('base64');for(const path of ['channels/'+saved.pbx!.senderChannelId,'channels/'+saved.pbx!.recipientChannelId,'bridges/'+saved.pbx!.bridgeId]){const observed=await fetch('https://127.0.0.1:8089/ari/'+encodeURI(path),{headers:{authorization},signal:AbortSignal.timeout(4000)});expect(observed.status,'Actual ARI resource must be absent after reclamation').toBe(404);}
  if(['delegation-revoke','emergency-stop'].includes(outcome))await vi.waitFor(async()=>{const jobs=await staff.c.request('/v3/management/jobs');expect(jobs.status).toBe(200);expect(jobs.body.jobs.some((j:{kind:string})=>j.kind===(outcome==='delegation-revoke'?'credential.revoke':'institution.suspend'))).toBe(false);const state=await staff.c.request('/v3/state?digest='+contact.digest);expect(state.status,JSON.stringify(state.body)).toBe(200);expect(state.body.signatures.length).toBeGreaterThanOrEqual(3);if(outcome==='delegation-revoke')expect((await f.state()).serviceV3!.credentials[contact.digest]!.state).toBe('revoked');else expect((await f.state()).status).toBe('suspended');},{timeout:20000,interval:300});
  expect(errors).toEqual([]);
  await writeFile(join(root,'decoded-audio-'+outcome+'.json'),JSON.stringify({outcome,before,during,after,selectedRelay,blockedRenewals,reclaimObservationMs:performance.now()-stop,clock:'one test-controller monotonic clock; one sample, not SLA',realHumanAudio:false,naturalExpiry,externalNatVerified:false}),{flag:'wx',mode:0o600});
 }catch(error){await writeFile(join(root,'media-failure-'+outcome+'.json'),JSON.stringify({outcome,failures,errors,responses,sipFrames,peers:await Promise.all(contexts.flatMap(c=>c.pages()).map(p=>p.evaluate(()=>((window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers??[]).map(p=>({ice:p.iceConnectionState,connection:p.connectionState,timeline:(p as unknown as {timeline:unknown[]}).timeline,remoteCandidates:p.remoteDescription?.sdp.split('\r\n').filter(l=>l.startsWith('a=candidate:')),localCandidates:p.localDescription?.sdp.split('\r\n').filter(l=>l.startsWith('a=candidate:'))}))).catch(()=>[]))),state:await f.state()}),{flag:'wx',mode:0o600});for(let i=0;i<contexts.length;i++){const pages=contexts[i]!.pages();for(const page of pages)await page.screenshot({path:join(root,'media-failure-'+outcome+'-'+i+'.png'),fullPage:true}).catch(()=>{});}throw error;}
 finally{await Promise.all(contexts.map(c=>c.close()));await Promise.all(browsers.map(b=>b.close()));}
},3800000);

it.each(['device-denied','device-absent'] as const)('handles microphone failure in the product after %s',async mode=>{
 const staff=await f.login('staff'),live=JSON.parse(await readFile(join(root,'live-http-context.json'),'utf8')),intentId='device-'+crypto.randomUUID();
 expect((await staff.c.request('/v3/intents',{id:intentId,recipientId:f.uid('recipient'),agentId:f.uid('agent'),serviceUri:live.serviceUri,expiresAt:Math.floor(Date.now()/1000)+3600})).status).toBe(200);
 const vc=await staff.c.request('/v3/credentials',{serviceUri:live.serviceUri});expect(vc.status).toBe(200);await vi.waitFor(async()=>expect((await f.state()).serviceV3!.credentials[vc.body.digest]!.state).toBe('registered'),{timeout:20000,interval:250});
 const {chromium}=await import('@playwright/test');const browser=await chromium.launch({executablePath:'/opt/browser-cache/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage',...(mode==='device-denied'?['--use-fake-device-for-media-stream']:[])],env:{...process.env,HOME:process.env.CALLSIGN_BROWSER_HOME??'/tmp/callsign-media-home',LD_LIBRARY_PATH:'/host-libs'}});
 try{const context=await browser.newContext({permissions:mode==='device-absent'?['microphone']:[]}),page=await context.newPage();
  f.setIdentity('agent');await page.goto(f.origin+'/service');await page.getByRole('button',{name:'기관 계정 로그인',exact:true}).click();await page.getByRole('button',{name:'로그아웃 및 연결 회수',exact:true}).waitFor();
  if(mode==='device-denied'){const session=await context.newCDPSession(page),{targetInfo}=await session.send('Target.getTargetInfo'),cdp=await browser.newBrowserCDPSession();await cdp.send('Browser.setPermission',{permission:{name:'microphone'},setting:'denied',origin:f.origin,browserContextId:targetInfo.browserContextId!});expect(await page.evaluate(async()=>(await navigator.permissions.query({name:'microphone' as PermissionName})).state)).toBe('denied');}
  else expect(await page.evaluate(async()=>(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput').length)).toBe(0);
  await page.locator('li').filter({hasText:intentId}).getByRole('button',{name:'새 통화 시도'}).click();await page.getByLabel('위임 증서',{exact:true}).selectOption(vc.body.digest);await page.getByRole('button',{name:'개별 연락 승인 받기'}).click();const attempt=await page.getByLabel('선택한 통화 시도',{exact:true}).inputValue();
  await page.getByRole('button',{name:'마이크 준비 및 PBX 등록'}).click();await page.getByRole('alert').filter({hasText:mode==='device-denied'?/denied|허용|권한/i:/not found|없|장치/i}).first().waitFor();
  await vi.waitFor(async()=>{const t=(await f.state()).serviceV3!.attempts[attempt]!;expect(['failed','cancelled']).toContain(t.status);expect(t.pbx?.state).toBe('ended');expect(t.lease).toBeUndefined();},{timeout:15000,interval:250});
  await page.screenshot({path:join(root,'delivery-'+mode+'.png'),fullPage:true});await writeFile(join(root,'device-result-'+mode+'.json'),JSON.stringify({mode,actualBrowserMediaFailure:true,applicationTerminal:true,pbxCleaned:true,realHumanAudio:false}),{flag:'wx',mode:0o600});
 }finally{await browser.close();}
},90000);
