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

it('retains the actual first media-ready clock through status refresh and temporary pause',()=>{
 const f=fixture();const access=f.call as unknown as {show(p:Record<string,unknown>):void};
 access.show({active:false});expect(f.status.mock.lastCall?.[0].connectedAt).toBeUndefined();
 access.show({active:true});const start=f.status.mock.lastCall?.[0].connectedAt;expect(start).toEqual(expect.any(Number));
 access.show({active:false});access.show({active:true});expect(f.status.mock.lastCall?.[0].connectedAt).toBe(start);
});

it('holds one dial request through repeated controls until its response',async()=>{
 const f=fixture();let resolve!:()=>void;const post=vi.fn(()=>new Promise<void>(r=>{resolve=r;}));Object.assign(f.call,{post});
 const first=f.call.dial();expect(f.status).toHaveBeenLastCalledWith(expect.objectContaining({dialing:true,active:false}));await f.call.dial();expect(post).toHaveBeenCalledOnce();resolve();await first;await f.call.dial();expect(post).toHaveBeenCalledOnce();
});
it('keeps failed dialing distinct from waiting for a recipient',async()=>{
 const f=fixture();Object.assign(f.call,{post:vi.fn().mockRejectedValue(new Error('failed'))});await expect(f.call.dial()).rejects.toThrow('failed');expect(f.status).toHaveBeenLastCalledWith(expect.objectContaining({dialing:false,active:false,connection:'발신 요청 확인 실패'}));
});

it('clears pending dialing on verified media and does not replace connected status with a late dial response',async()=>{
 const f=fixture();let resolve!:()=>void;Object.assign(f.call,{post:()=>new Promise<void>(r=>{resolve=r;})});const pending=f.call.dial();
 (f.call as unknown as {show(p:Record<string,unknown>):void}).show({active:true,connection:'verified connected'});resolve();await pending;
 expect(f.status).toHaveBeenLastCalledWith(expect.objectContaining({active:true,dialing:false,connection:'verified connected'}));
});
