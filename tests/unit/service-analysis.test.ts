import {afterEach,expect,it,vi} from 'vitest';
import {bankPolicy,policyHash,type ServiceAnalysisEvent} from '../../packages/protocol/src/index.js';
import {ServiceRevisionAnalyzer,assertAnalysisPolicy,analyzeServiceWithAnthropic} from '../../services/api/src/service-analysis.js';
import {serviceFixture} from './service-fixture.js';
const analyzers:ServiceRevisionAnalyzer[]=[];
afterEach(()=>{for(const a of analyzers)a.stop();analyzers.length=0;vi.useRealTimers();});
const rev=(text:string,n=1,id='segment-a')=>({streamId:'remote-stream',segmentId:id,revision:n,final:true,text,source:'remote'});
const response=(relation:'suspected'|'not-detected'|'undetermined'='not-detected',evidenceSpan='')=>({signals:[],recommendedAction:'ignored provider advice',limitations:'fixture only',purpose:{relation,evidenceSpan,reason:'synthetic expected relation'}});
function fixture(llm?:ConstructorParameters<typeof ServiceRevisionAnalyzer>[2],now?:()=>number){const events:ServiceAnalysisEvent[]=[];const a=new ServiceRevisionAnalyzer(bankPolicy,e=>events.push(e),llm,now);analyzers.push(a);a.start('remote-stream');return {a,events};}
it('merges forbidden requests with purpose deviation and never lets not-detected remove rules',async()=>{
 const {a,events}=fixture(async()=>response('suspected','대출 상품을 권유합니다.'));
 await a.accept(rev('OTP를 알려주세요. 대출 상품을 권유합니다.'));await a.flush();
 expect(events.at(-1)).toMatchObject({status:'analyzed',policyHash:policyHash(bankPolicy),policyVersion:1,purpose:{relation:'suspected'},signals:[{category:'인증번호 요구'}]});
 const next=fixture(async()=>response());await next.a.accept(rev('OTP를 알려주세요.'));await next.a.flush();expect(next.events.at(-1)?.signals).toHaveLength(1);
});
it('invalidates the entire context on corrections and discards a delayed dependent result',async()=>{
 let complete!:(x:ReturnType<typeof response>)=>void;const {a,events}=fixture(async()=>new Promise(r=>{complete=r;}));
 await a.accept(rev('OTP를 알려주세요.'));const pending=a.flush();const first=events.at(-1)!;
 await a.accept(rev('OTP를 알려주지 마세요.',2));expect(a.isCurrent(first)).toBe(false);expect(events.at(-1)?.signals).toEqual([]);
 complete(response('suspected','OTP를 알려주세요.'));await pending;expect(events.at(-1)?.purpose.relation).toBe('undetermined');expect(events.at(-1)?.signals).toEqual([]);
 expect(await a.accept(rev('OTP를 알려주세요.',1))).toBe(false);
});
it('handles split requests, correction across segments and bounded remote-only context',async()=>{
 const seen:string[]=[];const {a,events}=fixture(async text=>{seen.push(text);return response();});
 await a.accept(rev('인증번호를',1,'s1'));await a.accept(rev('알려주세요.',1,'s2'));await a.flush();expect(events.at(-1)?.signals).toHaveLength(1);
 await a.accept(rev('정정합니다. 인증번호를 알려주지 마세요.',2,'s2'));await a.flush();expect(events.at(-1)?.signals).toEqual([]);
 for(let n=0;n<12;n++)await a.accept(rev('안내'.repeat(400),1,'next'+n));await a.flush();expect(seen.at(-1)!.length).toBeLessThanOrEqual(4000);expect(events.at(-1)?.dependencies.length).toBeLessThanOrEqual(6);
 await expect(a.accept({...rev('local'),source:'local'})).rejects.toThrow();
});
it('coalesces revisions, caps requests, expires context and keeps rule findings on provider failure',async()=>{
 vi.useFakeTimers();const provider=vi.fn(async()=>{throw new Error('provider failed');});const {a,events}=fixture(provider,()=>Date.now());
 await a.accept(rev('OTP를 알려주세요.'));await a.accept(rev('OTP를 알려주세요.',2));expect(provider).not.toHaveBeenCalled();await a.flush();expect(provider).toHaveBeenCalledOnce();expect(events.at(-1)).toMatchObject({status:'unavailable',purpose:{relation:'undetermined'},signals:[{category:'인증번호 요구'}]});
 for(let n=3;n<=24;n++){await a.accept(rev('OTP를 알려주세요.',n));await a.flush();}expect(provider).toHaveBeenCalledTimes(20);expect(events.at(-1)?.engine).toBe('request-limit');
 await vi.advanceTimersByTimeAsync(60001);expect(events.at(-1)?.signals).toEqual([]);expect(events.at(-1)?.dependencies).toEqual([]);
});
it('aborts and clears on withdrawal without applying late provider output',async()=>{
 let complete!:(x:ReturnType<typeof response>)=>void,signal!:AbortSignal;const {a,events}=fixture(async(_t,_p,s)=>{signal=s;return new Promise(r=>{complete=r;});});await a.accept(rev('대출 상품을 권유합니다.'));const pending=a.flush();a.stop();expect(signal.aborted).toBe(true);complete(response('suspected','대출 상품을 권유합니다.'));await pending;expect(events.at(-1)?.status).toBe('withdrawn');await expect(a.accept(rev('다음 발화'))).rejects.toThrow();
});
it('rejects invented evidence and ignores provider-controlled actions and links',async()=>{
 const fetcher:typeof fetch=async()=>Response.json({content:[{type:'text',text:JSON.stringify({...response('suspected','없는 원문'),recommendedAction:'https://attacker.test'})}]});
 await expect(analyzeServiceWithAnthropic({apiKey:'fixture',model:'fixture',text:'안녕하세요',policy:bankPolicy,signal:new AbortController().signal,fetcher})).rejects.toThrow('LLM_EVIDENCE_INVALID');
 const result=await analyzeServiceWithAnthropic({apiKey:'fixture',model:'fixture',text:'안녕하세요',policy:bankPolicy,signal:new AbortController().signal,fetcher:async()=>Response.json({content:[{type:'text',text:JSON.stringify({...response(),recommendedAction:'https://attacker.test'})}]})});expect(result.recommendedAction).not.toContain('attacker');
});
it('requires the same policy in intent, authorization, lease and current institution',async()=>{
 const f=await serviceFixture();await f.consume();await f.lease(1);const r=await f.store.read(f.institution.institutionId),t=r.serviceV3!.attempts[f.attempt.id]!;expect(assertAnalysisPolicy(r,t)).toBe(policyHash(bankPolicy));
 t.lease!.payload.policyHash='0'.repeat(64);expect(()=>assertAnalysisPolicy(r,t)).toThrow('ANALYSIS_POLICY_BINDING_MISMATCH');t.lease!.payload.policyHash=policyHash(bankPolicy);const originalDigest=t.lease!.payload.vcDigest;t.lease!.payload.vcDigest='f'.repeat(64);expect(()=>assertAnalysisPolicy(r,t)).toThrow('ANALYSIS_POLICY_BINDING_MISMATCH');t.lease!.payload.vcDigest=originalDigest;r.policy={...r.policy,version:2};expect(()=>assertAnalysisPolicy(r,t)).toThrow();
});
it('uses provider segment positions for reverse delivery and rejects a model reviving a self-corrected demand',async()=>{
 const {a,events}=fixture(async()=>({...response(),signals:[{category:'인증번호 요구',evidenceSpan:'OTP를 알려주세요.',explanation:'old withdrawn quote'}]}));
 await a.accept(rev('정정합니다. OTP를 알려주지 마세요.',1,'1'));await a.accept(rev('OTP를 알려주세요.',1,'0'));await a.flush();expect(events.at(-1)?.signals).toEqual([]);expect(events.at(-1)?.status).toBe('unavailable');expect(events.at(-1)?.dependencies.map(d=>d.segmentId)).toEqual(['0','1']);
});
it('classifies a provider timeout as unavailable while retaining a grounded rule finding',async()=>{const {a,events}=fixture(async()=>{throw new DOMException('deadline','TimeoutError');});await a.accept(rev('송금해 주세요.'));await a.flush();expect(events.at(-1)).toMatchObject({status:'unavailable',purpose:{relation:'undetermined'},signals:[{category:'송금 유도'}]});});
it('does not treat explicit unverified continuation as a current-purpose confirmation',async()=>{const {purposeAuthorityCurrent}=await import('../../services/api/src/service-analysis.js');const f=await serviceFixture();await f.consume();await f.lease(1);const t=(await f.store.read(f.institution.institutionId)).serviceV3!.attempts[f.attempt.id]!;expect(purposeAuthorityCurrent(t,f.authority.now())).toBe(true);t.authorityStatus='unavailable';t.unverifiedChoice='continue';t.lease!.payload.authority='unavailable';expect(purposeAuthorityCurrent(t,f.authority.now())).toBe(false);});

it('keeps punctuation and correction words inside quotes from creating or retracting a real demand',async()=>{
 const quoted=fixture();await quoted.a.accept(rev('“OTP를 알려주세요.”라는 요청에는 응하지 마세요.'));await quoted.a.flush();expect(quoted.events.at(-1)?.signals).toEqual([]);
 const actual=fixture();await actual.a.accept(rev('OTP를 알려주세요. “정정합니다.”라는 단어를 읽습니다.'));await actual.a.flush();expect(actual.events.at(-1)?.signals.map(s=>s.category)).toEqual(['인증번호 요구']);
});

it('does not display an unsupported no-deviation label while retaining independent risk findings',async()=>{
 const {a,events}=fixture(async()=>({...response(),purpose:{relation:'not-detected',evidenceSpan:'',reason:'The unsolicited offer is unrelated to the approved purpose.'}}));
 await a.accept(rev('인증번호를 알려주세요. 대출 상품도 안내합니다.'));await a.flush();
 expect(events.at(-1)).toMatchObject({status:'unavailable',purpose:{relation:'undetermined'},signals:[{category:'인증번호 요구'}]});
 expect(events.at(-1)?.purpose.reason).not.toContain('unrelated');
});

it('does not cancel or rebill finalized context for interim speech in a different segment',async()=>{
 vi.useFakeTimers();let complete!:(x:ReturnType<typeof response>)=>void,signal!:AbortSignal;
 const provider=vi.fn(async(_text:string,_policy:unknown,s:AbortSignal)=>{signal=s;return new Promise<ReturnType<typeof response>>(resolve=>{complete=resolve;});});
 const {a,events}=fixture(provider,()=>Date.now());
 await a.accept(rev('해외 결제를 확인하겠습니다.',1,'0'));const pending=a.flush();
 for(let n=1;n<=3;n++){await a.accept({...rev('다음 안내',n,'1'),final:false});await vi.advanceTimersByTimeAsync(300);}
 expect(signal.aborted).toBe(false);
 complete(response('not-detected','해외 결제를 확인하겠습니다.'));await pending;
 await vi.advanceTimersByTimeAsync(300);
 expect(provider).toHaveBeenCalledOnce();expect(events.at(-1)?.status).toBe('analyzed');
});

it('keeps a completed result current during unrelated partial speech until its finalized context changes',async()=>{
 vi.useFakeTimers();const provider=vi.fn(async()=>response('suspected','대출 상품을 권유합니다.'));
 const {a,events}=fixture(provider,()=>Date.now());await a.accept(rev('대출 상품을 권유합니다.',1,'0'));await a.flush();
 const completed=events.at(-1)!;
 for(let n=1;n<=3;n++)await a.accept({...rev('다음 안내',n,'1'),final:false});
 expect(events.at(-1)).toBe(completed);expect(a.isCurrent(completed)).toBe(true);expect(provider).toHaveBeenCalledOnce();
 await a.accept(rev('추가 안내입니다.',4,'1'));expect(a.isCurrent(completed)).toBe(false);expect(events.at(-1)?.status).toBe('analyzing');
 await vi.advanceTimersByTimeAsync(60001);expect(events.at(-1)?.dependencies).toEqual([]);
});

it('finishes one in-flight request while coalescing appended final segments, without publishing stale context',async()=>{
 vi.useFakeTimers();const calls:Array<{signal:AbortSignal;complete:(value:ReturnType<typeof response>)=>void}>=[];
 const provider=vi.fn(async(_text:string,_policy:unknown,signal:AbortSignal)=>new Promise<ReturnType<typeof response>>(complete=>calls.push({signal,complete})));
 const {a,events}=fixture(provider,()=>Date.now());await a.accept(rev('거래 확인입니다.',1,'0'));const pending=a.flush();
 await a.accept(rev('추가 안내입니다.',1,'1'));await a.accept(rev('대출 상품을 권유합니다.',1,'2'));
 expect(calls[0]!.signal.aborted).toBe(false);
 calls[0]!.complete(response('not-detected','거래 확인입니다.'));await pending;expect(events.at(-1)?.status).not.toBe('analyzed');
 await vi.advanceTimersByTimeAsync(300);expect(provider).toHaveBeenCalledTimes(2);
 await a.accept(rev('정정합니다. 상품 권유는 하지 않습니다.',2,'2'));expect(calls[1]!.signal.aborted).toBe(true);
 calls[1]!.complete(response('suspected','대출 상품을 권유합니다.'));await Promise.resolve();expect(events.at(-1)?.purpose.relation).not.toBe('suspected');
});


it('discards an old stream result after a new call context starts',async()=>{
 vi.useFakeTimers();const pending:Array<{signal:AbortSignal;complete:(value:ReturnType<typeof response>)=>void}>=[];
 const {a,events}=fixture(async(_text,_policy,signal)=>new Promise(resolve=>pending.push({signal,complete:resolve})),()=>Date.now());
 await a.accept(rev('거래 확인입니다.'));const old=a.flush();
 a.stop();a.start('another-call');const boundary=events.length;
 await a.accept({...rev('새 거래 확인입니다.'),streamId:'another-call'});
 expect(pending[0]!.signal.aborted).toBe(true);pending[0]!.complete(response('not-detected','거래 확인입니다.'));await old;
 expect(events.slice(boundary).some(e=>e.status==='analyzed')).toBe(false);
 await vi.advanceTimersByTimeAsync(300);expect(pending).toHaveLength(2);
 pending[1]!.complete(response('not-detected','새 거래 확인입니다.'));await vi.advanceTimersByTimeAsync(1);
 expect(events.at(-1)).toMatchObject({streamId:'another-call',status:'analyzed'});
});
