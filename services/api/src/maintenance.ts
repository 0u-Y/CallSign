import { enterBackupWrite } from './backup-drain.js';
import postgres from 'postgres';
import {hashCanonical} from '@callsign/protocol';
import type { InstitutionRecord } from './finals-model.js';
import { pruneServiceState } from './retention.js';
export function serviceMaintenance(databaseUrl:string,institutionId:string,retentionSeconds=604800){
 if(!Number.isSafeInteger(retentionSeconds)||retentionSeconds<=0)throw new Error('RETENTION_SECONDS_INVALID');
 const sql=postgres(databaseUrl,{max:1,prepare:false,connect_timeout:3,connection:{statement_timeout:5000,lock_timeout:2000}});
 return {async tick(){await sql.begin(async tx=>{
   await enterBackupWrite(tx);
   // Lock the institution before deleting aggregate material; running API transactions share this boundary.
   const rows=await tx`SELECT state FROM issuer_v2.institutions WHERE id=${institutionId} FOR UPDATE`;if(!rows[0])throw new Error('INSTITUTION_NOT_FOUND');
   const record=rows[0].state as InstitutionRecord;
   for(const [id,p] of Object.entries(record.configurationProposals??{}))if(['confirmed','failed'].includes(p.status)&&Number(p.request.deadline)<Date.now()/1000-retentionSeconds&&(p.status==='failed'||record.policy.version>=p.contents.policy.version)){
    await tx`INSERT INTO issuer_v2.configuration_history(id,institution_id,proposal) VALUES(${id},${institutionId},${tx.json(p as unknown as postgres.JSONValue)}) ON CONFLICT DO NOTHING`;delete record.configurationProposals![id];
   }
   pruneServiceState(record,Math.floor(Date.now()/1000),retentionSeconds);
   await tx`UPDATE issuer_v2.institutions SET state=${tx.json(record as unknown as postgres.JSONValue)},revision=revision+1 WHERE id=${institutionId}`;
   await tx`DELETE FROM issuer_v2.notifications WHERE institution_id=${institutionId} AND expires_at<now()`;
   // A crash with unknown provider outcome keeps the full reservation charged; never refund unknown usage.
   const reservations=await tx`SELECT * FROM issuer_v2.usage_reservations WHERE institution_id=${institutionId} AND state='reserved' AND expires_at<now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 100`;
   for(const r of reservations){for(const scope of r.quota_keys as Array<{key:string}>)await tx`UPDATE issuer_v2.quota_balances SET used=used+${r.reserved},reserved=reserved-${r.reserved} WHERE key=${scope.key}`;await tx`UPDATE issuer_v2.usage_reservations SET actual=reserved,state='settled' WHERE id=${r.id}`;}
   await tx`DELETE FROM issuer_v2.usage_reservations WHERE institution_id=${institutionId} AND state<>'reserved' AND expires_at<now()-interval '7 days'`;
   await tx`DELETE FROM issuer_v2.quota_balances WHERE expires_at<now()-interval '7 days' AND reserved=0`;
   await tx`DELETE FROM issuer_v2.global_quota WHERE expires_at<now()-interval '7 days'`;
   // Retain the immutable approval ID/binding and a receipt digest after the recovery window, not recipient/session payloads forever.
   const receipts=await tx`SELECT authorization_id,receipt FROM issuer_v2.approval_consumptions WHERE institution_id=${institutionId} AND protocol_version=3 AND consumed_at<to_timestamp(${Math.floor(Date.now()/1000)-retentionSeconds}) AND receipt ? 'payload' ORDER BY consumed_at FOR UPDATE SKIP LOCKED LIMIT 100`;
   for(const row of receipts)await tx`UPDATE issuer_v2.approval_consumptions SET receipt=${tx.json({redacted:true,receiptHash:hashCanonical(row.receipt)})} WHERE institution_id=${institutionId} AND authorization_id=${row.authorization_id}`;
   // Keep transaction hash, signer and nonce records to avoid reallocation and preserve operator evidence.
   await tx`UPDATE issuer_v2.outbox SET payload='{}'::jsonb WHERE institution_id=${institutionId} AND status='done' AND created_at<now()-interval '7 days' AND signed_transaction IS NULL`;
 });},async close(){await sql.end({timeout:3});}};
}
