import {createServer} from 'node:http';
import WebSocket,{WebSocketServer} from 'ws';

export function audioRelayTarget(path:string,backendOrigin:string){
 const backend=new URL(backendOrigin),request=new URL(path,'https://relay.invalid');
 if(backend.protocol!=='https:'||backend.origin!==backendOrigin||backend.username||backend.password)throw Error('FIXED_HTTPS_BACKEND_REQUIRED');
 if(!['/api/audio','/api/v3/audio'].includes(request.pathname)||request.searchParams.size!==1||request.searchParams.getAll('attemptId').length!==1)throw Error('AUDIO_ROUTE_INVALID');
 const attempt=request.searchParams.get('attemptId');if(!attempt||attempt.length<3||attempt.length>200)throw Error('AUDIO_ATTEMPT_REQUIRED');
 backend.protocol='wss:';backend.pathname='/api/v3/audio';backend.search=new URLSearchParams({attemptId:attempt}).toString();return backend;
}
export function createAudioRelay(options:{origin:string;backendOrigin:string}){
 const origin=new URL(options.origin);if(origin.protocol!=='https:'||origin.origin!==options.origin||origin.username||origin.password)throw Error('FIXED_HTTPS_ORIGIN_REQUIRED');
 audioRelayTarget('/api/audio?attemptId=configuration-check',options.backendOrigin);
 const server=createServer((_request,response)=>{response.writeHead(426,{'content-type':'application/json','cache-control':'no-store'});response.end('{"error":{"code":"WEBSOCKET_REQUIRED"}}');});
 const sockets=new WebSocketServer({noServer:true,maxPayload:262144,clientTracking:false});
 server.on('upgrade',(request,socket,head)=>{
  const reject=(status:number)=>socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
  if(request.headers.origin!==options.origin){reject(403);return;}
  const cookie=request.headers.cookie??'';
  if(cookie.length>16384||!/(?:^|;\s*)ip_session=/.test(cookie)){reject(401);return;}
  let target:URL;try{target=audioRelayTarget(request.url??'',options.backendOrigin);}catch{reject(404);return;}
  const upstream=new WebSocket(target,{headers:{origin:options.origin,cookie},handshakeTimeout:5000,maxPayload:262144});
  let downstream:WebSocket|undefined;
  const stop=()=>{if(upstream.readyState===WebSocket.CONNECTING)upstream.terminate();else upstream.close();downstream?.close(1011,'analysis connection closed');};
  socket.on('error',stop);socket.on('close',()=>{if(!downstream)stop();});
  upstream.once('open',()=>{
   if(socket.destroyed){upstream.close();return;}
   sockets.handleUpgrade(request,socket,head,client=>{
    downstream=client;
    client.on('message',(data,binary)=>{if(upstream.readyState!==WebSocket.OPEN||upstream.bufferedAmount>524288){stop();return;}upstream.send(data,{binary});});
    client.on('close',()=>upstream.close());client.on('error',stop);
   });
  });
  upstream.on('message',(data,binary)=>{if(!downstream||downstream.readyState!==WebSocket.OPEN)return;if(downstream.bufferedAmount>524288){stop();return;}downstream.send(data,{binary});});
  upstream.on('error',()=>{if(!downstream)reject(502);stop();});
  upstream.on('close',code=>{if(downstream)downstream.close([1000,1008,1011,1013].includes(code)?code:1011,'analysis connection closed');else socket.destroy();});
 });
 return server;
}
