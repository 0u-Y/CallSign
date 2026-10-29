// Child-process containment, in addition to existing test guards. Never starts a listener.
import net from 'node:net';
import dgram from 'node:dgram';
import tls from 'node:tls';
const allowed=JSON.parse(process.env.CALLSIGN_VALIDATION_NETWORK??'[]');
const permitted=(host,port)=>allowed.some(v=>v.host===String(host??'localhost').toLowerCase()&&v.port===Number(port));
const denied=()=>{throw new Error('VALIDATION_NETWORK_NOT_AUTHORIZED');};
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){let values=Array.isArray(args[0])?args[0]:args;const value=values[0];const options=typeof value==='object'?value:{port:value,host:typeof values[1]==='string'?values[1]:'localhost'};if(options.path||!permitted(options.host,options.port))denied();return connect.apply(this,args);};
const tlsConnect=tls.connect;
tls.connect=function(...args){const value=args[0],options=typeof value==='object'?value:{port:value,host:typeof args[1]==='string'?args[1]:'localhost'};if(!options.socket&&!permitted(options.host,options.port??443))denied();return tlsConnect(...args);};
net.Server.prototype.listen=denied;
dgram.Socket.prototype.send=denied;
dgram.Socket.prototype.bind=denied;
const fetchOriginal=globalThis.fetch;
globalThis.fetch=function(input,init){const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!permitted(url.hostname,url.port||443)||url.protocol!=='https:')denied();return fetchOriginal(input,{...init,redirect:'error'});};
