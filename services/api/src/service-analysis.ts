import {hashCanonical,policyHash,serviceAnalysisSchema,serviceAnalysisEventSchema,type PurposePolicy,type ServiceAnalysis,type ServiceAnalysisEvent} from '@callsign/protocol';
import {analyzeWithRules,correctedSentences,currentRiskEvidence} from './risk.js';
import {requestOpenAI} from './openai-analysis.js';
import {requestAnthropic,transcriptRevisionSchema,type TranscriptRevision} from './transcription.js';

const categoryCode={ '인증번호 요구':'OTP','송금 유도':'TRANSFER','원격제어 설치':'REMOTE_CONTROL','비밀 유지 강요':'SECRECY'} as const;
const unknown=(reason:string)=>({relation:'undetermined' as const,evidenceSpan:'',reason});
export const ANALYSIS_LIMITS={segments:6,characters:4000,retentionMs:60000,requests:20,debounceMs:250} as const;
export function mergePolicySignals(policy:PurposePolicy,text:string,...lists:ServiceAnalysis['signals'][]){
 const found=new Map<string,ServiceAnalysis['signals'][number]>();
 for(const signal of lists.flat())if(policy.forbiddenRequests.includes(categoryCode[signal.category])&&text.includes(signal.evidenceSpan))found.set(signal.category+':'+signal.evidenceSpan.trim(),signal);
 return [...found.values()].slice(0,8);
}
const serviceAnalysisFormat='Return JSON only: {"signals":[{"category":"송금 유도|원격제어 설치|인증번호 요구|비밀 유지 강요","evidenceSpan":"exact quote","explanation":"reason"}],"purpose":{"relation":"suspected|not-detected|undetermined","evidenceSpan":"exact quote, empty if no evidence","reason":"relation to approved purpose; not overall safety"},"recommendedAction":"verify via official channel","limitations":"remote-only bounded context"}. No probability or safety verdict. Return signals:[] when the transcript supports no forbidden request; a category appearing in the policy is not transcript evidence. OTP means asking the recipient to disclose an authentication secret, TRANSFER means directing a funds transfer, REMOTE_CONTROL means asking to install or allow remote control, SECRECY means forbidding independent consultation. Evaluate purpose independently against policy.allowedQuestions: compatible questions, greetings, clarification and closure are not-detected with an exact supporting quote; the reason must agree with the relation; explicit unrelated solicitation is suspected with a quote; genuinely missing or ambiguous context is undetermined. Never turn warnings against a request, quotations or withdrawn/corrected requests into a current demand.';
export async function analyzeServiceWithAnthropic(input:Parameters<typeof requestAnthropic>[0]):Promise<ServiceAnalysis>{return checkedServiceAnalysis(await requestAnthropic(input,serviceAnalysisFormat),input.text);}
export async function analyzeServiceWithOpenAI(input:Parameters<typeof requestAnthropic>[0]):Promise<ServiceAnalysis>{return checkedServiceAnalysis(await requestOpenAI(input,serviceAnalysisFormat),input.text);}
export function analyzeServiceWithProvider(config:{provider:'openai'|'anthropic';apiKey:string;model:string},input:Omit<Parameters<typeof requestAnthropic>[0],'apiKey'|'model'>){return (config.provider==='openai'?analyzeServiceWithOpenAI:analyzeServiceWithAnthropic)({...input,apiKey:config.apiKey,model:config.model});}
function checkedServiceAnalysis(content:string,text:string):ServiceAnalysis{
 const result=serviceAnalysisSchema.parse(JSON.parse(content));
 if(result.signals.some(s=>/https?:\/\/|www\./i.test(s.explanation))||/https?:\/\/|www\./i.test(result.purpose?.reason??'')||result.signals.some(s=>!text.includes(s.evidenceSpan)||!currentRiskEvidence(text,s))||(result.purpose?.evidenceSpan&&(!text.includes(result.purpose.evidenceSpan)||!correctedSentences(text).join(' ').includes(result.purpose.evidenceSpan))))throw new Error('LLM_EVIDENCE_INVALID');
 // LLM advice is never a URL or product command.
 return {...result,recommendedAction:'별도 인증한 공식 업무 화면에서 확인하세요.',limitations:'최근 상대방 발화만 분석한 보조 안내이며 통화 전체의 안전 판정이 아닙니다.'};
}

export function assertAnalysisPolicy(record:import('./finals-model.js').InstitutionRecord,attempt:import('./service-state.js').ServiceAttempt){
 const intent=record.intents[attempt.intentId],auth=record.serviceV3?.authorizations[attempt.authorizationId??''];
 const digest=policyHash(record.policy),lease=attempt.lease?.payload;
 if(!intent||!auth||!lease||!attempt.binding||intent.policyHash!==digest||auth.payload.policyHash!==digest||lease.policyHash!==digest||auth.payload.epoch!==record.epoch||auth.payload.approvalKeyVersion!==record.approvalKeyVersion||lease.epoch!==record.epoch||lease.approvalKeyVersion!==record.approvalKeyVersion||lease.vcDigest!==auth.payload.vcDigest||lease.authorizationId!==auth.payload.authorizationId||lease.sessionId!==attempt.sessionId||lease.connectionGeneration!==attempt.generation||lease.bindingHash!==hashCanonical(attempt.binding))throw new Error('ANALYSIS_POLICY_BINDING_MISMATCH');
 return digest;
}

export function purposeAuthorityCurrent(attempt:import('./service-state.js').ServiceAttempt,now:number){return attempt.authorityStatus==='current'&&(attempt.authorityUntil??0)>now&&attempt.lease?.payload.authority==='current';}

export class ServiceRevisionAnalyzer {
 private readonly policy:PurposePolicy;private readonly segments=new Map<string,TranscriptRevision&{at:number;order:number}>();
 private readonly seen=new Map<string,{revision:number;final:boolean;order:number}>();private streamId='';private active=false;private version=0;private calls=0;
 private controller=new AbortController();private runningController:AbortController|undefined;private timer:ReturnType<typeof setTimeout>|undefined;private expiry:ReturnType<typeof setTimeout>|undefined;
 private running=false;private queued=false;private eventSequence=0;private analysisContext='';
 constructor(policy:PurposePolicy,private readonly emit:(e:ServiceAnalysisEvent)=>void,private readonly llm?: (text:string,policy:PurposePolicy,signal:AbortSignal)=>Promise<ServiceAnalysis>,private readonly now=()=>performance.now()) {this.policy=structuredClone(policy);}
 start(streamId:string){this.stop();this.streamId=streamId;this.active=true;this.calls=0;this.analysisContext='';this.seen.clear();}
 stop(){clearTimeout(this.timer);clearTimeout(this.expiry);this.controller.abort();this.runningController?.abort();this.version++;this.queued=false;if(this.active)this.publish('withdrawn','stopped',[],unknown('동의 철회 또는 통화 종료로 분석을 중단했습니다.'));this.active=false;this.segments.clear();this.seen.clear();}
 get contextRevision(){return this.version;}
 isCurrent(event:ServiceAnalysisEvent){return this.active&&event.streamId===this.streamId&&event.contextRevision===this.version&&event.eventSequence===this.eventSequence;}
 private ordered(){return [...this.segments.values()].sort((a,b)=>/^\d+(?:\.\d+)?$/.test(a.segmentId)&&/^\d+(?:\.\d+)?$/.test(b.segmentId)?Number(a.segmentId)-Number(b.segmentId):a.order-b.order);}
 private context(){return this.ordered().filter(s=>s.final&&s.at+ANALYSIS_LIMITS.retentionMs>this.now()).slice(-ANALYSIS_LIMITS.segments);}
 private text(){return this.context().map(s=>s.text).join(' ').slice(-ANALYSIS_LIMITS.characters);}
 private rules(){const text=this.text();return mergePolicySignals(this.policy,text,analyzeWithRules(text).signals);}
 private publish(status:ServiceAnalysisEvent['status'],engine:string,signals:ServiceAnalysis['signals'],purpose:ServiceAnalysisEvent['purpose']){
  const context=this.context(),last=context.at(-1);
  this.emit(serviceAnalysisEventSchema.parse({streamId:this.streamId,segmentId:last?.segmentId??'',revision:last?.revision??0,contextRevision:this.version,eventSequence:++this.eventSequence,contextId:hashCanonical(context.map(s=>({segmentId:s.segmentId,revision:s.revision,text:s.text}))),dependencies:context.map(s=>({segmentId:s.segmentId,revision:s.revision})),policyHash:policyHash(this.policy),policyVersion:this.policy.version,analyzerVersion:'purpose-context-1',status,engine,signals,purpose}));
 }
 async accept(value:unknown){
  const segment=transcriptRevisionSchema.parse(value);if(!this.active||segment.streamId!==this.streamId)throw new Error('ANALYSIS_CONSENT_REQUIRED');
  const old=this.seen.get(segment.segmentId);if(old&&(segment.revision<=old.revision||(old.final&&!segment.final)))return false;
  if(!old&&this.seen.size>=256)throw new Error('TRANSCRIPT_SESSION_LIMIT');
  const previousContext=this.context();
  const order=old?.order??this.seen.size;this.seen.set(segment.segmentId,{revision:segment.revision,final:segment.final,order});this.segments.set(segment.segmentId,{...segment,at:this.now(),order});
  for(const [id,s]of this.segments)if(s.at+ANALYSIS_LIMITS.retentionMs<=this.now())this.segments.delete(id);
  while(this.segments.size>ANALYSIS_LIMITS.segments)this.segments.delete(this.ordered()[0]!.segmentId);
  while([...this.segments.values()].reduce((n,s)=>n+s.text.length+1,0)>ANALYSIS_LIMITS.characters){const first=this.ordered()[0]!.segmentId;if(this.segments.size===1){this.segments.get(first)!.text=this.segments.get(first)!.text.slice(-3999);break;}this.segments.delete(first);}
  const context=this.context(),appendOnly=context.length>previousContext.length&&previousContext.every((s,i)=>s.segmentId===context[i]!.segmentId&&s.revision===context[i]!.revision&&s.text===context[i]!.text);
  this.changed(segment.final?'analyzing':'partial',appendOnly);return true;
 }
 private changed(status:'analyzing'|'partial',appendOnly=false){
  const context=hashCanonical(this.context().map(s=>({segmentId:s.segmentId,revision:s.revision,text:s.text})));
  // Interim speech outside the finalized context must not cancel or rebill its analysis.
  if(context!==this.analysisContext){
   this.analysisContext=context;this.version++;if(!appendOnly){this.controller.abort();this.runningController?.abort();}this.controller=new AbortController();clearTimeout(this.timer);
   this.queued=!!this.text();this.timer=setTimeout(()=>{void this.flush();},ANALYSIS_LIMITS.debounceMs);this.timer.unref?.();
  }
  clearTimeout(this.expiry);
  this.publish(status,'rules',this.rules(),unknown('최근 상대 발화의 목적 관계를 확인 중입니다. 고객 발화는 수집하지 않습니다.'));
  const first=[...this.segments.values()].reduce((min,s)=>Math.min(min,s.at),Infinity);
  if(Number.isFinite(first)){this.expiry=setTimeout(()=>{if(!this.active)return;for(const [id,s]of this.segments)if(s.at+ANALYSIS_LIMITS.retentionMs<=this.now())this.segments.delete(id);this.changed('analyzing');},Math.max(1,first+ANALYSIS_LIMITS.retentionMs-this.now()));this.expiry.unref?.();}
 }
 async flush(){
  clearTimeout(this.timer);if(!this.active||!this.queued||this.running)return;this.queued=false;
  const version=this.version,controller=this.controller,text=this.text();this.running=true;this.runningController=controller;
  try{
   if(!this.llm||this.calls>=ANALYSIS_LIMITS.requests)throw new Error(this.llm?'request-limit':'not-configured');this.calls++;
   const result=serviceAnalysisSchema.parse(await this.llm(text,structuredClone(this.policy),controller.signal));
   if(result.signals.some(s=>/https?:\/\/|www\./i.test(s.explanation))||/https?:\/\/|www\./i.test(result.purpose?.reason??'')||result.signals.some(s=>!text.includes(s.evidenceSpan)||!currentRiskEvidence(text,s))||(result.purpose?.evidenceSpan&&(!text.includes(result.purpose.evidenceSpan)||!correctedSentences(text).join(' ').includes(result.purpose.evidenceSpan))))throw new Error('EVIDENCE_CONTEXT_MISMATCH');
   const purpose=result.purpose?.relation==='not-detected'&&!result.purpose.evidenceSpan?undefined:result.purpose;
   if(this.active&&version===this.version&&!controller.signal.aborted)this.publish(purpose?'analyzed':'unavailable','rules+llm',mergePolicySignals(this.policy,text,this.rules(),result.signals),purpose??unknown('목적 판단을 뒷받침하는 발화 근거가 없습니다. 공식 업무에서 확인하세요.'));
  }catch(error){if(this.active&&version===this.version&&!controller.signal.aborted)this.publish('unavailable',error instanceof Error&&['request-limit','not-configured'].includes(error.message)?error.message:'rules-fallback',this.rules(),unknown('목적 분석을 수행할 수 없습니다. 확인 가능한 규칙 근거만 표시합니다.'));}
  finally{this.running=false;this.runningController=undefined;if(this.active&&this.queued){this.timer=setTimeout(()=>{void this.flush();},ANALYSIS_LIMITS.debounceMs);this.timer.unref?.();}}
 }
}
