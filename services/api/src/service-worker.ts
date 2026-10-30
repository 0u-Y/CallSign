import { notificationRecipients } from './notifications.js';
import { measurements } from './telemetry.js';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { hashCanonical } from '@callsign/protocol';
import type { InstitutionRecord } from './finals-model.js';
export interface DurableJob {id:string;institution_id:string;kind:string;object_id:string;payload:unknown;attempts:number;claim_token:string;transaction_hash:string|null;signed_transaction:string|null;signer_address:string|null;transaction_nonce:string|null}
export interface SignedTransaction {raw:string;hash:string;signer:string;nonce:string}
export interface WorkerLedger {
 signer(job:DurableJob):string;
 validate(transaction:SignedTransaction,job:DurableJob):Promise<void>;
 prepare(job:DurableJob,record:InstitutionRecord,minimumNonce:bigint):Promise<SignedTransaction>;
 broadcast(transaction:SignedTransaction):Promise<void>;
 receipt(hash:string):Promise<{block:string;success:boolean}|null>;
}
export interface WorkerStore {
 claim():Promise<DurableJob|null>; record(id:string):Promise<InstitutionRecord>;
 persist(job:DurableJob,signer:string,prepare:(minimumNonce:bigint)=>Promise<SignedTransaction>):Promise<SignedTransaction>;
 renew(job:DurableJob):Promise<boolean>;complete(job:DurableJob,block?:string):Promise<void>;retry(job:DurableJob,code:string,permanent?:boolean,receiptBlock?:string):Promise<void>;
 cleanup(job:DurableJob):Promise<void>;
 recordStage?(stage:"events"|"maintenance"|"job",code?:string):Promise<void>;
}
export class PermanentJobError extends Error {constructor(message:string,readonly receiptBlock?:string){super(message);}}
const auditOnlyEvents=new Set(['intent.cancelled','configuration.proposed','configuration.approved','configuration.activated','member.registered','intent.created','attempt.created','authorization.issued','authorization.consumed','call.lease','official.completed','analysis.consented','analysis.withdrawn','key.activated','member.updated','intent.reassigned','attempt.ended','attempt.declined','attempt.no-answer','attempt.failed','attempt.cancelled']);
// The exact signed transaction is committed before any broadcast. A retry never allocates a new nonce.
export async function processDurableJob(store:WorkerStore,ledger:WorkerLedger,job:DurableJob){
  const started=performance.now();let outcome:'success'|'retry'|'failure'='success';
  try{
    if(job.kind==='call.cleanup'){await store.cleanup(job);await store.complete(job);return;}
    if(auditOnlyEvents.has(job.kind)){await store.complete(job);return;}
    if(!['institution.configure','credential.register','credential.revoke','institution.suspend','institution.recover','institution.register'].includes(job.kind))throw new PermanentJobError('UNSUPPORTED_JOB_KIND');
    const stored=[job.signed_transaction,job.transaction_hash,job.signer_address,job.transaction_nonce].filter(value=>value!==null);
    if(stored.length!==0&&(stored.length!==4||stored.some(value=>value==='')))throw new PermanentJobError('INCOMPLETE_STORED_TRANSACTION');
    let transaction:SignedTransaction;
    if(job.signed_transaction&&job.transaction_hash&&job.signer_address&&job.transaction_nonce!==null)transaction={raw:job.signed_transaction,hash:job.transaction_hash,signer:job.signer_address,nonce:job.transaction_nonce};
    else transaction=await store.persist(job,ledger.signer(job),minimum=>store.record(job.institution_id).then(record=>ledger.prepare(job,record,minimum)));
    await ledger.validate(transaction,job);
    if(!await store.renew(job))throw new Error('CLAIM_LOST');
    let receipt=await ledger.receipt(transaction.hash);
    if(!receipt){await ledger.broadcast(transaction);receipt=await ledger.receipt(transaction.hash);}
    if(!receipt)throw new Error('TRANSACTION_CONFIRMATION_PENDING');
    if(!receipt.success)throw new PermanentJobError('TRANSACTION_REVERTED',receipt.block);
    await store.complete(job,receipt.block);
  }catch(error){outcome=error instanceof PermanentJobError?'failure':'retry';if(error instanceof PermanentJobError&&error.receiptBlock)await store.retry(job,error.message,true,error.receiptBlock);else await store.retry(job,error instanceof PermanentJobError?error.message:'DEPENDENCY_OR_CONFIRMATION_PENDING',error instanceof PermanentJobError);}
  finally{measurements.observe('worker',outcome,performance.now()-started);}
}
// Maintenance and cleanup remain eligible when the chain event source is unavailable.
export async function processWorkerCycle(store:WorkerStore,ledger:WorkerLedger,tasks:{events():Promise<void>;maintenance():Promise<void>;report(stage:string):void}){
  const status=async(stage:'events'|'maintenance'|'job',error?:unknown)=>{const code=error instanceof Error&&/^[A-Z][A-Z0-9_]{3,99}$/.test(error.message)?error.message:error?'DEPENDENCY_UNAVAILABLE':undefined;try{await store.recordStage?.(stage,code);}catch{tasks.report('status');}};
  for(const [stage,run] of [['events',tasks.events],['maintenance',tasks.maintenance]] as const){try{await run();await status(stage);}catch(error){tasks.report(stage);await status(stage,error);}}
  try{const job=await store.claim();if(job)await processDurableJob(store,ledger,job);await status('job');}catch(error){tasks.report('job');await status('job',error);}

}
export function postgresWorkerStore(url:string,cleanup:(job:DurableJob)=>Promise<void>,institutionId?:string):WorkerStore&{close():Promise<void>}{
  const sql=postgres(url,{max:2,prepare:false,connect_timeout:3,connection:{statement_timeout:5000,lock_timeout:2000}});
  const owned=(j:DurableJob)=>sql`SELECT id FROM issuer_v2.outbox WHERE id=${j.id} AND claim_token=${j.claim_token} AND status='processing' AND lease_until>now()`;
  return {
    async claim(){const token=randomUUID();const rows=await sql`WITH candidate AS (SELECT id FROM issuer_v2.outbox WHERE (${institutionId===undefined} OR institution_id=${institutionId??''}) AND (kind='call.cleanup' OR EXISTS(SELECT 1 FROM issuer_v2.recovery_gate g WHERE g.institution_id=issuer_v2.outbox.institution_id AND g.status='ready')) AND ((status='pending' AND retry_at<=now()) OR (status='processing' AND lease_until<now())) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE issuer_v2.outbox o SET status='processing',claim_token=${token},lease_until=now()+interval '45 seconds',attempts=attempts+1 FROM candidate c WHERE o.id=c.id RETURNING o.*`;return rows[0] as DurableJob??null;},
    async record(id){if(institutionId!==undefined&&id!==institutionId)throw new PermanentJobError('WORKER_INSTITUTION_SCOPE_MISMATCH');const rows=await sql`SELECT state FROM issuer_v2.institutions WHERE id=${id}`;if(!rows[0])throw new PermanentJobError('INSTITUTION_NOT_FOUND');return rows[0].state as InstitutionRecord;},
    async renew(j){return (await sql`UPDATE issuer_v2.outbox SET lease_until=now()+interval '45 seconds' WHERE id=${j.id} AND claim_token=${j.claim_token} AND lease_until>now() AND status='processing' AND (kind='call.cleanup' OR EXISTS(SELECT 1 FROM issuer_v2.recovery_gate g WHERE g.institution_id=issuer_v2.outbox.institution_id AND g.status='ready')) RETURNING id`).length===1;},
    async persist(j,signer,prepare){
      const owner=randomUUID(),address=signer.toLowerCase();
      // A bounded per-signer lease serializes nonce preparation without holding a DB transaction over RPC.
      const acquired=await sql`INSERT INTO issuer_v2.signer_leases(signer,owner,expires_at) VALUES(${address},${owner},now()+interval '40 seconds') ON CONFLICT(signer) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at WHERE issuer_v2.signer_leases.expires_at<now() RETURNING signer`;
      if(!acquired.length)throw new Error('SIGNER_PREPARATION_BUSY');
      try{
        const rows=await sql`SELECT * FROM issuer_v2.outbox WHERE id=${j.id} AND claim_token=${j.claim_token} AND lease_until>now() AND status='processing' AND EXISTS(SELECT 1 FROM issuer_v2.recovery_gate g WHERE g.institution_id=issuer_v2.outbox.institution_id AND g.status='ready')`;if(!rows[0])throw new Error('CLAIM_LOST');
        const existing=rows[0];if(existing.signed_transaction)return {raw:existing.signed_transaction,hash:existing.transaction_hash,signer:existing.signer_address,nonce:String(existing.transaction_nonce)} as SignedTransaction;
        const unresolved=await sql`SELECT id FROM issuer_v2.outbox WHERE signer_address=${address} AND status='failed' AND signed_transaction IS NOT NULL AND receipt_block IS NULL LIMIT 1`;if(unresolved.length)throw new Error('SIGNER_REQUIRES_RECONCILIATION');
        const maximum=await sql`SELECT max(transaction_nonce) AS nonce FROM issuer_v2.outbox WHERE signer_address=${address}`;
        const minimum=maximum[0]?.nonce===null?0n:BigInt(maximum[0]!.nonce)+1n,signed=await prepare(minimum);
        if(signed.signer.toLowerCase()!==address||!/^\d+$/.test(signed.nonce)||BigInt(signed.nonce)<minimum)throw new PermanentJobError('PREPARED_SIGNER_OR_NONCE_MISMATCH');
        await sql.begin(async tx=>{
          const fence=await tx`SELECT signer FROM issuer_v2.signer_leases WHERE signer=${address} AND owner=${owner} AND expires_at>now() FOR UPDATE`;if(!fence.length)throw new Error('SIGNER_LEASE_LOST');
          const persisted=await tx`UPDATE issuer_v2.outbox SET signed_transaction=${signed.raw},transaction_hash=${signed.hash},signer_address=${address},transaction_nonce=${signed.nonce} WHERE id=${j.id} AND claim_token=${j.claim_token} AND lease_until>now() AND status='processing' AND signed_transaction IS NULL AND EXISTS(SELECT 1 FROM issuer_v2.recovery_gate g WHERE g.institution_id=issuer_v2.outbox.institution_id AND g.status='ready') RETURNING id`;if(!persisted.length)throw new Error('CLAIM_LOST');
        });return signed;
      }finally{await sql`DELETE FROM issuer_v2.signer_leases WHERE signer=${address} AND owner=${owner}`;}
    },
    async complete(j,block){await sql.begin(async tx=>{await tx`SELECT id FROM issuer_v2.institutions WHERE id=${j.institution_id} FOR UPDATE`;const rows=await tx`SELECT * FROM issuer_v2.outbox WHERE id=${j.id} AND claim_token=${j.claim_token} AND status='processing' AND lease_until>now() AND (kind='call.cleanup' OR EXISTS(SELECT 1 FROM issuer_v2.recovery_gate g WHERE g.institution_id=issuer_v2.outbox.institution_id AND g.status='ready')) FOR UPDATE`;if(!rows[0])throw new Error('CLAIM_LOST');
      if(j.kind==='institution.register')await tx`UPDATE issuer_v2.institutions SET state=jsonb_set(state,'{registrationState}','"confirmed"'::jsonb),revision=revision+1 WHERE id=${j.institution_id} AND state->>'registrationOperation'=${j.object_id}`;
      if(j.kind==='call.cleanup'){
        const records=await tx`SELECT state FROM issuer_v2.institutions WHERE id=${j.institution_id} FOR UPDATE`,record=records[0]?.state as InstitutionRecord;
        const t=record?.serviceV3?.attempts[j.object_id];if(t&&['ended','cancelled','declined','failed','no-answer'].includes(t.status)){const code=`attempt.${t.status}`;for(const userId of notificationRecipients(record,{kind:code,objectId:t.id}))await tx`INSERT INTO issuer_v2.notifications(id,institution_id,user_id,code) VALUES(${`terminal:${t.id}:${code}`},${record.id},${userId},${code}) ON CONFLICT DO NOTHING`;}if(t?.pbx&&['ended','cancelled','declined','failed','no-answer'].includes(t.status)){t.pbx.state='ended';t.pbx.credentials={};t.pbx.reports={};delete t.pbx.evidence;await tx`UPDATE issuer_v2.institutions SET state=${tx.json(record as unknown as postgres.JSONValue)},revision=revision+1 WHERE id=${j.institution_id}`;}
      }
      if(j.kind==='credential.register'||j.kind==='credential.revoke'){
        const records=await tx`SELECT state FROM issuer_v2.institutions WHERE id=${j.institution_id} FOR UPDATE`;const record=records[0]?.state as InstitutionRecord;const c=record.serviceV3?.credentials[j.object_id];if(c){if(j.kind==='credential.revoke')c.state='revoked';else if(c.state==='pending')c.state='registered';await tx`UPDATE issuer_v2.institutions SET state=${tx.json(record as unknown as postgres.JSONValue)},revision=revision+1 WHERE id=${j.institution_id}`;}
      }
      await tx`UPDATE issuer_v2.outbox SET status='done',lease_until=NULL,claim_token=NULL,receipt_block=${block??null},last_error=NULL WHERE id=${j.id}`;
    });},
    async retry(j,code,permanent=false,receiptBlock){
      const failed=permanent||j.attempts>=12,delay=Math.min(300,2**Math.min(j.attempts,8));
      await sql.begin(async tx=>{
        await tx`SELECT id FROM issuer_v2.institutions WHERE id=${j.institution_id} FOR UPDATE`;
        const rows=await tx`UPDATE issuer_v2.outbox SET status=${failed?'failed':'pending'},retry_at=now()+${delay}*interval '1 second',lease_until=NULL,claim_token=NULL,last_error=${code.slice(0,100)},receipt_block=COALESCE(${receiptBlock??null},receipt_block) WHERE id=${j.id} AND claim_token=${j.claim_token} AND status='processing' AND lease_until>now() RETURNING signed_transaction`;
        if(rows.length&&failed)await tx`INSERT INTO issuer_v2.notifications(id,institution_id,user_id,code) SELECT ${`worker:${j.id}:${j.attempts}`},${j.institution_id},m.key,'worker.requires-operator' FROM issuer_v2.institutions i CROSS JOIN LATERAL jsonb_each(i.state->'members') m WHERE i.id=${j.institution_id} AND m.value->'permissions' ? 'institution.recover' ON CONFLICT DO NOTHING`;
        if(rows.length&&failed&&j.kind==='institution.configure'&&(!rows[0]!.signed_transaction||receiptBlock))await tx`UPDATE issuer_v2.institutions SET state=jsonb_set(jsonb_set(state,ARRAY['configurationProposals',${j.object_id},'status'],'"failed"'::jsonb),ARRAY['configurationProposals',${j.object_id},'failure'],to_jsonb(${code}::text)),revision=revision+1 WHERE id=${j.institution_id}`;
        if(rows.length&&failed&&j.kind==='institution.register'&&(!rows[0]!.signed_transaction||receiptBlock))await tx`UPDATE issuer_v2.institutions SET state=jsonb_set(state,'{registrationState}','"failed"'::jsonb),revision=revision+1 WHERE id=${j.institution_id} AND state->>'registrationOperation'=${j.object_id}`;
      });
    },
    async recordStage(stage,code){if(!institutionId)throw new Error('WORKER_INSTITUTION_SCOPE_REQUIRED');await sql`INSERT INTO issuer_v2.worker_status(institution_id,stage,last_error) VALUES(${institutionId},${stage},${code??null}) ON CONFLICT(institution_id,stage) DO UPDATE SET last_error=EXCLUDED.last_error,updated_at=now()`;},
    async cleanup(j){if(!(await owned(j)).length)throw new Error('CLAIM_LOST');await cleanup(j);},
    async close(){await sql.end({timeout:5});}
  };
}
export function journalEntry(institutionId:string,authorizationId:string,bindingHash:string,previousHash:string){return hashCanonical({institutionId,authorizationId,bindingHash,previousHash});}

export interface JournalCursor {sequence:string;hash:string;epoch:string;authorityHash?:string}
export interface JournalRow {sequence:string;authorization_id:string;binding_hash:string;entry_hash:string;previous_hash:string}
export function advanceJournalCursor(institutionId:string,prior:JournalCursor,row:JournalRow):JournalCursor{
 if(!/^\d+$/.test(row.sequence)||BigInt(row.sequence)!==BigInt(prior.sequence)+1n||row.previous_hash!==prior.hash||journalEntry(institutionId,row.authorization_id,row.binding_hash,prior.hash)!==row.entry_hash)throw new Error('CONSUMPTION_HISTORY_RECOVERY_REQUIRED');
 let epoch=prior.epoch;if(row.authorization_id.startsWith('key-generation:')){epoch=row.authorization_id.slice(15);if(!/^\d+$/.test(epoch)||BigInt(epoch)<=BigInt(prior.epoch))throw new Error('CONSUMPTION_HISTORY_RECOVERY_REQUIRED');}
 let authorityHash=prior.authorityHash;if(row.authorization_id.startsWith('authority-state:')){const parts=row.authorization_id.split(':');if(!/^\d+$/.test(parts[1]??'')||parts.length!==3||BigInt(parts[1]!)<BigInt(prior.epoch))throw new Error('CONSUMPTION_HISTORY_RECOVERY_REQUIRED');epoch=parts[1]!;authorityHash=row.binding_hash;}
 return {sequence:String(row.sequence),hash:row.entry_hash,epoch,...(authorityHash?{authorityHash}:{})};
}
