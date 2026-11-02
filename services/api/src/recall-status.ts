import type {Actor,InstitutionRecord} from './finals-model.js';
import {requirePermission} from './finals-model.js';
import {terminal} from './service-state.js';
export interface RecallJob {id:string;kind:string;objectId:string;status:string;attempts:number;error:string|null;receiptBlock:string|null}
export function recallSnapshot(record:InstitutionRecord,actor:Actor,now:number,intentId?:string,observations?:{jobs:RecallJob[];audit:InstitutionRecord["audit"]}){
 requirePermission(record,actor,'contact.manage');
 const intents=Object.values(record.intents).filter(i=>i.institutionId===actor.institutionId&&(!intentId||i.id===intentId));
 const ids=new Set(intents.map(i=>i.id));
 const all=Object.values(record.serviceV3?.attempts??{}).filter(t=>ids.has(t.intentId)).sort((a,b)=>b.firstConnectBy-a.firstConnectBy||a.id.localeCompare(b.id));
 const attempts=all.slice(0,100).map(t=>{
  const job=observations?.jobs.find(j=>j.kind==='call.cleanup'&&j.objectId===t.id);
  const auth=record.serviceV3?.authorizations[t.authorizationId??''],vc=auth&&record.serviceV3?.credentials[auth.payload.vcDigest];
  return {id:t.id,intentId:t.intentId,serviceUri:record.intents[t.intentId]!.serviceDid,delegationDigest:auth?.payload.vcDigest??null,delegationState:vc?.state??'unknown',status:t.status,reason:t.reason??null,endedAt:t.endedAt??null,serverAuthority:terminal(t.status)?'terminal-applied':auth?.cancelled?'authorization-cancelled':'not-recalled',media:!t.pbx?'no-pbx-session':t.cleanup?.status??'unobserved',mediaObservation:t.cleanup??null,cleanupJob:job?{status:job.status,attempts:job.attempts,error:job.error}:null,audioInterruption:'not-observed' as const};
 });
 return {checkedAt:now,source:'institution-database-snapshot' as const,consistentRead:!!observations,freshForSeconds:10,institutionStatus:record.status,epoch:record.epoch,observedEpoch:record.observedEpoch??null,ledgerObservation:record.ledgerObservation??null,
  changes:(observations?.audit??record.audit).filter(e=>['intent.cancelled','credential.revoke','institution.suspend','institution.configure','key.activated'].includes(e.event)).slice(-50).map(e=>{const job=observations?.jobs.find(j=>j.id===e.id);return {id:e.id,kind:e.event,objectId:e.objectId,requestedAt:e.at,ledger:e.event==='intent.cancelled'||e.event==='key.activated'?'not-required':job?.status==='done'&&job.receiptBlock?'confirmed':job?.status==='failed'?'failed':job?'pending':'unobserved',job:job?{status:job.status,attempts:job.attempts,error:job.error,receiptBlock:job.receiptBlock}:null};}),
  configurations:Object.values(record.configurationProposals??{}).slice(-20).map(p=>({id:p.id,status:p.status,block:p.block??null,transactionHash:p.transactionHash??null,activatedAt:p.activatedAt??null})),
  intents:intents.slice(0,100).map(i=>({id:i.id,status:i.status,serviceUri:i.serviceDid,attemptsPresent:all.some(t=>t.intentId===i.id)})),attempts,truncated:all.length>100||intents.length>100};
}
export type RecallSnapshot=ReturnType<typeof recallSnapshot>;
