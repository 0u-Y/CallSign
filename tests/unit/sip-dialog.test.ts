import { expect,it,vi } from 'vitest';
const media=vi.hoisted(()=>({peer:undefined as any,close:vi.fn(),answer:async()=>({type:'answer',sdp:'local-sdp'})}));
vi.mock('../../apps/web/src/lib/liveMedia.js',()=>({LiveMedia:class{peer=media.peer;remote={};async prepareMicrophone(){}async accept(){}mute(){}close(){media.close();}}}));
import { PbxSip,parseSip } from '../../apps/web/src/lib/pbxSip.js';
class Socket {
 static OPEN=1;readyState=1;sent:string[]=[];static instance:Socket;
 onopen:(()=>void)|undefined;onclose:(()=>void)|undefined;onerror:(()=>void)|undefined;onmessage:((e:{data:string})=>void)|undefined;
 constructor(){Socket.instance=this;}send(v:string){this.sent.push(v);}close(){this.readyState=3;}receive(data:string){this.onmessage?.({data});}
}
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
async function fixture(){
 vi.stubGlobal('WebSocket',Socket);media.peer={connectionState:'connected',iceGatheringState:'complete',localDescription:{sdp:'local-sdp'},remoteDescription:{sdp:'remote-sdp'},setRemoteDescription:async()=>{},setLocalDescription:async()=>{},createAnswer:()=>media.answer()};media.answer=async()=>({type:'answer',sdp:'local-sdp'});
 const report=vi.fn(async()=>{}),sip=new PbxSip({username:'endpoint',password:'secret',realm:'pbx.example',sipDomain:'pbx.example',wssUrl:'wss://pbx.example'},[],report,()=>{});
 const ready=sip.start();await flush();const socket=Socket.instance;socket.onopen?.();const registration=parseSip(socket.sent[0]!);const header=(k:string)=>registration.headers.get(k)![0]!;
 socket.receive(`SIP/2.0 200 OK\r\nVia: ${header('via')}\r\nFrom: ${header('from')}\r\nTo: ${header('to')};tag=server\r\nCall-ID: ${header('call-id')}\r\nCSeq: ${header('cseq')}\r\nContent-Length: 0\r\n\r\n`);await ready;
 const request=(method:string,cseq:number,toTag='')=>`${method} sip:endpoint@pbx.example SIP/2.0\r\nVia: SIP/2.0/WSS pbx.example;branch=z9hG4bKinvite\r\nFrom: <sip:pbx@pbx.example>;tag=remote\r\nTo: <sip:endpoint@pbx.example>${toTag?`;tag=${toTag}`:''}\r\nCall-ID: call-1\r\nCSeq: ${cseq} ${method}\r\nContact: <sip:pbx@pbx.example>\r\n${method==='INVITE'?'Content-Type: application/sdp\r\nContent-Length: 10\r\n\r\nremote-sdp':'Content-Length: 0\r\n\r\n'}`;
 return {sip,socket,report,request};
}
it('reports a dialog once after matching ACK and refuses another dialog BYE',async()=>{const t=await fixture();try{t.socket.receive(t.request('INVITE',10));await flush();const response=parseSip(t.socket.sent.at(-1)!);const tag=response.headers.get('to')![0]!.split(';tag=')[1]!;t.socket.receive(t.request('ACK',10,tag));t.socket.receive(t.request('ACK',10,tag));await flush();expect(t.report).toHaveBeenCalledOnce();t.socket.receive(t.request('BYE',11,'wrong-tag'));await flush();expect(t.socket.sent.at(-1)).toContain('481');expect(t.socket.readyState).toBe(1);t.socket.receive(t.request('BYE',11,tag));await flush();expect(t.socket.sent.at(-1)).toContain('200 OK');expect(t.socket.sent.filter(m=>m.startsWith('BYE'))).toHaveLength(0);expect(t.socket.readyState).toBe(3);}finally{t.sip.close();}});
it('handles CANCEL while SDP work is pending and never reports an accepted session',async()=>{const t=await fixture();let resolve:(value:{type:string;sdp:string})=>void=()=>{};media.answer=()=>new Promise(r=>{resolve=r;});try{t.socket.receive(t.request('INVITE',10));await flush();t.socket.receive(t.request('CANCEL',10));await flush();expect(t.socket.sent.some(m=>m.includes('487 Request Terminated'))).toBe(true);resolve({type:'answer',sdp:'local-sdp'});await flush();expect(t.report).not.toHaveBeenCalled();expect(t.socket.readyState).toBe(3);}finally{t.sip.close();}});
