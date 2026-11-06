import {expect,it} from 'vitest';
import {createPbxRelay,pbxRelayTarget} from '../../services/api/src/pbx-relay.js';
it('pins SIP WebSocket to the fixed PBX path and refuses other origins, protocols and cookies',()=>{
 expect(pbxRelayTarget('https://backend.example').href).toBe('wss://backend.example/pbx/ws');
 for(const host of ['http://backend.example','https://user:pass@backend.example','https://backend.example/path'])expect(()=>pbxRelayTarget(host)).toThrow();
 const relay=createPbxRelay({origin:'https://frontend.example',backendOrigin:'https://backend.example'});
 for(const [headers,status] of [[{origin:'https://other.example','sec-websocket-protocol':'sip',cookie:'ip_session=ok'},403],[{origin:'https://frontend.example','sec-websocket-protocol':'sip'},401],[{origin:'https://frontend.example','sec-websocket-protocol':'other',cookie:'ip_session=ok'},403]] as const){let response='';relay.emit('upgrade',{url:'/api/pbx',headers},{end:(value:string)=>{response=value;}},Buffer.alloc(0));expect(response).toContain(String(status));}
});
