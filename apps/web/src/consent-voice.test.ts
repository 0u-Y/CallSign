import {afterEach,expect,it,vi} from 'vitest';
import {playConsentVoice,consentVoiceText} from './lib/consentVoice.js';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function setup(local=true){
 vi.useFakeTimers();const speak=vi.fn(),cancel=vi.fn();
 vi.stubGlobal('SpeechSynthesisUtterance',class {constructor(public text:string){}});
 vi.stubGlobal('speechSynthesis',{getVoices:()=>[{lang:'ko-KR',localService:local}],speak,cancel});return {speak,cancel};
}
it('uses only a local Korean voice and reports measured duration, not a fixed five seconds',()=>{
 const f=setup(),done=vi.fn();const stop=playConsentVoice(done);const u=f.speak.mock.calls[0]![0];
 expect(u.text).toBe(consentVoiceText);expect(u.voice.localService).toBe(true);u.onstart();u.onend();
 expect(done).toHaveBeenCalledWith({state:'ended',durationMs:expect.any(Number)});stop();expect(done).toHaveBeenCalledOnce();
});
it('does not silently select a network voice when local Korean speech is unavailable',()=>{
 const f=setup(false),done=vi.fn();playConsentVoice(done);expect(f.speak).not.toHaveBeenCalled();expect(done).toHaveBeenCalledWith({state:'unavailable'});
});
it('cancels timers and ignores a late completion after withdrawal or call termination',()=>{
 const f=setup(),done=vi.fn(),stop=playConsentVoice(done),late=f.speak.mock.calls[0]![0].onend;
 stop();late();vi.runAllTimers();expect(done).not.toHaveBeenCalled();expect(f.cancel).toHaveBeenCalledOnce();
});
it('exposes blocked autoplay or missing end events as unavailable without blocking selection',()=>{
 setup();const done=vi.fn();playConsentVoice(done);vi.advanceTimersByTime(15000);expect(done).toHaveBeenCalledWith({state:'unavailable'});
});
