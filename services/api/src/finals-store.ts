import { enterBackupWrite,backupLock } from './backup-drain.js';
import { randomUUID } from 'node:crypto';
import { notificationRecipients } from './notifications.js';
import postgres from "postgres";
import { hashCanonical } from "@callsign/protocol";
import { journalEntry,advanceJournalCursor,type JournalRow,type JournalCursor } from "./service-worker.js";
import { assertAnchorMatches,type ConsumptionAnchor,type Anchor } from "./consumption-anchor.js";
import { authorityStateHash,type AuthorityStore,type InstitutionRecord } from "./finals-model.js";

// One institution row is the shared authority boundary for cancellation, rotation and consumption.
// PostgreSQL lock/isolation behavior still requires the deferred integration suite.
export function postgresAuthorityStore(url: string, options?:{anchor:ConsumptionAnchor;deployment:string}): AuthorityStore & { close(): Promise<void>;verifyRecovery(id:string,allowBootstrap?:boolean):Promise<void> } {
  const sql = postgres(url, { max: 4, prepare: false, connect_timeout: 3, idle_timeout: 10, connection: { statement_timeout: 5000, lock_timeout: 2000 } });
  const checkpoint=async(tx:postgres.TransactionSql,record:InstitutionRecord,previousEpoch=record.epoch,onAdvance=()=>{})=>{
    if(!options)throw new Error("INDEPENDENT_ANCHOR_REQUIRED");
    const head=await tx`SELECT sequence,entry_hash FROM issuer_v2.consumption_journal WHERE institution_id=${record.id} ORDER BY sequence DESC LIMIT 1`;
    const previous:Anchor={deployment:options.deployment,institutionId:record.id,sequence:String(head[0]?.sequence??0),hash:String(head[0]?.entry_hash??'0'.repeat(64)),epoch:previousEpoch};
    assertAnchorMatches(previous,await options.anchor.read(record.id));
    const authorizationId=`authority-state:${record.epoch}:${randomUUID()}`,bindingHash=authorityStateHash(record),next:Anchor={...previous,epoch:record.epoch,sequence:String(BigInt(previous.sequence)+1n),hash:journalEntry(record.id,authorizationId,bindingHash,previous.hash)};
    await options.anchor.advance(previous,next);onAdvance();
    await tx`INSERT INTO issuer_v2.consumption_journal(sequence,institution_id,authorization_id,binding_hash,entry_hash,previous_hash) VALUES(${next.sequence},${record.id},${authorizationId},${bindingHash},${next.hash},${previous.hash})`;
    return {sequence:next.sequence,hash:next.hash,epoch:next.epoch,authorityHash:bindingHash};
  };
  const closeGate=async(id:string,error:unknown,force=false)=>{if(force||(error instanceof Error&&/ANCHOR|CONSUMPTION_HISTORY|AUTHORITY_METADATA/.test(error.message)))await sql`UPDATE issuer_v2.recovery_gate SET status='blocked' WHERE institution_id=${id}`;};
  return {
    async manageAccount(id,actorId,requestId,input){
      let anchorTouched=false;
      try{return await sql.begin(async tx=>{
        await enterBackupWrite(tx);
        const rows=await tx`SELECT state FROM issuer_v2.institutions WHERE id=${id} FOR UPDATE`,before=rows[0]?.state as InstitutionRecord;if(!before)throw new Error('INSTITUTION_NOT_PROVISIONED');
        const gate=await tx`SELECT status FROM issuer_v2.recovery_gate WHERE institution_id=${id}`;if(!options||gate[0]?.status!=='ready'||before.authorityCheckpointVersion!==1)throw new Error('AUTHORITY_METADATA_RECOVERY_REQUIRED');
        const originalHash=authorityStateHash(before),result=await tx`SELECT issuer_v2.manage_account(${id},${actorId},${requestId},${tx.json(input as postgres.JSONValue)}) AS result`;
        const after=(await tx`SELECT state FROM issuer_v2.institutions WHERE id=${id}`)[0]!.state as InstitutionRecord;
        if(originalHash!==authorityStateHash(after))await checkpoint(tx,after,before.epoch,()=>{anchorTouched=true;});
        return result[0]!.result;
      });}catch(error){await closeGate(id,error,anchorTouched);throw error;}
    },
    async read(id) {
      const rows = await sql`SELECT state FROM issuer_v2.institutions WHERE id = ${id}`;
      if (!rows[0]) throw new Error("INSTITUTION_NOT_PROVISIONED");
      const state = rows[0].state as InstitutionRecord;
      if (state.serviceV3) { const gate = await sql`SELECT status FROM issuer_v2.recovery_gate WHERE institution_id=${id}`; if (!options || gate[0]?.status !== "ready") state.serviceV3.recovery = "blocked"; }
      return state;
    },
    async transact<T>(id: string, operation: (record: InstitutionRecord) => Promise<T>, mode?: "safety" | "cleanup"): Promise<T> {
      let anchorTouched=false;
      try{return await sql.begin(async tx => {
        await enterBackupWrite(tx,!!mode);
        const rows = await tx`SELECT state FROM issuer_v2.institutions WHERE id = ${id} FOR UPDATE`;
        if (!rows[0]) throw new Error("INSTITUTION_NOT_PROVISIONED");
        const state = rows[0].state as InstitutionRecord;
        const offset = state.audit.length;
        const eventOffset=state.pendingEvents?.length??0;
        const originalEpoch=state.epoch,originalAuthorityHash=state.serviceV3?authorityStateHash(state):undefined,originalStatus=state.status;let journalEpoch=originalEpoch;
        const priorClaims = new Set([...Object.keys(state.consumptions), ...Object.keys(state.serviceV3?.consumptions ?? {})]);
        if (state.serviceV3) {
          const gate = await tx`SELECT status FROM issuer_v2.recovery_gate WHERE institution_id=${id}`;
          if ((!options || gate[0]?.status !== "ready") && mode!=="cleanup") state.serviceV3.recovery = "blocked";
          else if(mode!=="cleanup"&&options) {const head=await tx`SELECT sequence,entry_hash FROM issuer_v2.consumption_journal WHERE institution_id=${id} ORDER BY sequence DESC LIMIT 1`;assertAnchorMatches({deployment:options.deployment,institutionId:id,sequence:String(head[0]?.sequence??0),hash:String(head[0]?.entry_hash??'0'.repeat(64)),epoch:state.epoch},await options.anchor.read(id));}
        }
        const appendJournal=async(authorizationId:string,bindingHash:string)=>{
          if(!options)throw new Error("INDEPENDENT_ANCHOR_REQUIRED");
              const journal=await tx`SELECT sequence,entry_hash FROM issuer_v2.consumption_journal WHERE institution_id=${id} ORDER BY sequence DESC LIMIT 1`;
              const previous:Anchor={deployment:options.deployment,institutionId:id,sequence:String(journal[0]?.sequence??0),hash:String(journal[0]?.entry_hash??"0".repeat(64)),epoch:journalEpoch};
              const remote=await options.anchor.read(id);assertAnchorMatches(previous,remote);
              const next:Anchor={...previous,sequence:String(BigInt(previous.sequence)+1n),hash:journalEntry(id,authorizationId,bindingHash,previous.hash),epoch:state.epoch};
              // An uncertain remote commit blocks local commit. If remote advanced, recovery requires explicit reconciliation.
              await options.anchor.advance(previous,next);anchorTouched=true;journalEpoch=next.epoch;
              await tx`INSERT INTO issuer_v2.consumption_journal(sequence,institution_id,authorization_id,binding_hash,entry_hash,previous_hash) VALUES(${next.sequence},${id},${authorizationId},${bindingHash},${next.hash},${previous.hash})`;
        };
        const result = await operation(state);
        if(mode==="cleanup"&&(originalAuthorityHash!==authorityStateHash(state)||originalStatus!==state.status||Object.keys(state.serviceV3?.consumptions??{}).some(id=>!priorClaims.has(id))))throw new Error("CLEANUP_CANNOT_GRANT_OR_CHANGE_AUTHORITY");
        const claims = [...Object.entries(state.consumptions).map(([id, item]) => ({ id, version: 2, hash: item.payload.bindingHash, receipt: item })), ...Object.entries(state.serviceV3?.consumptions ?? {}).map(([id, item]) => ({ id, version: 3, hash: item.payload.bindingHash, receipt: item }))];
        if(originalEpoch!==state.epoch&&claims.some(c=>!priorClaims.has(c.id)))throw new Error("AUTHORITY_CHANGE_AND_CONSUMPTION_MUST_BE_SEPARATE");
        // Same authoritative transaction as the aggregate, including legacy namespace conflicts.
        {
          for (const claim of claims.filter(claim => !priorClaims.has(claim.id))) {
            const existing = await tx`SELECT protocol_version,binding_hash,receipt FROM issuer_v2.approval_consumptions WHERE institution_id=${id} AND authorization_id=${claim.id}`;
            if (existing[0] && (existing[0].protocol_version !== claim.version || existing[0].binding_hash !== claim.hash || hashCanonical(existing[0].receipt)!==hashCanonical(claim.receipt))) throw new Error("CROSS_PROFILE_CONSUMPTION_CONFLICT");
            if (!existing[0]&&state.serviceV3){
              if(!options)throw new Error("INDEPENDENT_ANCHOR_REQUIRED");
              await appendJournal(claim.id,claim.hash);
            }
            if (!existing[0]) await tx`INSERT INTO issuer_v2.approval_consumptions(institution_id,authorization_id,protocol_version,binding_hash,receipt) VALUES(${id},${claim.id},${claim.version},${claim.hash},${tx.json(claim.receipt as unknown as postgres.JSONValue)})`;
          }
          if(mode!=="cleanup"&&state.serviceV3&&(originalAuthorityHash!==authorityStateHash(state)||originalStatus!==state.status||(state.pendingEvents??[]).slice(eventOffset).some(e=>['credential.revoke','intent.cancelled','official.completed','intent.reassigned','call.cleanup'].includes(e.kind))))await checkpoint(tx,state,journalEpoch,()=>{anchorTouched=true;});
          for (const usage of state.pendingUsage ?? []) {
            const charged = await tx`INSERT INTO issuer_v2.global_quota(key,used,hard_limit,expires_at) VALUES(${usage.key},${usage.units},${usage.limit},to_timestamp(${usage.expiresAt}))
              ON CONFLICT(key) DO UPDATE SET used=issuer_v2.global_quota.used+EXCLUDED.used WHERE issuer_v2.global_quota.used+EXCLUDED.used<=issuer_v2.global_quota.hard_limit RETURNING key`;
            if (!charged.length) throw Object.assign(new Error("GLOBAL_QUOTA_EXHAUSTED"), { statusCode: 429, code: "GLOBAL_QUOTA_EXHAUSTED" });
          }
          for (const event of state.pendingEvents ?? []) await tx`INSERT INTO issuer_v2.outbox(id,institution_id,kind,object_id,payload) VALUES(${event.id},${id},${event.kind},${event.objectId},${tx.json(event.payload as postgres.JSONValue)}) ON CONFLICT(id) DO NOTHING`;
          for(const event of state.pendingEvents??[]){const code=event.kind==='call.cleanup'?`attempt.${state.serviceV3?.attempts[event.objectId]?.status}`:event.kind;const notice={...event,kind:code},noticeId=code.startsWith('attempt.')?`terminal:${event.objectId}:${code}`:event.id;for(const userId of notificationRecipients(state,notice))await tx`INSERT INTO issuer_v2.notifications(id,institution_id,user_id,code) VALUES(${noticeId},${id},${userId},${code}) ON CONFLICT DO NOTHING`;}
          state.pendingUsage = []; state.pendingEvents = [];
        }
        for (const event of state.audit.slice(offset)) await tx`INSERT INTO issuer_v2.audit (id, institution_id, event) VALUES (${event.id}, ${id}, ${tx.json(event)})`;
        // Full audit is append-only in its own table; keep the aggregate bounded.
        state.audit = [];
        await tx`UPDATE issuer_v2.institutions SET state = ${tx.json(state as unknown as postgres.JSONValue)}, revision = revision + 1 WHERE id = ${id}`;
        return result as never;
      }) as T;}catch(error){await closeGate(id,error,anchorTouched);throw error;}
    },
    async verifyRecovery(id:string,allowBootstrap=true){
      if(!options)throw new Error("INDEPENDENT_ANCHOR_REQUIRED");
      const token=randomUUID();
      await sql`UPDATE issuer_v2.recovery_gate SET status='blocked',verification_token=${token} WHERE institution_id=${id}`;
      // Verify every row in a consistent read-only snapshot without locking the institution across the scan.
      let verified=await sql.begin('isolation level repeatable read read only',async tx=>{
        const rows=await tx`SELECT state FROM issuer_v2.institutions WHERE id=${id}`,state=rows[0]?.state as InstitutionRecord;
        if(!state)throw new Error("INSTITUTION_NOT_PROVISIONED");
        if(state.serviceV3&&state.authorityCheckpointVersion!==1)throw new Error("AUTHORITY_METADATA_MIGRATION_REQUIRED");
        let cursor:JournalCursor={sequence:'0',hash:'0'.repeat(64),epoch:'1'};
        for(;;){const page=await tx`SELECT sequence,authorization_id,binding_hash,entry_hash,previous_hash FROM issuer_v2.consumption_journal WHERE institution_id=${id} AND sequence>${cursor.sequence} ORDER BY sequence LIMIT 500`;for(const row of page)cursor=advanceJournalCursor(id,cursor,row as JournalRow);if(page.length<500)break;}
        const integrity=await tx`SELECT count(*) AS missing FROM issuer_v2.consumption_journal j LEFT JOIN issuer_v2.approval_consumptions c ON c.institution_id=j.institution_id AND c.authorization_id=j.authorization_id AND c.binding_hash=j.binding_hash WHERE j.institution_id=${id} AND j.authorization_id NOT LIKE 'key-generation:%' AND j.authorization_id NOT LIKE 'authority-state:%' AND c.authorization_id IS NULL`;
        const counts=await tx`SELECT (SELECT count(*) FROM issuer_v2.approval_consumptions WHERE institution_id=${id}) AS claims,(SELECT count(*) FROM issuer_v2.consumption_journal WHERE institution_id=${id} AND authorization_id NOT LIKE 'key-generation:%' AND authorization_id NOT LIKE 'authority-state:%') AS journal_claims`;
        if(cursor.epoch!==state.epoch||(cursor.sequence!=="0"&&cursor.authorityHash!==authorityStateHash(state))||Number(integrity[0]?.missing)!==0||String(counts[0]?.claims)!==String(counts[0]?.journal_claims))throw new Error("CONSUMPTION_HISTORY_RECOVERY_REQUIRED");
        return cursor;
      }) as JournalCursor;
      // Fence intervening consumption, generation changes, and another replica's recovery pass.
      await sql.begin(async tx=>{
        await tx`SELECT pg_advisory_xact_lock_shared(${backupLock})`;
        const rows=await tx`SELECT state FROM issuer_v2.institutions WHERE id=${id} FOR UPDATE`,state=rows[0]?.state as InstitutionRecord;
        const fence=await tx`SELECT institution_id FROM issuer_v2.recovery_gate WHERE institution_id=${id} AND verification_token=${token} AND status='blocked' FOR UPDATE`;if(!fence.length)throw new Error("RECOVERY_VERIFICATION_SUPERSEDED");
        const head=await tx`SELECT sequence,entry_hash FROM issuer_v2.consumption_journal WHERE institution_id=${id} ORDER BY sequence DESC LIMIT 1`;
        if(!state||state.epoch!==verified.epoch||String(head[0]?.sequence??0)!==verified.sequence||String(head[0]?.entry_hash??'0'.repeat(64))!==verified.hash)throw new Error("CONSUMPTION_HISTORY_CHANGED_DURING_RECOVERY");
        assertAnchorMatches({deployment:options.deployment,institutionId:id,sequence:verified.sequence,hash:verified.hash,epoch:verified.epoch},await options.anchor.read(id));
        if(verified.sequence==="0"){if(!allowBootstrap)throw new Error("AUTHORITY_METADATA_CHECKPOINT_REQUIRED");await enterBackupWrite(tx);verified=await checkpoint(tx,state);}else if(verified.authorityHash!==authorityStateHash(state))throw new Error("AUTHORITY_METADATA_CHANGED_DURING_RECOVERY");
        const opened=await tx`UPDATE issuer_v2.recovery_gate SET status='ready',checked_at=now() WHERE institution_id=${id} AND verification_token=${token} AND status='blocked' RETURNING institution_id`;
        if(!opened.length)throw new Error("RECOVERY_VERIFICATION_SUPERSEDED");
        await tx`UPDATE issuer_v2.institutions SET state=jsonb_set(state,'{serviceV3,recovery}','"ready"'::jsonb) WHERE id=${id}`;
      });
    },
    async close() { await sql.end({ timeout: 5 }); },
  };
}
