import postgres from 'postgres';
import {inspectLedgerNodes} from './ledger-health.js';
import {randomUUID} from 'node:crypto';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requirePermission,type Actor,type AuthorityStore } from './finals-model.js';
export function registerServiceOperations(app:FastifyInstance,o:{databaseUrl:string;store:AuthorityStore;actorFor(r:FastifyRequest,write?:boolean):Promise<Actor>;deploymentId?:string;ledger?:{urls:string[];networkId:string;genesisHash:string}}){
 const sql=postgres(o.databaseUrl,{max:1,prepare:false,connect_timeout:3,connection:{statement_timeout:5000,lock_timeout:2000}});app.addHook('onClose',()=>sql.end({timeout:3}));
 app.get('/v3/management/jobs',async r=>{const actor=await o.actorFor(r),record=await o.store.read(actor.institutionId);requirePermission(record,actor,'institution.recover');const jobs=await sql`SELECT id,kind,status,attempts,last_error,transaction_hash,receipt_block FROM issuer_v2.outbox WHERE institution_id=${actor.institutionId} AND status<>'done' ORDER BY created_at LIMIT 100`;const usage=await sql`SELECT unit,state,sum(reserved) AS reserved,sum(actual) AS actual FROM issuer_v2.usage_reservations WHERE institution_id=${actor.institutionId} GROUP BY unit,state`;return {jobs,usage,measurements:'usage-units-only-no-price-or-sla'};});
 app.get('/v3/management/health',async r=>{const actor=await o.actorFor(r),record=await o.store.read(actor.institutionId);requirePermission(record,actor,'institution.recover');const queue=await sql`SELECT status,count(*) AS count,min(created_at) AS oldest,max(EXTRACT(EPOCH FROM now()-created_at)) AS oldest_seconds FROM issuer_v2.outbox WHERE institution_id=${actor.institutionId} GROUP BY status`,gate=await sql`SELECT status,checked_at FROM issuer_v2.recovery_gate WHERE institution_id=${actor.institutionId}`;const stages=await sql`SELECT stage,last_error,updated_at FROM issuer_v2.worker_status WHERE institution_id=${actor.institutionId}`,cursor=await sql`SELECT deployment_id,block_number,block_hash FROM issuer_v2.event_cursor WHERE deployment_id=${o.deploymentId??""}`;return {resources:{scope:"issuer-process-only",uptimeSeconds:process.uptime(),memoryBytes:process.memoryUsage(),cpuMicroseconds:process.cpuUsage()},workerStages:stages,eventCursor:cursor,checkedAt:Math.floor(Date.now()/1000),institution:record.status,epoch:record.epoch,recoveryGate:gate[0]??{status:'blocked'},queue,ledger:o.ledger?await inspectLedgerNodes({...o.ledger,now:Math.floor(Date.now()/1000)}):[],authority:'operational-observations-not-authority-proof',alerts:queue.filter(row=>row.status==='failed').map(row=>({code:'DURABLE_JOB_REQUIRES_OPERATOR',count:row.count}))};});
 app.post('/v3/management/retry-job',async r=>{const actor=await o.actorFor(r,true),record=await o.store.read(actor.institutionId);requirePermission(record,actor,'institution.recover');const b=z.object({id:z.string().min(1).max(200)}).strict().parse(r.body);
  await sql.begin(async tx=>{
    const records=await tx`SELECT state FROM issuer_v2.institutions WHERE id=${actor.institutionId} FOR UPDATE`;requirePermission(records[0]!.state,actor,'institution.recover');
    const jobs=await tx`SELECT * FROM issuer_v2.outbox WHERE id=${b.id} AND institution_id=${actor.institutionId} FOR UPDATE`,job=jobs[0];
    if(!job||!['pending','processing','failed'].includes(job.status)||job.last_error!=='DEPENDENCY_OR_CONFIRMATION_PENDING')throw Object.assign(new Error('JOB_NOT_RETRYABLE'),{statusCode:409});
    if(job.status==='failed'){
      await tx`UPDATE issuer_v2.outbox SET status='pending',attempts=0,retry_at=now(),claim_token=NULL,lease_until=NULL WHERE id=${b.id}`;
      await tx`INSERT INTO issuer_v2.audit(id,institution_id,event) VALUES(${randomUUID()},${actor.institutionId},${tx.json({event:'job.retry-requested',actor:actor.userId,at:Math.floor(Date.now()/1000),objectId:b.id})})`;
    }
  });
  return {queued:true,transaction:'same-signed-bytes-if-present'};
 });
}
