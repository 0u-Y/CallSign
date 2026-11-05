import {afterEach,expect,it,vi} from 'vitest';
import {ServiceCall} from './lib/serviceCall.js';
const provider=vi.hoisted(()=>{vi.stubGlobal('sessionStorage',{getItem:()=>null});return {onEvent:undefined as undefined|((e:unknown)=>void),stop:vi.fn()};});
vi.mock('./lib/liveMedia.js',()=>({streamRemoteAudio:(_remote:unknown,_attempt:string,onEvent:(e:unknown)=>void)=>{provider.onEvent=onEvent;return provider.stop;}}));
afterEach(()=>{provider.onEvent=undefined;});
function fixture(){vi.stubGlobal('document',{hidden:false});const risk=vi.fn(),status=vi.fn();
 // Controller lifetime only: no microphone, transport, key or authority verification is executed.
 const call=new ServiceCall({role:'recipient',attemptId:'fixture-attempt',risk,status} as unknown as ConstructorParameters<typeof ServiceCall>[0]);
 const access=call as unknown as {analysisWanted:boolean;sip:unknown;beginAnalysis():Promise<void>};access.analysisWanted=true;access.sip={media:{remote:{}}};return {call,access,risk,status};
}
it('clears browser analysis on socket/provider stop instead of waiting for a withdrawn event that may never arrive',async()=>{const f=fixture();await f.access.beginAnalysis();provider.onEvent?.({type:'unavailable',code:'AUDIO_SESSION_REVOKED'});expect(f.access.analysisWanted).toBe(false);expect(provider.stop).toHaveBeenCalledOnce();expect(f.risk).toHaveBeenCalledWith({type:'clear'});const count=f.risk.mock.calls.length;provider.onEvent?.({type:'risk',event:{status:'analyzed',signals:[{evidenceSpan:'late'}]}});expect(f.risk).toHaveBeenCalledTimes(count);});
it('keeps rule-result delivery on model-only failure while the authorized audio stream remains active',async()=>{const f=fixture();await f.access.beginAnalysis();const event={type:'risk',event:{status:'unavailable',signals:[{evidenceSpan:'OTP를 알려주세요'}]}};provider.onEvent?.(event);expect(f.access.analysisWanted).toBe(true);expect(f.risk).toHaveBeenCalledWith(event);expect(provider.stop).not.toHaveBeenCalled();});
it('invalidates browser warnings on a context revision notice before a delayed new analysis result arrives',async()=>{const f=fixture();await f.access.beginAnalysis();provider.onEvent?.({type:'risk',event:{contextRevision:1,status:'analyzed',signals:[]}});provider.onEvent?.({type:'revision',contextRevision:2});expect(f.risk).toHaveBeenCalledWith({type:'context-changed'});expect(f.risk).not.toHaveBeenCalledWith({type:'clear'});const count=f.risk.mock.calls.length;provider.onEvent?.({type:'risk',event:{contextRevision:1,status:'analyzed',signals:[{evidenceSpan:'obsolete'}]}});expect(f.risk).toHaveBeenCalledTimes(count);provider.onEvent?.({type:'risk',event:{contextRevision:2,status:'analyzed',signals:[]}});expect(f.risk).toHaveBeenCalledTimes(count+1);});

it('replaces the analyzing indicator on a current result and ignores older context status',async()=>{
 const f=fixture();await f.access.beginAnalysis();provider.onEvent?.({type:'revision',contextRevision:2});provider.onEvent?.({type:'risk',event:{contextRevision:2,status:'analyzed',signals:[]}});
 expect(f.status).toHaveBeenLastCalledWith(expect.objectContaining({analysis:'상대 발화 분석 결과 수신 · 통화 전체 안전 판정 아님'}));const count=f.status.mock.calls.length;
 provider.onEvent?.({type:'risk',event:{contextRevision:1,status:'unavailable',signals:[]}});expect(f.status).toHaveBeenCalledTimes(count);
});
