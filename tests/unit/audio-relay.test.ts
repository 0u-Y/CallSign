import {expect,it} from 'vitest';
import {audioRelayTarget,createAudioRelay} from '../../services/api/src/audio-relay.js';
it('relays only the audio attempt to a fixed HTTPS backend, never a caller supplied host or path',()=>{
 const backend='https://callsign-backend.example';
 expect(audioRelayTarget('/api/audio?attemptId=call-1',backend).href).toBe('wss://callsign-backend.example/api/v3/audio?attemptId=call-1');
 for(const path of ['/api/audio','/api/audio?attemptId=x','/api/audio?attemptId=call-1&url=https://other.example','/api/audio?attemptId=call-1&attemptId=call-2','/ari/channels?attemptId=call-1'])expect(()=>audioRelayTarget(path,backend)).toThrow();
 for(const origin of ['http://private.example','https://user:secret@other.example','https://other.example/path'])expect(()=>audioRelayTarget('/api/audio?attemptId=call-1',origin)).toThrow();
});
it('rejects other origins and missing work cookies before opening any upstream connection',()=>{
 const relay=createAudioRelay({origin:'https://frontend.example',backendOrigin:'https://backend.example'});
 for(const [headers,expected] of [[{origin:'https://wrong.example',cookie:'ip_session=unit'},403],[{origin:'https://frontend.example'},401],[{origin:'https://frontend.example',cookie:'official_session=unit'},401]] as const){
  let response='';relay.emit('upgrade',{headers,url:'/api/audio?attemptId=call-1'},{end:(text:string)=>{response=text;}},Buffer.alloc(0));expect(response).toContain(String(expected));
 }
});
