import {expect,it,vi} from 'vitest';
import {LiveMedia} from '../../apps/web/src/lib/liveMedia.js';
it('attaches a disabled microphone before negotiation and enables it only after acceptance',async()=>{
 vi.stubGlobal('MediaStream',class{addTrack(){}getTracks(){return [];}});
 const track={enabled:true,kind:'audio',readyState:'live',onended:null,stop:vi.fn()},sender={track:null as unknown,replaceTrack:vi.fn(async(value:unknown)=>{expect(track.enabled).toBe(false);sender.track=value;})};
 const pc={addTrack:vi.fn((value:unknown)=>{expect(track.enabled).toBe(false);sender.track=value;return sender;}),close:vi.fn()} as unknown as RTCPeerConnection;
 const media=new LiveMedia([],()=>{},()=>pc),stream={getTracks:()=>[track],getAudioTracks:()=>[track]} as unknown as MediaStream;
 await media.prepareMicrophone(async()=>stream);expect(sender.track).toBe(track);expect(track.enabled).toBe(false);
 await media.accept(true);expect(track.enabled).toBe(false);media.resume(false);expect(track.enabled).toBe(true);media.close();expect(track.enabled).toBe(false);expect(track.stop).toHaveBeenCalledOnce();
 vi.unstubAllGlobals();
});
