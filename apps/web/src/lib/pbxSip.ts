import { LiveMedia } from './liveMedia.js';
export interface SipMessage { start:string; headers:Map<string,string[]>; body:string }
export function parseSip(raw:string):SipMessage {
  if(raw.length>65536)throw new Error('SIP_MESSAGE_TOO_LARGE');const split=raw.indexOf('\r\n\r\n');if(split<0)throw new Error('SIP_FRAMING_INVALID');
  const lines=raw.slice(0,split).split('\r\n'),start=lines.shift()!;const headers=new Map<string,string[]>();
  for(const line of lines){const index=line.indexOf(':');if(index<1||/^\s/.test(line))throw new Error('SIP_HEADER_INVALID');const rawKey=line.slice(0,index).toLowerCase(),key=({v:'via',f:'from',t:'to',i:'call-id',m:'contact',l:'content-length',c:'content-type'} as Record<string,string>)[rawKey]??rawKey,values=headers.get(key)??[];values.push(line.slice(index+1).trim());headers.set(key,values);}
  for(const key of ['call-id','cseq','from','to','content-length'])if((headers.get(key)?.length??0)>1)throw new Error('SIP_DUPLICATE_HEADER');
  if(!start.match(/^(?:SIP\/2\.0 [1-6]\d{2} .+|[A-Z]+ sip:[^\s]+ SIP\/2\.0)$/)||['call-id','cseq','from','to','via'].some(k=>!headers.get(k)?.length)||!/^\d+ [A-Z]+$/.test(headers.get('cseq')![0]!))throw new Error('SIP_REQUIRED_HEADER_INVALID');
  if(!start.startsWith('SIP/2.0')&&headers.get('cseq')![0]!.split(' ')[1]!==start.split(' ')[0])throw new Error('SIP_CSEQ_METHOD_MISMATCH');
  const body=raw.slice(split+4),length=headers.get('content-length')?.[0];if(!length||!/^\d+$/.test(length)||Number(length)!==new TextEncoder().encode(body).length)throw new Error('SIP_CONTENT_LENGTH_INVALID');return {start,headers,body};
}
const h=(message:SipMessage,key:string)=>message.headers.get(key)?.[0]??'';
const sha256=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
export async function sipDigest(challenge:string,credentials:{username:string;password:string;realm:string},method:string,uri:string,cnonce:string,nc='00000001') {
  if(!/^[0-9a-f]{8}$/.test(nc)||Number.parseInt(nc,16)<1||!/^REGISTER$/.test(method)||!/^sip:[a-zA-Z0-9.-]+$/.test(uri))throw new Error('SIP_AUTH_INVALID');
  if(!challenge.startsWith('Digest '))throw new Error('SIP_DIGEST_REQUIRED');const fields:Record<string,string>={};
  for(const match of challenge.slice(7).matchAll(/([a-zA-Z_]+)=(?:"([^"]*)"|([^,\s]+))/g))fields[match[1]!.toLowerCase()]=match[2]??match[3]!;
  if(fields.algorithm?.toUpperCase()!=='SHA-256'||fields.realm!==credentials.realm||!fields.nonce||!fields.qop?.split(',').map(v=>v.trim()).includes('auth'))throw new Error('SIP_AUTH_PROFILE_UNSUPPORTED');
  if(Object.values(fields).some(v=>/["\\\r\n]/.test(v))||/["\r\n]/.test(credentials.username+credentials.realm+cnonce))throw new Error('SIP_AUTH_INVALID');
  const ha1=await sha256(`${credentials.username}:${credentials.realm}:${credentials.password}`),ha2=await sha256(`${method}:${uri}`),response=await sha256(`${ha1}:${fields.nonce}:${nc}:${cnonce}:auth:${ha2}`);
  return `Digest username="${credentials.username}", realm="${credentials.realm}", nonce="${fields.nonce}", uri="${uri}", algorithm=SHA-256, response="${response}", qop=auth, nc=${nc}, cnonce="${cnonce}"${fields.opaque?`, opaque="${fields.opaque}"`:''}`;
}
const token=()=>crypto.randomUUID().replaceAll('-','');
export class PbxSip {
  readonly media:LiveMedia; private socket:WebSocket|undefined;private closed=false;private registered=false;private cseq=0;private registerId=token();private tag=token();private invite:SipMessage|undefined;private response='';private acked=false;private timer:ReturnType<typeof setTimeout>|undefined;private authRetries=0;private registerBranch='';private localSequence=0;private ackTimer:ReturnType<typeof setTimeout>|undefined;private registeredResolve:(()=>void)|undefined;private registeredReject:((e:Error)=>void)|undefined;private queue=Promise.resolve();
  constructor(readonly credentials:{username:string;password:string;realm:string;sipDomain:string;wssUrl:string},iceServers:RTCIceServer[],readonly report:(value:{callId:string;localSdp:string;remoteSdp:string})=>Promise<void>,readonly status:(status:string)=>void){this.media=new LiveMedia(iceServers,reason=>{status(reason);this.close();});}
  get callId(){return this.invite?h(this.invite,'call-id'):undefined;}
  get isRegistered(){return this.registered;}
  async start(){await this.media.prepareMicrophone();if(this.closed)return;const socket=new WebSocket(this.credentials.wssUrl,'sip');this.socket=socket;
    socket.onopen=()=>{this.status('SIP 등록 중');this.register();};socket.onerror=()=>{this.status('PBX 연결 실패');this.close();};socket.onclose=()=>{this.status('PBX 연결 종료');this.close();};
    const registered=new Promise<void>((resolve,reject)=>{this.registeredResolve=resolve;this.registeredReject=reject;});
    socket.onmessage=event=>{if(typeof event.data!=='string'){this.close();return;}if(event.data!=='\r\n\r\n'&&event.data.startsWith('CANCEL ')){try{this.cancel(parseSip(event.data));}catch{this.close();}return;}this.queue=this.queue.then(async()=>{if(this.closed)return;if(event.data==='\r\n\r\n'){socket.send('\r\n');return;}await this.receive(parseSip(String(event.data)));}).catch(()=>{this.status('SIP 협상 실패: 재검증 필요');this.close();});};
    this.timer=setTimeout(()=>{if(!this.registered){this.status('SIP 등록 시간 초과');this.close();}},10000);return registered;
  }
  private send(value:string){if(this.closed||this.socket?.readyState!==WebSocket.OPEN)throw new Error('SIP_SOCKET_CLOSED');this.socket.send(value);}
  private register(authorization?:string){const c=this.credentials,uri=`sip:${c.sipDomain}`,branch=`z9hG4bK${token()}`;this.cseq++;this.registerBranch=branch;
    this.send(`REGISTER ${uri} SIP/2.0\r\nVia: SIP/2.0/WSS browser.invalid;branch=${branch};rport\r\nMax-Forwards: 70\r\nFrom: <sip:${c.username}@${c.sipDomain}>;tag=${this.tag}\r\nTo: <sip:${c.username}@${c.sipDomain}>\r\nCall-ID: ${this.registerId}\r\nCSeq: ${this.cseq} REGISTER\r\nContact: <sip:${c.username}@browser.invalid;transport=ws>\r\nExpires: 120\r\nSupported: outbound\r\n${authorization?`Authorization: ${authorization}\r\n`:''}Content-Length: 0\r\n\r\n`);
  }
  private reply(message:SipMessage,code:number,reason:string,body=''){
    const via=message.headers.get('via')?.map(v=>`Via: ${v}\r\n`).join('')??'';const to=h(message,'to');return `SIP/2.0 ${code} ${reason}\r\n${via}From: ${h(message,'from')}\r\nTo: ${to}${to.includes(';tag=')?'':`;tag=${this.tag}`}\r\nCall-ID: ${h(message,'call-id')}\r\nCSeq: ${h(message,'cseq')}\r\nContact: <sip:${this.credentials.username}@browser.invalid;transport=ws>\r\n${body?'Content-Type: application/sdp\r\n':''}Content-Length: ${new TextEncoder().encode(body).length}\r\n\r\n${body}`;
  }
  private async receive(message:SipMessage){
    if(message.start.startsWith('SIP/2.0')){
      if(h(message,'call-id')!==this.registerId||h(message,'cseq')!==`${this.cseq} REGISTER`||!h(message,'via').includes(`branch=${this.registerBranch}`))return;
      const code=Number(message.start.split(' ')[1]);if(code===401){if(++this.authRetries>2)throw new Error('SIP_AUTH_FAILED');const auth=await sipDigest(h(message,'www-authenticate'),this.credentials,'REGISTER',`sip:${this.credentials.sipDomain}`,token());this.register(auth);return;}
      if(code===200){this.registered=true;this.registeredResolve?.();this.registeredResolve=undefined;this.registeredReject=undefined;this.authRetries=0;clearTimeout(this.timer);this.status('PBX 대기: 음성 송신 차단');this.timer=setTimeout(()=>{if(!this.closed)this.register();},60000);return;}if(code>=300)throw new Error('SIP_REGISTER_FAILED');return;
    }
    const method=message.start.split(' ')[0];
    if(method==='OPTIONS'){this.send(this.reply(message,200,'OK'));return;}
    if(method==='INVITE'){
      if(this.invite){if(h(message,'call-id')===h(this.invite,'call-id')&&h(message,'cseq')===h(this.invite,'cseq')&&this.response)this.send(this.response);else this.send(this.reply(message,488,'Not Acceptable Here'));return;}
      if(message.headers.has('record-route')){this.send(this.reply(message,488,'Unsupported Route'));return;}
      if(!this.registered||h(message,'content-type').toLowerCase()!=='application/sdp'||!h(message,'to').includes(`sip:${this.credentials.username}@`))throw new Error('SIP_INVITE_INVALID');
      this.invite=message;this.send(this.reply(message,100,'Trying'));await this.media.peer.setRemoteDescription({type:'offer',sdp:message.body});
      await this.media.peer.setLocalDescription(await this.media.peer.createAnswer());
      await new Promise<void>((resolve,reject)=>{const pc=this.media.peer;if(pc.iceGatheringState==='complete'){resolve();return;}const timer=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',listener);reject(new Error('ICE_TIMEOUT'));},5000);const listener=()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',listener);resolve();}};pc.addEventListener('icegatheringstatechange',listener);});
      if(this.closed)return;this.response=this.reply(message,200,'OK',this.media.peer.localDescription!.sdp);this.send(this.response);this.ackTimer=setTimeout(()=>{if(!this.acked){this.status('PBX 수신 확인 시간 초과');this.close();}},32000);this.status('PBX 협상 완료: 승인 확인 전 음성 차단');return;
    }
    if(!this.invite||h(message,'call-id')!==h(this.invite,'call-id')){if(method!=='ACK')this.send(this.reply(message,481,'Call Does Not Exist'));return;}
    if(!h(message,'to').includes(`;tag=${this.tag}`)||h(message,'from')!==h(this.invite,'from')){if(method!=='ACK')this.send(this.reply(message,481,'Dialog Does Not Exist'));return;}
    if(method==='ACK'){if(h(message,'cseq')!==`${h(this.invite,'cseq').split(' ')[0]} ACK`)return;if(this.acked)return;this.acked=true;clearTimeout(this.ackTimer);await this.report({callId:h(message,'call-id'),localSdp:this.media.peer.localDescription!.sdp,remoteSdp:this.media.peer.remoteDescription!.sdp});return;}
    if(method==='CANCEL'){this.cancel(message);return;}
    if(method==='BYE'){if(Number(h(message,'cseq').split(' ')[0])<=Number(h(this.invite,'cseq').split(' ')[0])){this.send(this.reply(message,500,'CSeq Out Of Order'));return;}this.send(this.reply(message,200,'OK'));this.acked=false;this.status('PBX 상대 종료');this.close();return;}
    this.send(this.reply(message,405,'Method Not Allowed'));
  }
  private cancel(message:SipMessage){const invite=this.invite;if(!invite||this.response||h(message,'call-id')!==h(invite,'call-id')||h(message,'from')!==h(invite,'from')||h(message,'cseq')!==`${h(invite,'cseq').split(' ')[0]} CANCEL`||h(message,'via')!==h(invite,'via')){this.send(this.reply(message,481,'Transaction Does Not Exist'));return;}this.send(this.reply(message,200,'OK'));this.send(this.reply(invite,487,'Request Terminated'));this.status('상대방이 발신을 취소했습니다');this.close();}
  async accept(){if(!this.acked||this.media.peer.connectionState!=='connected')throw new Error('PBX_TRANSPORT_NOT_CONNECTED');await this.media.accept(true);this.status('통화 중');}
  pause(){this.media.pause();}
  close(){if(this.closed)return;
    if(this.invite&&this.acked&&this.socket?.readyState===WebSocket.OPEN){const contact=h(this.invite,'contact').match(/<([^>]+)>/)?.[1];if(contact&&/^sips?:[^\s\r\n]+$/.test(contact)){const from=h(this.invite,'to'),to=h(this.invite,'from');try{this.send(`BYE ${contact} SIP/2.0\r\nVia: SIP/2.0/WSS browser.invalid;branch=z9hG4bK${token()}\r\nMax-Forwards: 70\r\nFrom: ${from}${from.includes(';tag=')?'':`;tag=${this.tag}`}\r\nTo: ${to}\r\nCall-ID: ${h(this.invite,'call-id')}\r\nCSeq: ${++this.localSequence} BYE\r\nContent-Length: 0\r\n\r\n`);}catch{this.status('서버 통화 자원 정리 대기');}}}
    this.closed=true;this.registeredReject?.(new Error('SIP_SESSION_CLOSED'));this.registeredReject=undefined;clearTimeout(this.ackTimer);clearTimeout(this.timer);this.media.close();this.socket?.close();this.socket=undefined;}
}
