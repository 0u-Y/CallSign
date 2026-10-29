import type { InstitutionRecord } from './finals-model.js';
import { terminal } from './service-state.js';
// Receipts and hashes remain in the SQL consumption namespace/journal; delete per-call personal material only.
export function pruneServiceState(record:InstitutionRecord,now:number,retentionSeconds:number){
 if(!Number.isSafeInteger(retentionSeconds)||retentionSeconds<86400)throw new Error('RETENTION_POLICY_INVALID');
 const s=record.serviceV3;if(!s)return 0;let removed=0;
 for(const [id,t] of Object.entries(s.attempts))if(terminal(t.status)&&t.endedAt!==undefined&&t.endedAt<now-retentionSeconds&&(!t.pbx||t.pbx.state==='ended')){
  if(t.authorizationId){delete s.authorizations[t.authorizationId];delete s.consumptions[t.authorizationId];}
  for(const [challengeId,c] of Object.entries(s.challenges))if(c.payload.attemptId===id)delete s.challenges[challengeId];
  delete s.attempts[id];removed++;
 }
 for(const [id,p] of Object.entries(record.configurationProposals??{}))if(p.status==='awaiting-approval'&&BigInt(p.request.deadline)<=BigInt(now)){p.status='failed';p.failure='APPROVAL_WINDOW_EXPIRED';}
 const liveIntents=new Set(Object.values(s.attempts).map(t=>t.intentId));
 for(const [id,i] of Object.entries(record.intents))if(!liveIntents.has(id)&&i.expiresAt<now-retentionSeconds){delete record.intents[id];delete s.confirmations[id];}
 for(const [id,q] of Object.entries(s.quotas))if(q.expiresAt<now)delete s.quotas[id];
 for(const [id,r] of Object.entries(s.requests))if(r.at<now-retentionSeconds)delete s.requests[id];
 const referenced=new Set(Object.values(s.authorizations).map(a=>a.payload.vcDigest));
 for(const [digest,c] of Object.entries(s.credentials))if(!referenced.has(digest)&&Date.parse(c.vc.validUntil)/1000<now-retentionSeconds&&c.state!=='pending'&&c.state!=='revoke-requested'){delete s.credentials[digest];delete s.checkpoints[digest];}
 return removed;
}
