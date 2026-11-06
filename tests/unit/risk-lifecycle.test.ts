import {afterEach,expect,it,vi} from 'vitest';
import {bankPolicy,type ServiceAnalysisEvent} from '../../packages/protocol/src/index.js';
import {ServiceRevisionAnalyzer} from '../../services/api/src/service-analysis.js';
import {ruleRiskAssessments,type RiskUnit} from '../../services/api/src/risk-assessment.js';
const engines:ServiceRevisionAnalyzer[]=[];
afterEach(()=>{engines.forEach(e=>e.stop());engines.length=0;vi.useRealTimers();});
const revision=(text:string,id='a',n=1,streamId='one',final=true)=>({streamId,segmentId:id,revision:n,text,final,source:'remote'});
const result=(units:RiskUnit[])=>({assessments:ruleRiskAssessments(units,bankPolicy).map(r=>({code:r.code,result:r.result,evidenceIds:r.evidence.map(e=>units.find(u=>u.segmentId===e.segmentId)!.id),explanation:'요청 당시 발언에 연결한 합성 시험 결과입니다.'}))});
function setup(provider?: (units:RiskUnit[],p:typeof bankPolicy,s:AbortSignal)=>Promise<unknown>){const events:ServiceAnalysisEvent[]=[];const engine=new ServiceRevisionAnalyzer(bankPolicy,e=>events.push(e),{scope:'risk-2',...(provider?{analyze:provider}:{})});engines.push(engine);engine.start('one');return {engine,events};}
it('completes without purpose and does not replay duplicate finals or cancel on partials',async()=>{
 let resolve!:(v:unknown)=>void,signal!:AbortSignal,units!:RiskUnit[];
 const provider=vi.fn(async(u:RiskUnit[],_p:typeof bankPolicy,s:AbortSignal)=>{units=u;signal=s;return new Promise(r=>resolve=r);});const {engine,events}=setup(provider);
 await engine.accept(revision('인증번호를 읽어주세요.'));const work=engine.flush();
 await engine.accept(revision('다음 발언','b',1,'one',false));expect(signal.aborted).toBe(false);resolve(result(units));await work;
 expect(events.at(-1)).toMatchObject({status:'analyzed',analyzerVersion:'risk-context-2'});expect(events.at(-1)).not.toHaveProperty('purpose');
 expect(await engine.accept(revision('인증번호를 읽어주세요.'))).toBe(false);await engine.flush();expect(provider).toHaveBeenCalledOnce();
});
it('queues a newer final without cancelling the request or publishing it over the newer revision',async()=>{
 let resolve!:(v:unknown)=>void,signal!:AbortSignal,units!:RiskUnit[];const provider=vi.fn(async(u:RiskUnit[],_p:typeof bankPolicy,s:AbortSignal)=>{units=u;signal=s;return new Promise(r=>resolve=r);});
 const {engine,events}=setup(provider);await engine.accept(revision('인증번호를 읽어주세요.'));const first=engine.flush();const firstUnits=units;
 await engine.accept(revision('계좌로 송금하세요.','b'));expect(signal.aborted).toBe(false);resolve(result(firstUnits));await first;expect(events.at(-1)?.status).toBe('analyzing');
 const second=engine.flush();resolve(result(units));await second;expect(provider).toHaveBeenCalledTimes(2);expect(events.at(-1)?.status).toBe('analyzed');
});
it('retains valid earlier findings on failure but invalidates STT revisions and clears on stop',async()=>{
 let fail=false;const {engine,events}=setup(async units=>{if(fail)throw Error('TIMEOUT');return result(units);});
 await engine.accept(revision('인증번호를 읽어주세요.'));await engine.flush();fail=true;await engine.accept(revision('거래 시각은 세 시입니다.','b'));await engine.flush();
 const failed=events.at(-1)!;expect(failed.status).toBe('unavailable');if(failed.analyzerVersion!=='risk-context-2')throw Error('wrong version');expect(failed.assessments.some(a=>a.source==='llm'&&a.evaluatedContextRevision!<failed.contextRevision)).toBe(true);
 await engine.accept(revision('인증번호를 알려주면 안 됩니다.','a',2));await engine.flush();const corrected=events.at(-1)!;expect(corrected.signals).toEqual([]);engine.stop();expect(events.at(-1)).toMatchObject({status:'withdrawn',assessments:[]});
});
it('discards providers that ignore abort after withdrawal and new streams',async()=>{
 let resolve!:(v:unknown)=>void,units!:RiskUnit[];const {engine,events}=setup(async u=>{units=u;return new Promise(r=>resolve=r);});
 await engine.accept(revision('인증번호를 읽어주세요.'));const work=engine.flush();engine.stop();engine.start('two');const count=events.length;resolve(result(units));await work;expect(events).toHaveLength(count);
 await expect(engine.accept(revision('old'))).rejects.toThrow('CONSENT_REQUIRED');
});
it('keeps provider OFF and malformed responses unavailable, never not-detected',async()=>{
 for(const provider of [undefined,async()=>({assessments:[]}),async()=>'{"assessments":']){const {engine,events}=setup(provider);await engine.accept(revision('그 번호를 읽어주세요.'));await engine.flush();expect(events.at(-1)).toMatchObject({status:'unavailable',assessments:expect.arrayContaining([expect.objectContaining({result:'undetermined'})])});}
});
it('preserves whole 4000-character quotes without slicing a negation',async()=>{
 const text='인증번호를 알려주면 안 됩니다.'+' '.repeat(4000-'인증번호를 알려주면 안 됩니다.'.length);let observed='';const {engine}=setup(async units=>{observed=units[0]!.text;return result(units);});await engine.accept(revision(text));await engine.flush();expect(observed).toBe(text);
});
