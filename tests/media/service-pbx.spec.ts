import { expect,test,type Page } from '@playwright/test';
test('URI PBX path: no microphone transmission before acceptance, signed connection, logout cleanup',async({browser},testInfo)=>{
 const origin=process.env.CALLSIGN_MEDIA_ORIGIN,senderState=process.env.CALLSIGN_MEDIA_GATEWAY_STORAGE,recipientState=process.env.CALLSIGN_MEDIA_RECIPIENT_STORAGE,intentId=process.env.CALLSIGN_MEDIA_INTENT_ID,digest=process.env.CALLSIGN_MEDIA_CREDENTIAL_DIGEST;
 test.skip(!origin||!senderState||!recipientState||!intentId||!digest,'NOT-RUN: explicitly approved PBX stack, registered URI trust and separately authenticated roles required');
 const contexts=await Promise.all([senderState,recipientState].map(storageState=>browser.newContext({storageState:storageState!,permissions:['microphone']})));
 try{
  for(const context of contexts){await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(origin!).origin?route.continue():route.abort('blockedbyclient'));}
  for(const context of contexts)await context.addInitScript(()=>{const peers:RTCPeerConnection[]=[];(window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers=peers;const Native=window.RTCPeerConnection;window.RTCPeerConnection=class extends Native{constructor(c?:RTCConfiguration){super(c);peers.push(this);}};});
  const sender=await contexts[0]!.newPage(),receiver=await contexts[1]!.newPage();await sender.goto(`${origin}/service`);
  const identity=await sender.request.get('/v3/runtime-identity');expect(identity.ok()).toBe(true);const target=await identity.json();expect(target.deploymentId).toBe(process.env.CALLSIGN_VALIDATION_DEPLOYMENT_ID);expect(target.trustPin).toBe(process.env.CALLSIGN_VALIDATION_TRUST_PIN);expect(String(target.deploymentId).startsWith('test:')).toBe(true);

  await sender.locator('li').filter({hasText:intentId!}).getByRole('button',{name:'새 통화 시도'}).click();await sender.getByLabel('위임 증서',{exact:true}).selectOption(digest!);await sender.getByRole('button',{name:'개별 연락 승인 받기'}).click();
  const attempt=await sender.getByLabel('선택한 통화 시도',{exact:true}).inputValue();await receiver.goto(`${origin}/service`);await receiver.getByLabel('선택한 통화 시도',{exact:true}).selectOption(attempt);
  await sender.getByRole('button',{name:'마이크 준비 및 PBX 등록'}).click();await receiver.getByRole('button',{name:'마이크 준비 및 PBX 등록'}).click();
  await expect(sender.getByText('PBX 등록 완료: 양측 연결 준비를 기다립니다')).toBeVisible();await expect(receiver.getByText('PBX 등록 완료: 양측 연결 준비를 기다립니다')).toBeVisible();
  await sender.getByRole('button',{name:'양측 웹으로 발신'}).click();
  const observed=(page:Page)=>page.evaluate(async()=>{let sent=0,received=0,energy=0,samples=0;for(const pc of (window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers)for(const r of (await pc.getStats()).values())if(r.kind==='audio'){if(r.type==='outbound-rtp')sent+=Number(r.bytesSent??0);if(r.type==='inbound-rtp'){received+=Number(r.bytesReceived??0);energy+=Number(r.totalAudioEnergy??0);samples+=Number(r.totalSamplesReceived??0);}}return {sent,received,energy,samples};});
  const sent=async()=>(await observed(sender)).sent;
  await expect(receiver.getByText(/PBX 협상 완료/)).toBeVisible({timeout:20000});expect(await sent()).toBe(0);expect((await observed(receiver)).sent).toBe(0);await expect.poll(()=>receiver.evaluate(()=>(window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers.every(pc=>pc.getReceivers().every(r=>!r.track||!r.track.enabled)))).toBe(true);await expect.poll(()=>sender.evaluate(()=>(window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers.every(pc=>pc.getReceivers().every(r=>!r.track||!r.track.enabled)))).toBe(true);
  await testInfo.attach('before-accept-media',{body:JSON.stringify({sender:await observed(sender),recipient:await observed(receiver)}),contentType:'application/json'});
  await receiver.getByRole('button',{name:'통화 수락 및 검증 시작'}).click();await expect(receiver.getByText('양측 세션과 PBX 연결 검증 후 통화 중')).toBeVisible({timeout:20000});await expect.poll(sent).toBeGreaterThan(0);await expect.poll(async()=>(await observed(receiver)).sent).toBeGreaterThan(0);await expect.poll(async()=>(await observed(receiver)).received).toBeGreaterThan(0);await expect.poll(async()=>(await observed(sender)).received).toBeGreaterThan(0);await expect.poll(async()=>(await observed(sender)).energy).toBeGreaterThan(0);await expect.poll(async()=>(await observed(receiver)).energy).toBeGreaterThan(0);await expect.poll(async()=>(await observed(sender)).samples).toBeGreaterThan(0);await expect.poll(async()=>(await observed(receiver)).samples).toBeGreaterThan(0);
  await testInfo.attach('two-way-decoded-audio',{body:JSON.stringify({sender:await observed(sender),recipient:await observed(receiver)}),contentType:'application/json'});
  await sender.getByRole('button',{name:'로그아웃 및 연결 회수'}).click();await expect(receiver.getByText(/통화 종료:/)).toBeVisible({timeout:10000});
  await expect.poll(()=>receiver.evaluate(()=>(window as unknown as {callSignTestPeers:RTCPeerConnection[]}).callSignTestPeers.every(pc=>pc.connectionState==='closed'&&pc.getSenders().every(s=>!s.track||s.track.readyState==='ended')))).toBe(true);
  // No analysis consent is granted: this test must never contact a paid provider.
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});
