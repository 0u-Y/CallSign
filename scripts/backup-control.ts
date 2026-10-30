// Owner-only operational fence. No process is started, killed or automatically failed over.
if(!['infrastructure','integration'].includes(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION??''))throw new Error('BACKUP_CONTROL_EXECUTION_BLOCKED');
import postgres from 'postgres';
import {randomUUID} from 'node:crypto';
import {backupLock} from '../services/api/src/backup-drain.js';
const action=process.argv[2]??'status',url=process.env.MIGRATOR_DATABASE_URL;if(!url)throw new Error('MIGRATOR_DATABASE_URL_REQUIRED');
if(!['status','drain','resume','fence','activate'].includes(action))throw new Error('BACKUP_CONTROL_ACTION_INVALID');
const sql=postgres(url,{max:1,prepare:false,connect_timeout:3,connection:{lock_timeout:3000,statement_timeout:5000}});
try{
 if(action==='status')console.log(JSON.stringify((await sql`SELECT phase,token FROM issuer_v2.backup_control WHERE singleton`)[0]));
 else await sql.begin(async tx=>{
  // Drain admission first; already admitted transactions can finish including their external CAS.
  if(action!=='drain')await tx`SELECT pg_advisory_xact_lock(${backupLock})`;
  const current=(await tx`SELECT phase,token FROM issuer_v2.backup_control WHERE singleton FOR UPDATE`)[0];if(!current)throw new Error('BACKUP_CONTROL_NOT_PROVISIONED');
  if(action==='drain'){
   if(current.phase!=='open')throw new Error('BACKUP_DRAIN_ALREADY_ACTIVE');
   const token=randomUUID();await tx`UPDATE issuer_v2.backup_control SET phase='draining',token=${token},updated_at=now() WHERE singleton`;console.log(JSON.stringify({phase:'draining',token,ready:false}));return;
  }
  if(current.token!==process.env.BACKUP_DRAIN_TOKEN)throw new Error('BACKUP_DRAIN_TOKEN_MISMATCH');
  if(action==='resume'&&current.phase!=='draining')throw new Error('FENCED_SOURCE_CANNOT_RESUME');
  if(action==='fence'){if(current.phase!=='draining')throw new Error('DRAIN_SOURCE_FIRST');if((await tx`SELECT id FROM issuer_v2.outbox WHERE status='processing' LIMIT 1`).length)throw new Error('QUIESCE_WORKER_BEFORE_FENCING');if((await tx`SELECT id FROM issuer_v2.institutions WHERE EXISTS(SELECT 1 FROM jsonb_each(state->'serviceV3'->'attempts') a WHERE a.value->>'status' NOT IN ('ended','declined','cancelled','failed','no-answer')) LIMIT 1`).length)throw new Error('END_ACTIVE_CALLS_BEFORE_FENCING');}
  if(action==='activate'){
   if(current.phase!=='fenced'||process.env.SOURCE_FENCE_CONFIRMATION!=='SOURCE-WRITERS-STOPPED-AND-FENCED')throw new Error('EXPLICIT_SOURCE_FENCE_CONFIRMATION_REQUIRED');
   if((await tx`SELECT institution_id FROM issuer_v2.recovery_gate WHERE status<>'ready' LIMIT 1`).length)throw new Error('VERIFY_TARGET_RECOVERY_FIRST');
  }
  const phase=action==='fence'?'fenced':'open';await tx`UPDATE issuer_v2.backup_control SET phase=${phase},updated_at=now() WHERE singleton`;console.log(JSON.stringify({phase}));
 });
}finally{await sql.end({timeout:3});}
