import postgres from "postgres";
import type { AuthorityStore, InstitutionRecord } from "./finals-model.js";

// One institution row is the shared authority boundary for cancellation, rotation and consumption.
// PostgreSQL lock/isolation behavior still requires the deferred integration suite.
export function postgresAuthorityStore(url: string): AuthorityStore & { close(): Promise<void> } {
  const sql = postgres(url, { max: 4, prepare: false, connect_timeout: 3, idle_timeout: 10 });
  return {
    async read(id) {
      const rows = await sql`SELECT state FROM issuer_v2.institutions WHERE id = ${id}`;
      if (!rows[0]) throw new Error("INSTITUTION_NOT_PROVISIONED");
      const state = rows[0].state as InstitutionRecord;
      if (state.serviceV3) { const gate = await sql`SELECT status FROM issuer_v2.recovery_gate WHERE institution_id=${id}`; if (gate[0]?.status !== "ready") state.serviceV3.recovery = "blocked"; }
      return state;
    },
    async transact<T>(id: string, operation: (record: InstitutionRecord) => Promise<T>): Promise<T> {
      return await sql.begin(async tx => {
        const rows = await tx`SELECT state FROM issuer_v2.institutions WHERE id = ${id} FOR UPDATE`;
        if (!rows[0]) throw new Error("INSTITUTION_NOT_PROVISIONED");
        const state = rows[0].state as InstitutionRecord;
        const offset = state.audit.length;
        const priorClaims = new Set([...Object.keys(state.consumptions), ...Object.keys(state.serviceV3?.consumptions ?? {})]);
        if (state.serviceV3) {
          const gate = await tx`SELECT status FROM issuer_v2.recovery_gate WHERE institution_id=${id}`;
          if (gate[0]?.status !== "ready") state.serviceV3.recovery = "blocked";
        }
        const result = await operation(state);
        const claims = [...Object.entries(state.consumptions).map(([id, item]) => ({ id, version: 2, hash: item.payload.bindingHash, receipt: item })), ...Object.entries(state.serviceV3?.consumptions ?? {}).map(([id, item]) => ({ id, version: 3, hash: item.payload.bindingHash, receipt: item }))];
        // Same authoritative transaction as the aggregate, including legacy namespace conflicts.
        {
          for (const claim of claims.filter(claim => !priorClaims.has(claim.id))) {
            const existing = await tx`SELECT protocol_version,binding_hash FROM issuer_v2.approval_consumptions WHERE institution_id=${id} AND authorization_id=${claim.id}`;
            if (existing[0] && (existing[0].protocol_version !== claim.version || existing[0].binding_hash !== claim.hash)) throw new Error("CROSS_PROFILE_CONSUMPTION_CONFLICT");
            if (!existing[0]) await tx`INSERT INTO issuer_v2.approval_consumptions(institution_id,authorization_id,protocol_version,binding_hash,receipt) VALUES(${id},${claim.id},${claim.version},${claim.hash},${tx.json(claim.receipt as unknown as postgres.JSONValue)})`;
          }
          for (const usage of state.pendingUsage ?? []) {
            const charged = await tx`INSERT INTO issuer_v2.global_quota(key,used,hard_limit,expires_at) VALUES(${usage.key},${usage.units},${usage.limit},to_timestamp(${usage.expiresAt}))
              ON CONFLICT(key) DO UPDATE SET used=issuer_v2.global_quota.used+EXCLUDED.used WHERE issuer_v2.global_quota.used+EXCLUDED.used<=issuer_v2.global_quota.hard_limit RETURNING key`;
            if (!charged.length) throw Object.assign(new Error("GLOBAL_QUOTA_EXHAUSTED"), { statusCode: 429, code: "GLOBAL_QUOTA_EXHAUSTED" });
          }
          for (const event of state.pendingEvents ?? []) await tx`INSERT INTO issuer_v2.outbox(id,institution_id,kind,object_id,payload) VALUES(${event.id},${id},${event.kind},${event.objectId},${tx.json(event.payload as postgres.JSONValue)}) ON CONFLICT(id) DO NOTHING`;
          state.pendingUsage = []; state.pendingEvents = [];
        }
        for (const event of state.audit.slice(offset)) await tx`INSERT INTO issuer_v2.audit (id, institution_id, event) VALUES (${event.id}, ${id}, ${tx.json(event)})`;
        // Full audit is append-only in its own table; keep the aggregate bounded.
        state.audit = [];
        await tx`UPDATE issuer_v2.institutions SET state = ${tx.json(state as unknown as postgres.JSONValue)}, revision = revision + 1 WHERE id = ${id}`;
        return result as never;
      }) as T;
    },
    async close() { await sql.end({ timeout: 5 }); },
  };
}
