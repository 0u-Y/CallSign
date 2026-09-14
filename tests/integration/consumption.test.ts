import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consumeAuthorizationAtomic } from "../../services/api/src/consumption.js";
import { createDatabase } from "../../services/api/src/db.js";
import { seedDatabase, demoUsers } from "../../services/api/src/seed.js";
import { authorizations, gatewayRegistrations } from "../../services/api/src/schema.js";

const url = process.env.DATABASE_URL ?? "postgres://institutionproof:institutionproof_dev_only@localhost:55432/institutionproof";
const { db, client } = createDatabase(url);

describe("PostgreSQL atomic authorization consumption", () => {
  beforeAll(async () => {
    await seedDatabase(db);
  });

  afterAll(async () => {
    await client.end();
  });

  it("allows one of 20 competing bindings and makes same-binding retry idempotent", async () => {
    const suffix = randomUUID();
    const gatewayId = `gateway_${suffix}`;
    const authId = `auth_${suffix}`;
    await db.insert(gatewayRegistrations).values({ id: gatewayId, userId: demoUsers[3].id, kid: `kid_${suffix}`, publicJwk: { kty: "OKP", crv: "Ed25519", x: "synthetic" }, delegationId: `delegation_${suffix}` });
    await db.insert(authorizations).values({
      id: authId,
      institutionId: "inst_mock_a_city_01HZZZZZZZZZZZZZZZZ",
      delegationId: `delegation_${suffix}`,
      gatewayRegistrationId: gatewayId,
      recipientId: demoUsers[0].id,
      taskId: "task_alice_document_01HZZZZZZZZZZZZZZZZZZ",
      payload: { test: true },
      signedJws: "synthetic-test-only",
      authorizationHash: "aa".repeat(32),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const attempts = Array.from({ length: 20 }, (_, index) => consumeAuthorizationAtomic(db, {
      authorizationId: authId,
      authorizationHash: "aa".repeat(32),
      bindingHash: index === 0 ? "bb".repeat(32) : `${index.toString(16).padStart(2, "0")}`.repeat(32),
      recipientId: demoUsers[0].id,
      sessionId: `session_${suffix}`,
      consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    }));
    const results = await Promise.allSettled(attempts);
    expect(results.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((entry) => entry.status === "rejected")).toHaveLength(19);
    const row = (await client`SELECT authorization_id, authorization_hash, binding_hash, recipient_id, session_id, consumed_at, expires_at FROM authorization_consumptions WHERE authorization_id = ${authId}`)[0]!;
    const retry = await consumeAuthorizationAtomic(db, {
      authorizationId: String(row.authorization_id),
      authorizationHash: String(row.authorization_hash),
      bindingHash: String(row.binding_hash),
      recipientId: String(row.recipient_id),
      sessionId: String(row.session_id),
      consumedAt: new Date(String(row.consumed_at)),
      expiresAt: new Date(String(row.expires_at)),
    });
    expect(retry.replay).toBe(true);
    expect(retry.bindingHash).toBe(String(row.binding_hash));
  });
});
