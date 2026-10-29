if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure')throw new Error('ANCHOR_EXECUTION_BLOCKED');
import Fastify from 'fastify';
import { registerAnchorService } from './consumption-anchor.js';
const url=process.env.ANCHOR_DATABASE_URL,token=process.env.ANCHOR_TOKEN;if(!url||!token||token.length<32)throw new Error('INDEPENDENT_ANCHOR_CONFIGURATION_REQUIRED');
const app=Fastify({logger:false,bodyLimit:8192});registerAnchorService(app,{databaseUrl:url,token});
const stop=()=>void app.close();process.once('SIGTERM',stop);process.once('SIGINT',stop);
await app.listen({host:'127.0.0.1',port:Number(process.env.PORT??4300)});
