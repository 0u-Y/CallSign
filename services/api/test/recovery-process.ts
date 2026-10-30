// Integration-only process boundaries; synthetic actor authentication is not an OIDC verification.
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration'||!process.env.CALLSIGN_RECOVERY_ID?.startsWith('callsign_test_')||!process.env.CALLSIGN_RECOVERY_TEST_ROOT)throw new Error('RECOVERY_PROCESS_BLOCKED');
import {readFile} from 'node:fs/promises';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {readSigningKey} from '../src/finals-server.js';
import {postgresAuthorityStore} from '../src/finals-store.js';
import {httpConsumptionAnchor} from '../src/consumption-anchor.js';
import {ServiceAuthority} from '../src/service-authority.js';
import {registerServiceRoutes} from '../src/service-routes.js';
import {postgresWorkerStore,processDurableJob,type WorkerLedger} from '../src/service-worker.js';
import {createDatabase} from '../src/db.js';
import {sessionForRequest} from '../src/auth.js';
const config=JSON.parse(await readFile(process.argv[2]!,'utf8')) as {id:string;deployment:string;anchorUrl:string;key:string;mode:'api'|'claim'|'worker';verify:boolean};
if(!config.id.startsWith('anchor-test:')||!config.deployment.startsWith('test:')||(!['127.0.0.1','localhost'].includes(new URL(process.env.ISSUER_DATABASE_URL!).hostname)||!/^\/callsign_test_/.test(new URL(process.env.ISSUER_DATABASE_URL!).pathname)))throw new Error('OWNED_RECOVERY_CONTEXT_REQUIRED');
const send=(value:unknown)=>process.stdout.write(JSON.stringify(value)+'\n');
if(config.mode==='api'){
 const store=postgresAuthorityStore(process.env.ISSUER_DATABASE_URL!,{anchor:httpConsumptionAnchor({url:config.anchorUrl,token:process.env.ANCHOR_TOKEN!,deployment:config.deployment}),deployment:config.deployment}),key=await readSigningKey(config.key);
 const authority=new ServiceAuthority({store,networkId:'20260914',registryAddress:`0x${'1'.repeat(40)}`,current:async()=> 'current',signingKey:async()=>key,now:()=>1800000000});
 const app=Fastify({logger:false}),auth=createDatabase(process.env.AUTH_DATABASE_URL!);await app.register(cookie);app.setErrorHandler((e,_r,p)=>p.code((e as {statusCode?:number}).statusCode??503).send({code:(e as Error).message}));
 registerServiceRoutes(app,{authority,store,actorFor:async request=>{if(request.headers.authorization!==`Bearer ${process.env.RECOVERY_TEST_ACTOR_TOKEN}`)throw Object.assign(new Error('TEST_ACTOR_AUTH_REQUIRED'),{statusCode:401});const user=request.headers['x-test-actor']??'staff';if(!['staff','agent','recipient'].includes(String(user)))throw new Error('SYNTHETIC_ACTOR_NOT_REGISTERED');return {institutionId:config.id,userId:String(user),role:user==='staff'?'institution':user==='agent'?'gateway':'recipient'};}});
 app.get('/session',async r=>sessionForRequest(auth.db,r));
 if(config.verify)app.addHook('onReady',async()=>{await store.verifyRecovery(config.id);await authority.stopInterruptedCalls(config.id);});
 app.addHook('onClose',async()=>{await auth.client.end({timeout:3});await store.close();});process.once('SIGTERM',()=>void app.close());
 send({address:await app.listen({host:'127.0.0.1',port:0})});
}else{
 const recovery=postgresAuthorityStore(process.env.WORKER_DATABASE_URL!,{anchor:httpConsumptionAnchor({url:config.anchorUrl,token:process.env.ANCHOR_TOKEN!,deployment:config.deployment}),deployment:config.deployment});try{await recovery.verifyRecovery(config.id,false);}finally{await recovery.close();}
 const store=postgresWorkerStore(process.env.WORKER_DATABASE_URL!,async()=>{},config.id),job=await store.claim();if(!job)throw new Error('NO_OWNED_JOB');
 if(config.mode==='claim'){send({job});await new Promise<void>(resolve=>process.once('SIGTERM',resolve));}
 else {let prepared=0;const ledger:WorkerLedger={signer:()=> '0x'+'a'.repeat(40),validate:async()=>{},prepare:async(_j,_r,minimum)=>{prepared++;return {raw:'explicit-ledger-fixture',hash:'fixture-hash',signer:'0x'+'a'.repeat(40),nonce:String(minimum)};},broadcast:async()=>{},receipt:async()=>null};await processDurableJob(store,ledger,job);send({processed:job.id,prepared});}
 await store.close();
}
