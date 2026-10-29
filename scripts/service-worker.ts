// Explicit infrastructure entrypoint. Importable logic lives in services/api/src without starting services.
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure')throw new Error('WORKER_EXECUTION_BLOCKED');
import { serviceMaintenance } from '../services/api/src/maintenance.js';
import { readFile } from 'node:fs/promises';
import { keccak256,stringToHex,type Hex } from 'viem';
import { postgresWorkerStore,processWorkerCycle } from '../services/api/src/service-worker.js';
import { workerLedger } from '../services/api/src/worker-ledger.js';
import { ledgerEventConsumer } from '../services/api/src/ledger-events.js';
import { AriClient } from '../services/api/src/asterisk.js';
import { pbxCleanupStore } from '../services/api/src/pbx-routes.js';
const required=(key:string)=>{const v=process.env[key];if(!v)throw new Error(`MISSING_${key}`);return v;};
const privateKey=async(name:string)=>(await readFile(required(name),'utf8')).trim() as Hex;
const deployment=JSON.parse(await readFile(required('DEPLOYMENT_PATH'),'utf8'));
if(deployment.registryProfile!=='CALLSIGN_SERVICE_JOINT_CONFIGURATION_1')throw new Error('SERVICE_REGISTRY_TRUST_TRANSITION_REQUIRED');
if(!/^0x[0-9a-f]{64}$/.test(deployment.registryCodeHash)||!/^\d+$/.test(String(deployment.deploymentBlock)))throw new Error('DEPLOYMENT_CODE_HASH_AND_BLOCK_REQUIRED');
const ledger=workerLedger({networkId:Number(deployment.networkId),genesisHash:deployment.genesisHash,registry:deployment.registryAddress,codeHash:deployment.registryCodeHash,rpcUrls:required('BESU_NODE_URLS').split(','),administratorKey:await privateKey('REGISTRY_ADMIN_KEY_PATH'),stopperKey:await privateKey('REGISTRY_OPERATOR_KEY_PATH'),approvers:required('REGISTRY_APPROVERS').split(',')});
const ari=new AriClient({base:new URL(required('ARI_URL')),authorization:required('ARI_AUTHORIZATION'),application:'callsign'});
const endpoints=pbxCleanupStore(required('WORKER_DATABASE_URL'));
const store=postgresWorkerStore(required('WORKER_DATABASE_URL'),async job=>{const record=await store.record(job.institution_id),attempt=record.serviceV3?.attempts[job.object_id];if(!attempt?.pbx)return;if(!['ended','cancelled','declined','failed','no-answer'].includes(attempt.status))throw new Error('CLEANUP_REQUIRES_TERMINAL');await ari.destroy(attempt);await endpoints.remove(attempt.id);},required('INSTITUTION_ID'));
const consumer=ledgerEventConsumer({databaseUrl:required('WORKER_DATABASE_URL'),client:ledger.publicClient,registry:deployment.registryAddress,deploymentId:keccak256(stringToHex(`${deployment.genesisHash}:${deployment.registryAddress}`)),institutionId:required('INSTITUTION_ID'),deploymentBlock:BigInt(deployment.deploymentBlock)});
const maintenance=serviceMaintenance(required('WORKER_DATABASE_URL'),required('INSTITUTION_ID'),Number(process.env.RETENTION_SECONDS??604800));let nextMaintenance=0;
let closed=false;const stop=()=>{closed=true;};process.once('SIGTERM',stop);process.once('SIGINT',stop);
try{while(!closed){await processWorkerCycle(store,ledger,{events:()=>consumer.tick(),maintenance:async()=>{if(Date.now()>=nextMaintenance){await maintenance.tick();nextMaintenance=Date.now()+60000;}},report:stage=>process.stderr.write(`Worker ${stage} dependency unavailable; durable state retained.\n`)});if(!closed)await new Promise(r=>setTimeout(r,1000));}}finally{await maintenance.close();await consumer.close();await endpoints.close();await store.close();}
