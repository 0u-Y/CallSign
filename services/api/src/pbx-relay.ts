import {createServer} from 'node:http';
import WebSocket,{WebSocketServer} from 'ws';

export function pbxRelayTarget(backendOrigin:string){
 const url=new URL(backendOrigin);
 if(url.protocol!=='https:'||url.origin!==backendOrigin||url.username||url.password)throw Error('FIXED_HTTPS_BACKEND_REQUIRED');
 url.protocol='wss:';url.pathname='/pbx/ws';return url;
}
export function createPbxRelay(options:{origin:string;backendOrigin:string}){
 const origin=new URL(options.origin);if(origin.protocol!=='https:'||origin.origin!==options.origin)throw Error('FIXED_HTTPS_ORIGIN_REQUIRED');
 const target=pbxRelayTarget(options.backendOrigin);
 const server=createServer((_req,res)=>{res.writeHead(426,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":{"code":"WEBSOCKET_REQUIRED"}}');});
 const sockets=new WebSocketServer({noServer:true,maxPayload:262144,clientTracking:false});
 server.on('upgrade',(request,socket,head)=>{
  const reject=(status:number)=>socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
  if(request.url?.split('?')[0]!=='/api/pbx'||request.headers.origin!==options.origin||request.headers['sec-websocket-protocol']!=='sip'){reject(403);return;}
  const cookie=request.headers.cookie??'';if(cookie.length>16384||!/(?:^|;\s*)ip_session=/.test(cookie)){reject(401);return;}
  const upstream=new WebSocket(target,'sip',{headers:{origin:options.origin},handshakeTimeout:5000,maxPayload:262144});let downstream:WebSocket|undefined;
  const stop=()=>{if(upstream.readyState===WebSocket.CONNECTING)upstream.terminate();else upstream.close();downstream?.close(1011,'PBX connection closed');};
  socket.on('error',stop);socket.on('close',()=>{if(!downstream)stop();});
  upstream.once('open',()=>{if(socket.destroyed){upstream.close();return;}sockets.handleUpgrade(request,socket,head,client=>{downstream=client;client.on('message',(data,binary)=>{if(upstream.readyState!==WebSocket.OPEN||upstream.bufferedAmount>524288){stop();return;}upstream.send(data,{binary});});client.on('close',()=>upstream.close());client.on('error',stop);});});
  upstream.on('message',(data,binary)=>{if(!downstream||downstream.readyState!==WebSocket.OPEN)return;if(downstream.bufferedAmount>524288){stop();return;}downstream.send(data,{binary});});
  upstream.on('error',()=>{if(!downstream)reject(502);stop();});upstream.on('close',code=>{if(downstream)downstream.close([1000,1008,1011,1013].includes(code)?code:1011,'PBX connection closed');else socket.destroy();});
 });return server;
}
