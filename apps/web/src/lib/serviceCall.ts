import { hashCanonical, hashSdp, extractSingleSdpFingerprint, signPayload, type SigningKeyPair, type PurposePolicy, type ServiceBinding, type RuntimePolicy } from '@callsign/protocol';
import { MonotonicStateGuard, verifyServiceInvitation, verifyServicePackage, type ServiceTrust, type StateBundle } from '@callsign/verifier';
import type { ServiceAttempt, Signed } from '../../../../services/api/src/service-state.js';
import type { StartAuthorization, ServiceCredential, ServiceReceipt } from '@callsign/protocol';
import { api,ApiError } from './api.js';
import { PbxSip } from './pbxSip.js';
import { observePbxTransport } from './rtc.js';
import { streamRemoteAudio } from './liveMedia.js';
export interface CallContext {
  attempt:ServiceAttempt; authorization?:Signed<StartAuthorization>&{serviceProofJws:string};
  credential?:{vc:ServiceCredential;jws:string}; receipt?:Signed<ServiceReceipt>; policy:PurposePolicy;
}
export interface ServiceCallStatus { connection:string; authority:string; analysis:string; active:boolean; error?:string;terminal?:boolean;terminalReason?:string }
// One controller owns one attempt and one ephemeral browser key. Reconnection starts a new attempt.
export class ServiceCall {
  private sip:PbxSip|undefined; private stopped=false;private polling=false; private timer:ReturnType<typeof setTimeout>|undefined;
  private deadline:ReturnType<typeof setTimeout>|undefined;private audioStop:(()=>void)|undefined;
  private readonly abort=new AbortController(); private readonly guard=new MonotonicStateGuard();
  private readonly actions=new Map<string,{id:string;body:string}>();private readonly completed=new Set<string>();
  private readonly measured=new Set<string>();private verificationStarted:number|undefined;private readonly connectionStarted=performance.now();
  private readonly signedPossessions=new Map<string,string>();
  private context:CallContext|undefined; private binding:ServiceBinding|undefined;private nonce=crypto.randomUUID();
  private choicePending=false;private wantAccept=false;private continuation=false;private previouslyVerified:string|undefined;private muted=false;
  private minimumLeaseSequence=1;private generation=0;private analysisWanted=false;
  private readonly visibility=()=>{if(document.hidden){this.sip?.pause();this.stopAnalysis();this.show({connection:'화면 비활성: 음성 일시 정지, 다시 열면 재검증',active:false});}else this.schedule(0);};
  private view:ServiceCallStatus={connection:'연결 준비 중: 마이크 송신 차단',authority:'기관 승인 확인 전',analysis:'동의 전: 분석 중단',active:false};
  constructor(private readonly o:{role:'gateway'|'recipient';attemptId:string;intentId:string;recipientId:string;agentId:string;key:SigningKeyPair;trust:ServiceTrust;runtimePolicy:RuntimePolicy;status:(s:ServiceCallStatus)=>void;remote:(s:MediaStream)=>void;risk:(e:unknown)=>void}){}
  private show(p:Partial<ServiceCallStatus>){if(!this.stopped){this.view={...this.view,...p};this.o.status({...this.view});}}
  private async get<T>(path:string){const value=await api<T>(path,{signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(4000)])});this.alive();return value;}
  private alive(){if(this.stopped)throw new Error('CALL_CLOSED');}
  private async post<T>(path:string,body:unknown,action=path):Promise<T>{
    this.alive();const encoded=JSON.stringify(body),prior=this.actions.get(action);if(prior&&prior.body!==encoded)throw new Error('IDEMPOTENCY_PAYLOAD_CHANGED');
    const request=prior??{id:crypto.randomUUID(),body:encoded};if(!action.startsWith("evidence:"))this.actions.set(action,request);
    for(let retry=0;;retry++){try{const value=await api<T>(path,{method:'POST',headers:{'idempotency-key':request.id},body:encoded,signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(4000)])});this.alive();return value;}catch(e){if(this.stopped||retry>=1||!((e instanceof ApiError&&(e.status>=500||e.status===429))||e instanceof TypeError||(e instanceof DOMException&&e.name==='TimeoutError')))throw e;}}
  }
  async connect(){try{
    await this.post('/v3/claim',{attemptId:this.o.attemptId});await this.read();
    if(this.o.role==='recipient')await this.post('/v3/enroll',{attemptId:this.o.attemptId,publicKey:this.o.key.publicJwk,nonce:this.nonce});
    const [ice,credentials]=await Promise.all([this.getIce(),this.post<ConstructorParameters<typeof PbxSip>[0]>('/v3/pbx/endpoint',{attemptId:this.o.attemptId})]);this.alive();
    this.sip=new PbxSip(credentials,ice,async report=>{
      const context=await this.read(),t=context.attempt;if(!t.recipientKey)throw new Error('RECIPIENT_ENROLLMENT_REQUIRED');
      const now=Math.floor(Date.now()/1000),jws=await this.sign({...this.base(context),type:'PbxBrowserReport',role:this.role,attemptId:t.id,sessionId:t.sessionId,connectionGeneration:t.generation,...report,recipientNonce:t.recipientKey.nonce,issuedAt:now,expiresAt:Math.min(t.firstConnectBy,now+30)});
      await this.post('/v3/pbx/report',{attemptId:t.id,jws});
    },message=>{this.show({connection:message});if(/종료|실패|재검증|초과/.test(message)&&!this.stopped)void this.end('failed','pbx-disconnected');});
    let iceStarted=performance.now();this.sip.media.peer.addEventListener('iceconnectionstatechange',()=>{const state=this.sip?.media.peer.iceConnectionState;if(state==='checking')iceStarted=performance.now();if(state==='connected'||state==='completed')this.measure('ice',performance.now()-iceStarted);if(state==='failed')this.measure('ice',performance.now()-iceStarted,'failure');});
    this.sip.media.peer.addEventListener('track',()=>{if(!this.stopped)this.o.remote(this.sip!.media.remote);});
    await this.sip.start();this.alive();this.measure('pbx',performance.now()-this.connectionStarted);document.addEventListener('visibilitychange',this.visibility);this.show({connection:'PBX 등록 완료: 양측 연결 준비를 기다립니다'});this.schedule(0);
  }catch(e){this.measure('pbx',performance.now()-this.connectionStarted,'failure');await this.fail(e);throw e;}}
  private get role(){return this.o.role==='gateway'?'sender' as const:'recipient' as const;}
  private async getIce(){return (await this.post<{iceServers:RTCIceServer[]}>('/v3/turn',{attemptId:this.o.attemptId})).iceServers;}
  private async read(){const c=await this.get<CallContext>(`/v3/call-context?attemptId=${encodeURIComponent(this.o.attemptId)}`);if(c.attempt.id!==this.o.attemptId||c.attempt.intentId!==this.o.intentId||c.attempt.agentId!==this.o.agentId||(this.context&&c.attempt.sessionId!==this.context.attempt.sessionId)||(c.authorization&&c.authorization.payload.recipientId!==this.o.recipientId))throw new Error('CALL_CONTEXT_IDENTITY_CHANGED');this.context=c;return c;}
  private base(c:CallContext){const a=c.authorization!.payload;return {protocol:'callsign',version:3,networkId:a.networkId,registryAddress:a.registryAddress};}
  private sign(payload:Record<string,unknown>){return signPayload(payload,{privateKey:this.o.key.privateKey,kid:hashCanonical(this.o.key.publicJwk)});}
  async dial(){await this.post('/v3/pbx/dial',{attemptId:this.o.attemptId});this.show({connection:'상대 연결 대기'});}
  accept(){this.alive();if(this.o.role!=='recipient')throw new Error('RECIPIENT_REQUIRED');this.wantAccept=true;this.show({connection:'수락: 양측 세션 검증 중'});}
  chooseContinuation(value:boolean){this.choicePending=true;this.continuation=value;if(!value){this.sip?.pause();this.stopAnalysis();this.show({active:false});}this.show({authority:value?'권한 확인 불가: 사용자가 통화 유지를 선택함':'권한 확인 불가: 음성 일시 정지'});}
  mute(value:boolean){this.muted=value;if(this.view.active)this.sip?.media.mute(value);else this.sip?.pause();}
  private schedule(ms=1000){if(this.stopped)return;clearTimeout(this.timer);this.timer=setTimeout(()=>{if(this.polling){this.schedule();return;}this.polling=true;void this.tick().catch(async e=>{if(this.stopped)return;if(this.verificationStarted!==undefined){this.measure('verification',performance.now()-this.verificationStarted,'failure');this.verificationStarted=undefined;}if(e instanceof ApiError&&['PBX_ALREADY_BRIDGED','LEASE_SEQUENCE_CONFLICT','BINDING_NOT_READY'].includes(e.code)){this.schedule();return;}if((e instanceof ApiError&&(e.status>=500||e.status===429))||(e instanceof TypeError)||(e instanceof DOMException&&e.name==='TimeoutError')||String(e).includes('EXPLICIT_UNVERIFIED_CONTINUATION_REQUIRED')){this.sip?.pause();this.stopAnalysis();this.show({authority:'권한 확인 불가: 음성 정지, 재확인 중',active:false});this.schedule();}else await this.fail(e);}).finally(()=>{this.polling=false;this.schedule(this.o.runtimePolicy.pollingMs);});},ms);}
  private async tick(){
    if(typeof document!=='undefined'&&document.hidden)return;
    const c=await this.read(),t=c.attempt;
    if(['ended','declined','failed','cancelled','no-answer'].includes(t.status)){this.finish(t.reason??t.status);return;}
    const now=Math.floor(Date.now()/1000);if(now>=t.callEndBy||(t.status!=='accepted'&&now>=t.firstConnectBy))throw new Error('CALL_WINDOW_EXPIRED');
    if(!c.authorization||!c.credential||!t.pbx?.reports.sender||!t.pbx.reports.recipient||!this.sip?.callId)return;
    if(!this.completed.has('invitation')){
      const verified=await verifyServiceInvitation({authorizationJws:c.authorization.jws,vcJws:c.credential.jws,serviceProofJws:c.authorization.serviceProofJws,trust:this.o.trust,policy:c.policy,recipientId:this.o.recipientId,sessionId:t.sessionId,attemptId:t.id,now});this.alive();
      if(this.role==='sender'&&hashCanonical(verified.proof.browserPublicKey)!==hashCanonical(this.o.key.publicJwk))throw new Error('SENDER_BROWSER_KEY_CHANGED');
      if(this.role==='recipient'&&(t.recipientKey?.nonce!==this.nonce||hashCanonical(t.recipientKey.publicKey)!==hashCanonical(this.o.key.publicJwk)))throw new Error('RECIPIENT_BROWSER_KEY_CHANGED');
      this.completed.add('invitation');this.show({authority:'기관 승인 서명 확인: 통화 내용의 안전 보장은 아님'});
    }
    this.binding=t.binding??this.binding;
    if(!this.binding)this.binding=await this.post<ServiceBinding>('/v3/binding',{attemptId:t.id});
    const b=this.binding,local=this.sip.media.peer.localDescription?.sdp;if(!local||(this.role==='sender'?b.senderSdpHash:b.recipientSdpHash)!==hashSdp(local)||(this.role==='sender'?b.senderFingerprint:b.recipientFingerprint)!==extractSingleSdpFingerprint(local))throw new Error('LOCAL_BINDING_CHANGED');
    if(!t.possessions?.[this.role]&&t.status==='authorized'){
      const jws=await this.possession(c,b.recipientNonce);await this.post('/v3/possession',{attemptId:t.id,binding:b,jws});return;
    }
    if(this.role==='recipient'&&t.status==='authorized'&&t.possessions?.sender&&t.possessions.recipient){
      await this.evidence('prepared');await this.post('/v3/consume',{attemptId:t.id,binding:b,senderProof:t.possessions.sender,recipientProof:t.possessions.recipient});return;
    }
    if(this.role==='recipient'&&['consumed','accepted'].includes(t.status)&&this.wantAccept&&(this.choicePending||!t.lease||t.lease.payload.expiresAt-now<=Math.max(5,this.o.runtimePolicy.leaseSeconds/2))){
      if(!t.renewal||t.renewal.expiresAt<=now||t.renewal.sequence<=(t.lease?.payload.sequence??0)){await this.post('/v3/lease-challenge',{attemptId:t.id},`challenge:${t.lease?.payload.sequence??0}:${Math.floor(now/15)}`);return;}
    }
    const round=t.renewal;
    if(round&&round.expiresAt>now&&round.sequence>(t.lease?.payload.sequence??0)){
      if(round.priorLeaseHash!==hashCanonical(t.lease?.payload??c.receipt?.payload))throw new Error('RENEWAL_HISTORY_CHANGED');
      if(!round.proofs[this.role]){
        const {proofs:_,...fields}=round,jws=await this.sign({...this.base(c),type:'LeaseRenewalProof',role:this.role,authorizationId:c.authorization.payload.authorizationId,sessionId:t.sessionId,bindingHash:hashCanonical(b),...fields});this.alive();
        await this.post('/v3/lease-proof',{attemptId:t.id,jws},`renew-proof:${round.nonce}`);return;
      }
      if(this.role==='recipient'&&this.wantAccept&&round.proofs.sender&&round.proofs.recipient){await this.post('/v3/lease',{attemptId:t.id,sequence:round.sequence,nonce:round.nonce,proofJws:round.proofs.recipient,senderProof:round.proofs.sender,choice:this.continuation?'continue':'pause'},`lease:${round.nonce}`);this.choicePending=false;return;}
    }
    if(!t.lease||!c.receipt)return;
    if(now>=t.lease.payload.expiresAt)throw new Error('LEASE_EXPIRED_REVALIDATION_REQUIRED');
    const verificationStarted=performance.now();this.verificationStarted=verificationStarted;
    const stage=t.pbx.state==='bridged'?'bridged':'prepared';
    const e=await this.evidence(stage),observed=await observePbxTransport(this.sip.media.peer,this.sip.callId);this.alive();
    let state:StateBundle|undefined;
    if(t.lease.payload.authority==='current')state=await this.get<StateBundle>(`/v3/state?digest=${c.authorization.payload.vcDigest}`);
    const result=await verifyServicePackage({authorizationJws:c.authorization.jws,vcJws:c.credential.jws,serviceProofJws:c.authorization.serviceProofJws,receiptJws:c.receipt.jws,leaseJws:t.lease.jws,leaseNonce:t.lease.payload.nonce,binding:b,trust:this.o.trust,policy:c.policy,...(state?{state}:{}),role:this.role,stage,allowUnverifiedContinuation:this.continuation,...(this.previouslyVerified?{previousVerifiedBindingHash:this.previouslyVerified}:{}),recipientId:this.o.recipientId,sessionId:t.sessionId,recipientPublicKey:t.recipientKey!.publicKey,recipientNonce:t.recipientKey!.nonce,connectionGeneration:t.generation,now:Math.floor(Date.now()/1000),monotonicMs:performance.now(),guard:this.guard,minimumLeaseSequence:this.minimumLeaseSequence,observed,pbxEvidenceJws:e.jws});this.alive();
    this.measure('verification',performance.now()-verificationStarted);this.verificationStarted=undefined;
    this.minimumLeaseSequence=Math.max(this.minimumLeaseSequence,result.lease.sequence);
    if(result.authority==='current')this.previouslyVerified=result.bindingHash;
    clearTimeout(this.deadline);const expires=Math.min(result.authorityDeadline,performance.now()+Math.max(0,t.lease.payload.expiresAt-Date.now()/1000)*1000);
    this.deadline=setTimeout(()=>{this.sip?.pause();this.stopAnalysis();this.show({authority:'권한 확인 유효기간 경과: 음성 일시 정지',active:false});},Math.max(0,expires-performance.now()));
    this.show({authority:result.authority==='current'?'현재 권한·서명·세션 결합 검증 완료':'권한 확인 불가: 명시적 선택으로 연결 유지'});
    if(!t.mediaReady?.[this.role]){const jws=await this.possession(c,`media-ready:${hashCanonical(b)}`);await this.post('/v3/ready',{attemptId:t.id,jws},'media-ready');return;}
    if(stage==='prepared'&&this.role==='recipient'&&t.mediaReady.sender&&t.mediaReady.recipient){await this.evidence('bridged');return;}
    if(stage==='bridged'){
      if(document.hidden)return;await this.sip.accept();this.alive();if(document.hidden||performance.now()>=expires){this.sip.pause();this.stopAnalysis();this.show({authority:'검증 유효기간 경과 또는 화면 비활성: 음성 정지',active:false});return;}this.sip.media.resume(this.muted);this.measure('media-ready',performance.now()-this.connectionStarted);this.show({connection:'양측 세션과 PBX 연결 검증 후 통화 중',active:true});
      if(this.analysisWanted&&!this.audioStop&&this.role==='recipient')await this.beginAnalysis();
    }
  }
  private measure(stage:'verification'|'media-ready'|'pbx'|'ice',durationMs:number,outcome:'success'|'failure'='success'){const key=`${stage}:${outcome}`;if(this.measured.has(key)||this.stopped)return;this.measured.add(key);void api('/v3/measurements',{method:'POST',body:JSON.stringify({stage,outcome,durationMs}),signal:this.abort.signal}).catch(()=>{});}
  private async possession(c:CallContext,nonce:string){const bindingHash=hashCanonical(this.binding),id=`${bindingHash}:${nonce}`,prior=this.signedPossessions.get(id);if(prior)return prior;const now=Math.floor(Date.now()/1000),jws=await this.sign({...this.base(c),type:'ServicePossession',role:this.role,authorizationId:c.authorization!.payload.authorizationId,sessionId:c.attempt.sessionId,bindingHash,nonce,issuedAt:now,expiresAt:now+20});this.signedPossessions.set(id,jws);return jws;}
  private evidence(state:'prepared'|'bridged'){return this.post<{jws:string}>('/v3/pbx/evidence',{attemptId:this.o.attemptId,binding:this.binding,state},`evidence:${state}:${crypto.randomUUID()}`);}
  async analysis(granted:boolean){this.stopAnalysis();this.analysisWanted=granted;await this.post('/v3/consent',{attemptId:this.o.attemptId,granted},`consent:${crypto.randomUUID()}`);this.show({analysis:granted?'원격 음성 분석 연결 대기':'동의 철회: 분석·전송 중단'});if(granted&&this.view.active)await this.beginAnalysis();}
  private async beginAnalysis(){if(!this.sip||this.stopped||!this.analysisWanted||document.hidden)return;const generation=++this.generation;this.audioStop=streamRemoteAudio(this.sip.media.remote,this.o.attemptId,event=>{if(this.stopped||generation!==this.generation||!this.analysisWanted)return;const value=event as {type?:string;engine?:string;llm?:string;event?:{status?:string}};if(value.type==='unavailable')this.show({analysis:'분석 장애: 위험 여부를 판단할 수 없음'});else if(value.event?.status==='unavailable')this.show({analysis:'언어 모델 분석 장애: 규칙 근거만 표시'});else if(value.type==='provider-ready')this.show({analysis:`상대 음성 전사 ${value.engine} · 분석 ${value.llm}`});this.o.risk(event);},3);}
  private stopAnalysis(){this.analysisWanted=false;this.generation++;this.audioStop?.();this.audioStop=undefined;this.o.risk({type:'clear'});this.show({analysis:'분석 중단: 음성 전송 없음'});}
  async end(outcome:'ended'|'declined'|'failed'='ended',reason='user-ended'){
    if(this.stopped)return;if(outcome==='ended'&&this.context?.attempt.status!=='accepted')outcome=this.role==='recipient'?'declined':'failed';this.sip?.pause();this.stopAnalysis();try{await this.post('/v3/outcome',{attemptId:this.o.attemptId,outcome,reason},`outcome:${outcome}`);}finally{this.finish(reason);}
  }
  private async fail(e:unknown){if(this.stopped)return;const message=e instanceof Error?e.message:'CALL_UNAVAILABLE';this.show({error:message,authority:'검증 중단',active:false});try{await this.end('failed','verification-unavailable');}catch{this.finish(message);}}
  private finish(reason:string){if(this.stopped)return;this.stopped=true;if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.visibility);this.abort.abort();clearTimeout(this.timer);clearTimeout(this.deadline);this.stopAnalysis();this.sip?.close();this.o.status({...this.view,connection:`통화 종료: ${reason}`,authority:'통화 종료: 현재 연결 검증 표시 해제',analysis:'분석 중단: 음성 전송 없음',active:false,terminal:true,terminalReason:reason});}
  close(){this.finish('local-session-closed');}
}
