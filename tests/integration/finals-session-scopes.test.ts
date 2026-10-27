if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== "integration") throw new Error("INTEGRATION_EXECUTION_BLOCKED");
import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { createDatabase } from "../../services/api/src/db.js";
import { sessionForRequest, tokenHash, type SessionPolicy } from "../../services/api/src/auth.js";

const url = process.env.MIGRATOR_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("EXPLICIT_INTEGRATION_DATABASE_URL_REQUIRED");
const sql = postgres(url, { max: 2 }); const { db, client } = createDatabase(url);
const userId = `scope-integration-${randomUUID()}`, usedToken = tokenHash(randomUUID());
const policy: SessionPolicy = { purpose: "official", issuer: "https://identity.example", clientId: "official-client", audience: "official-audience" };
const request = (token: string, official: boolean) => ({ cookies: { [official ? "official_session" : "ip_session"]: token } } as Parameters<typeof sessionForRequest>[1]);
beforeAll(async () => { await sql`INSERT INTO public.users (id, display_name, role, demo_code) VALUES (${userId}, 'Scope fixture', 'recipient', ${randomUUID()})`; });
afterAll(async () => {
  // Only this file's random, explicitly created fixture rows are removed.
  await sql`DELETE FROM public.sessions WHERE user_id = ${userId}`;
  await sql`DELETE FROM public.users WHERE id = ${userId}`;
  await sql`DELETE FROM public.oidc_login_uses WHERE token_hash = ${usedToken}`;
  await sql.end(); await client.end();
});
it("persists scope and context, rejects swapped cookies and keeps legacy separate", async () => {
  await sql`INSERT INTO public.sessions (id, token_hash, csrf_token, user_id, expires_at) VALUES (${randomUUID()}, ${tokenHash('legacy-' + userId)}, 'csrf', ${userId}, now() + interval '5 minutes')`;
  await sql`INSERT INTO public.sessions (id, token_hash, csrf_token, user_id, expires_at, purpose, oidc_issuer, oidc_client_id, oidc_audience, authenticated_at)
    VALUES (${randomUUID()}, ${tokenHash('official-' + userId)}, 'csrf', ${userId}, now() + interval '5 minutes', 'official', ${policy.issuer}, ${policy.clientId}, ${policy.audience}, now())`;
  expect((await sessionForRequest(db, request('official-' + userId, true), policy)).purpose).toBe("official");
  await expect(sessionForRequest(db, request('legacy-' + userId, true), policy)).rejects.toThrow("OFFICIAL_SCOPE_REQUIRED");
  await expect(sessionForRequest(db, request('official-' + userId, false))).rejects.toThrow("SESSION_SCOPE_INVALID");
  expect((await sessionForRequest(db, request('legacy-' + userId, false))).purpose).toBe("legacy");
});
it("enforces OIDC metadata for scoped sessions at the database boundary", async () => {
  await expect(sql`INSERT INTO public.sessions (id, token_hash, csrf_token, user_id, expires_at, purpose)
    VALUES (${randomUUID()}, ${tokenHash(randomUUID())}, 'csrf', ${userId}, now() + interval '5 minutes', 'official')`).rejects.toMatchObject({ code: "23514" });
});
it("allows a single concurrent login claim and retains that claim independently of sessions", async () => {
  const claim = () => sql.begin(async tx => {
    const rows = await tx`INSERT INTO public.oidc_login_uses (token_hash, expires_at) VALUES (${usedToken}, now() + interval '5 minutes') ON CONFLICT DO NOTHING RETURNING token_hash`;
    return rows.length;
  });
  expect((await Promise.all([claim(), claim()])).sort()).toEqual([0, 1]);
  await sql`DELETE FROM public.sessions WHERE user_id = ${userId}`;
  expect(await claim()).toBe(0);
});
it.skipIf(!process.env.TEST_AUTH_DATABASE_URL)("isolates the configured runtime auth login from issuer storage", async () => {
  const auth = postgres(process.env.TEST_AUTH_DATABASE_URL!, { max: 1 });
  try {
    const [role] = await auth`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(role).toMatchObject({ rolsuper: false, rolbypassrls: false });
    expect((await auth`SELECT pg_has_role(current_user, 'callsign_auth', 'member') AS member`)[0]?.member).toBe(true);
    await auth`SELECT id FROM public.users LIMIT 1`;
    await expect(auth`SELECT id FROM issuer_v2.institutions LIMIT 1`).rejects.toMatchObject({ code: "42501" });
  } finally { await auth.end(); }
});
