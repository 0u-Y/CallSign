if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== "integration") throw new Error("INTEGRATION_EXECUTION_BLOCKED");
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { postgresAuthorityStore } from "../../services/api/src/finals-store.js";
import { randomUUID } from "node:crypto";
const url = process.env.MIGRATOR_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("EXPLICIT_INTEGRATION_DATABASE_URL_REQUIRED");
const sql = postgres(url, { max: 2 }); const store = postgresAuthorityStore(url);
afterAll(async () => { await store.close(); await sql.end(); });
describe("PostgreSQL finals authoritative lock boundary (deferred)", () => {
  it("serializes racing first bindings and recovers the committed result", async () => {
    const id = `integration-${randomUUID()}`;
    const initial = { id, audit: [], consumptions: {} };
    await sql`INSERT INTO issuer_v2.institutions (id, state) VALUES (${id}, ${sql.json(initial)})`;
    const consume = (bindingHash: string) => store.transact(id, async state => {
      const existing = state.consumptions.auth;
      if (existing && existing.payload.bindingHash !== bindingHash) throw new Error("CONFLICT");
      if (!existing) state.consumptions.auth = { payload: { bindingHash } as never, jws: "stored-result" };
      return state.consumptions.auth;
    });
    const results = await Promise.allSettled([consume("binding-a"), consume("binding-b")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const persisted = (await store.read(id)).consumptions.auth!;
    expect(await consume(persisted.payload.bindingHash)).toEqual(persisted);
    await expect(store.transact(id, async s => { s.consumptions.auth = { payload: {} as never, jws: "broken" }; throw new Error("ROLLBACK"); })).rejects.toThrow("ROLLBACK");
    expect((await store.read(id)).consumptions.auth).toEqual(persisted);
  });
});
