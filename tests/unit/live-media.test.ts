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
it('sends a recording on the existing sender, preserves pause/mute and releases it on switch and close',async()=>{
 const microphone={enabled:false,readyState:'live',stop:vi.fn(),onended:null},fileTrack={enabled:false,stop:vi.fn()},close=vi.fn(async()=>{}),pause=vi.fn();
 vi.stubGlobal('MediaStream',class{getTracks(){return [];}});
 let ended:(()=>void)|null=null;vi.stubGlobal('Audio',class{src='';set onended(value:(()=>void)|null){ended=value;}play=vi.fn(async()=>{});pause=pause;removeAttribute(){}load(){}});
 vi.stubGlobal('AudioContext',class{createMediaStreamDestination(){return {stream:{getAudioTracks:()=>[fileTrack],getTracks:()=>[fileTrack]}};}createMediaElementSource(){return {connect:vi.fn()};}resume=vi.fn(async()=>{});close=close;});
 const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:owned'),revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 const sender={replaceTrack:vi.fn(async()=>{})},peer={addTrack:()=>sender,close:vi.fn()}as unknown as RTCPeerConnection;
 const media=new LiveMedia([],()=>{},()=>peer);await media.prepareMicrophone(async()=>({getTracks:()=>[microphone],getAudioTracks:()=>[microphone]})as unknown as MediaStream);await media.accept();
 const onEnded=vi.fn();await media.playRecording(new File(['audio'],'sample.webm'),onEnded);expect(sender.replaceTrack).toHaveBeenLastCalledWith(fileTrack);expect(fileTrack.enabled).toBe(true);expect(microphone.enabled).toBe(false);
 media.pause();expect(fileTrack.enabled).toBe(false);media.resume(true);expect(fileTrack.enabled).toBe(false);media.resume(false);expect(fileTrack.enabled).toBe(true);
 ended!();expect(onEnded).toHaveBeenCalledOnce();expect(fileTrack.stop).toHaveBeenCalledOnce();expect(microphone.enabled).toBe(false);
 await media.useMicrophone();expect(sender.replaceTrack).toHaveBeenLastCalledWith(microphone);expect(fileTrack.stop).toHaveBeenCalledOnce();expect(microphone.enabled).toBe(true);expect(revoke).toHaveBeenCalledWith('blob:owned');
 media.close();expect(microphone.stop).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();create.mockRestore();revoke.mockRestore();vi.unstubAllGlobals();
});
it('discards a file source when a call closes during asynchronous playback setup',async()=>{
 const microphone={enabled:false,readyState:'live',stop:vi.fn(),onended:null},fileTrack={enabled:false,stop:vi.fn()};let ready!:()=>void;
 vi.stubGlobal('MediaStream',class{getTracks(){return [];}});vi.stubGlobal('Audio',class{src='';play(){return new Promise<void>(r=>{ready=r;});}pause(){}removeAttribute(){}load(){}});
 vi.stubGlobal('AudioContext',class{createMediaStreamDestination(){return {stream:{getAudioTracks:()=>[fileTrack],getTracks:()=>[fileTrack]}};}createMediaElementSource(){return {connect:vi.fn()};}async resume(){}async close(){}});
 const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:owned'),revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{}),sender={replaceTrack:vi.fn(async()=>{})};
 const media=new LiveMedia([],()=>{},()=>({addTrack:()=>sender,close(){}})as unknown as RTCPeerConnection);await media.prepareMicrophone(async()=>({getTracks:()=>[microphone],getAudioTracks:()=>[microphone]})as unknown as MediaStream);await media.accept();
 const pending=media.playRecording(new File(['audio'],'sample.webm'));await Promise.resolve();media.close();ready();await expect(pending).rejects.toThrow('MEDIA_CLOSED');expect(sender.replaceTrack).toHaveBeenCalledOnce();expect(fileTrack.enabled).toBe(false);expect(fileTrack.stop).toHaveBeenCalledOnce();create.mockRestore();revoke.mockRestore();vi.unstubAllGlobals();
});
