import postgres from 'postgres';
import { decodeEventLog,keccak256,parseAbi,stringToHex,type Hex } from 'viem';
import type { InstitutionRecord } from './finals-model.js';
import type { workerLedger } from './worker-ledger.js';
import { serviceRegistryAbi } from './worker-ledger.js';
import { configurationForEvent } from './configuration.js';
import { invalidateInstitution } from './service-management.js';
const events=parseAbi([
 'event InstitutionSuspended(bytes32 indexed institutionId,uint64 epoch)',
 'event InstitutionRecovered(bytes32 indexed institutionId,uint64 epoch,address administrator)',
 'event DelegationRevoked(bytes32 indexed delegationId,bytes32 indexed institutionId,uint64 epoch)',
 'event ConfigurationUpdated(bytes32 indexed institutionId,uint64 epoch,bytes32 directoryHash,uint64 directoryVersion,uint64 policyVersion,bytes32 policyHash,bool invalidated,bytes32 nonce)',
]);
export function ledgerEventConsumer(options:{databaseUrl:string;client:ReturnType<typeof workerLedger>['publicClient'];registry:Hex;deploymentId:string;institutionId:string;deploymentBlock:bigint}){
 const sql=postgres(options.databaseUrl,{max:1,prepare:false,connect_timeout:3,connection:{statement_timeout:5000,lock_timeout:2000}});
 return {async tick(){
  const cursor=await sql`SELECT * FROM issuer_v2.event_cursor WHERE deployment_id=${options.deploymentId}`;
  if(cursor[0]){const previous=await options.client.getBlock({blockNumber:BigInt(cursor[0].block_number)});if(previous.hash!==cursor[0].block_hash){await sql`UPDATE issuer_v2.recovery_gate SET status='blocked' WHERE institution_id=${options.institutionId}`;throw new Error('LEDGER_CURSOR_ROLLBACK_OR_CONFLICT');}}
  const from=cursor[0]?BigInt(cursor[0].block_number)+1n:options.deploymentBlock,head=await options.client.getBlockNumber();if(from>head)return;
  const to=from+49n<head?from+49n:head;
  const logs=await options.client.getLogs({address:options.registry,fromBlock:from,toBlock:to});if(logs.length>10000)throw new Error('LEDGER_EVENT_BATCH_TOO_LARGE');
  const block=await options.client.getBlock({blockNumber:to});if(!block.hash)throw new Error('LEDGER_BLOCK_MISSING');
  // Observe the current state before acquiring database locks. Submission/receipt alone is not activation.
  const configurationLogs=logs.filter(log=>{try{return decodeEventLog({abi:events,data:log.data,topics:log.topics}).eventName==='ConfigurationUpdated';}catch{return false;}});
  const configurationState=configurationLogs.length?await options.client.readContract({address:options.registry,abi:serviceRegistryAbi,functionName:'institutions',args:[keccak256(stringToHex(options.institutionId))],blockNumber:to}):undefined;
  const currentPolicyHash=configurationLogs.length?await options.client.readContract({address:options.registry,abi:serviceRegistryAbi,functionName:'policyHashes',args:[keccak256(stringToHex(options.institutionId))],blockNumber:to}):undefined;
  await sql.begin(async tx=>{
   await tx`SELECT pg_advisory_xact_lock(1129534287)`;const current=await tx`SELECT * FROM issuer_v2.event_cursor WHERE deployment_id=${options.deploymentId} FOR UPDATE`;
   if(String(current[0]?.block_number??'')!==String(cursor[0]?.block_number??''))return;
   const rows=await tx`SELECT state FROM issuer_v2.institutions WHERE id=${options.institutionId} FOR UPDATE`;const record=rows[0]?.state as InstitutionRecord;if(!record)throw new Error('INSTITUTION_NOT_FOUND');
   for(const log of logs){if(!log.transactionHash||log.logIndex===null||log.blockNumber===null||!log.blockHash)throw new Error('UNCONFIRMED_EVENT');
    let decoded;try{decoded=decodeEventLog({abi:events,data:log.data,topics:log.topics});}catch{continue;}
    if(decoded.args.institutionId!==keccak256(stringToHex(options.institutionId)))continue;
    const inserted=await tx`INSERT INTO issuer_v2.processed_chain_events VALUES(${options.deploymentId},${log.transactionHash},${log.logIndex},${String(log.blockNumber)},${log.blockHash}) ON CONFLICT DO NOTHING RETURNING log_index`;if(!inserted.length)continue;
    const s=record.serviceV3;if(!s)continue;
    if(decoded.eventName==='ConfigurationUpdated'){
      const e=decoded.args,p=configurationForEvent(record,{...e,epoch:String(e.epoch),directoryVersion:String(e.directoryVersion),policyVersion:String(e.policyVersion)});
      if(!configurationState||configurationState[5]!==e.directoryHash||String(configurationState[6])!==String(e.directoryVersion)||String(configurationState[7])!==String(e.policyVersion)||String(configurationState[1])!==String(e.epoch)||currentPolicyHash!==e.policyHash)throw new Error('CONFIGURATION_EVENT_RECONCILIATION_REQUIRED');
      p.status='confirmed';p.transactionHash=log.transactionHash;p.block=String(log.blockNumber);
      if(e.invalidated){record.observedEpoch=String(e.epoch);record.status='suspended';invalidateInstitution(record,Math.floor(Date.now()/1000));}
      else record.directory={hash:e.directoryHash,version:Number(e.directoryVersion),entries:p.contents.directory};
    }else if(decoded.eventName==='DelegationRevoked'){
      for(const [digest,c] of Object.entries(s.credentials))if(keccak256(stringToHex(digest))===decoded.args.delegationId)c.state='revoked';
    }else{
      // Recovery never silently activates a local old key. Explicit key activation verifies fresh quorum evidence.
      record.observedEpoch=String(decoded.args.epoch);record.status='suspended';for(const c of Object.values(s.credentials))c.state='revoked';
    }
    for(const t of Object.values(s.attempts)){
      const a=s.authorizations[t.authorizationId??''];if(a&&(record.status!=='active'||s.credentials[a.payload.vcDigest]?.state==='revoked')){a.cancelled=true;if(!['ended','cancelled','declined','failed','no-answer'].includes(t.status)){t.status='cancelled';t.reason='ledger-revocation';t.endedAt=Math.floor(Date.now()/1000);t.revision++;if(t.consent){t.consent.granted=false;t.consent.generation++;}}}
    }
   }
   for(const t of Object.values(record.serviceV3?.attempts??{}))if(t.pbx&&['ended','cancelled','declined','failed','no-answer'].includes(t.status))await tx`INSERT INTO issuer_v2.outbox(id,institution_id,kind,object_id,payload) VALUES(${`ledger-cleanup:${t.id}`},${record.id},'call.cleanup',${t.id},'{}'::jsonb) ON CONFLICT(id) DO NOTHING`;
   await tx`UPDATE issuer_v2.institutions SET state=${tx.json(record as unknown as postgres.JSONValue)},revision=revision+1 WHERE id=${record.id}`;
   await tx`INSERT INTO issuer_v2.event_cursor(deployment_id,block_number,block_hash) VALUES(${options.deploymentId},${String(to)},${block.hash}) ON CONFLICT(deployment_id) DO UPDATE SET block_number=EXCLUDED.block_number,block_hash=EXCLUDED.block_hash`;
  });
 },async close(){await sql.end({timeout:3});}};
}
