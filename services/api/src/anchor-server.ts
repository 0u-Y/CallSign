if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure')throw new Error('ANCHOR_EXECUTION_BLOCKED');
import Fastify from 'fastify';
import {readFile,lstat} from 'node:fs/promises';
import { registerAnchorService } from './consumption-anchor.js';
const url=process.env.ANCHOR_DATABASE_URL,token=process.env.ANCHOR_TOKEN;if(!url||!token||token.length<32)throw new Error('INDEPENDENT_ANCHOR_CONFIGURATION_REQUIRED');
const key=process.env.ANCHOR_TLS_KEY_PATH,cert=process.env.ANCHOR_TLS_CERT_PATH;if(!!key!==!!cert)throw new Error('ANCHOR_TLS_PAIR_REQUIRED');
if(key){const info=await lstat(key);if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077))throw new Error('ANCHOR_PROTECTED_TLS_KEY_REQUIRED');}
const app=Fastify({logger:false,bodyLimit:8192,...(key&&cert?{https:{key:await readFile(key),cert:await readFile(cert)}}:{})});registerAnchorService(app,{databaseUrl:url,token});
const stop=()=>void app.close();process.once('SIGTERM',stop);process.once('SIGINT',stop);
const address=await app.listen({host:'127.0.0.1',port:Number(process.env.PORT??4300)});process.stdout.write(JSON.stringify({address})+'\n');
