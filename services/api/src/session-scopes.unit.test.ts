import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { oidcLoginUses, sessions, users } from "./schema.js";
import { sessionForRequest, tokenHash } from "./auth.js";
import { buildFinalsServer } from "./finals-server.js";
import { finalsEnvironmentSchema } from "./finals-config.js";

const injected = vi.hoisted(() => ({ db: undefined as any, institution: undefined as any, identity: undefined as any,quotaCalls:[] as string[] }));
vi.mock("./notifications.js",()=>({registerNotifications:()=>{},notificationRecipients:()=>[]}));
vi.mock("./account-management.js",async original=>({...await original<typeof import("./account-management.js")>(),registerAccountManagement:()=>{}}));
vi.mock("./operations.js",()=>({registerServiceOperations:()=>{}}));
vi.mock("./quota.js",()=>({postgresQuotaStore:()=>({chargeRequest:async(institution:string,user:string)=>{if(institution!==injected.institution.id||!injected.institution.members[user])throw new Error('UNAUTHENTICATED_QUOTA_PRINCIPAL');injected.quotaCalls.push(user);},reserve:async()=>{throw new Error("UNEXPECTED_QUOTA_USE_IN_AUTH_TEST");},settle:async()=>{throw new Error("UNEXPECTED_QUOTA_USE_IN_AUTH_TEST");},close:async()=>{}})}));
vi.mock("./db.js", () => ({ createDatabase: () => ({ db: injected.db, client: { end: async () => {} } }) }));
vi.mock("./finals-store.js", () => ({ postgresAuthorityStore: () => ({ read: async () => injected.institution, transact:async (_id:string,operation:(record:any)=>Promise<unknown>)=>operation(injected.institution), close: async () => {} }) }));
vi.mock("node:fs/promises", () => ({ readFile: async () => JSON.stringify({ witnessThreshold: 3, witnessPublicKeys: [{}, {}, {}, {}], endpoints: [{}, {}, {}, {}], didDocuments: {} }) }));
vi.mock("jose", async original => ({ ...await original<typeof import("jose")>(), jwtVerify: async () => ({ payload: injected.identity }) }));

const issuer = "https://identity.example", clientId = "work-client", audience = "work-audience";
const userId = `${issuer}|alice`, institutionId = "mock-bank-institution";
const origin = "http://localhost:8080", serviceToken = "p".repeat(32);
type Row = typeof sessions.$inferSelect;

// Narrow SQL-backed-store fake. It exercises real route/scope/CSRF logic, not PostgreSQL semantics.
function databaseFake() {
  const state = { sessions: new Map<string, Row>(), uses: new Map<string, { tokenHash: string; expiresAt: Date }>() };
  const params = (condition: any) => new PgDialect().sqlToQuery(condition).params;
  const db: any = {
    select: () => ({ from: (table: unknown) => {
      let condition: any;
      const result = () => {
        const values = params(condition);
        if (table === users) return values.includes(userId) ? [{ id: userId, displayName: "Alice", role: "recipient" }] : [];
        return [...state.sessions.values()].filter(r => values.includes(r.tokenHash) && r.expiresAt.getTime() > Date.now() && (!values.includes("work") || r.purpose === "work") && (!values.includes("official") || r.purpose === "official"))
          .map(r => ({ ...r, sessionId: r.id, displayName: "Alice", role: "recipient" }));
      };
      const query: any = { innerJoin: () => query, where: (value: unknown) => { condition = value; return query; }, limit: async () => result(), then: (resolve: any, reject: any) => Promise.resolve().then(result).then(resolve, reject) };
      return query;
    } }),
    delete: (table: unknown) => ({ where: async (condition: any) => {
      if (table === oidcLoginUses) { const cutoff = new Date(String(params(condition)[0])); for (const [hash, row] of state.uses) if (row.expiresAt < cutoff) state.uses.delete(hash); }
      else for (const [id] of state.sessions) if (params(condition).includes(id)) state.sessions.delete(id);
    } }),
    insert: (table: unknown) => ({ values: (value: any) => {
      let ignore = false;
      const apply = () => {
        const map = table === oidcLoginUses ? state.uses : state.sessions;
        const key = table === oidcLoginUses ? value.tokenHash : value.id;
        if (map.has(key)) { if (ignore) return []; throw new Error("UNIQUE_CONFLICT"); }
        map.set(key, value); return [value];
      };
      const insert: any = { onConflictDoNothing: () => { ignore = true; return insert; }, returning: async () => apply(), then: (resolve: any, reject: any) => Promise.resolve().then(apply).then(resolve, reject) };
      return insert;
    } }),
    transaction: async (run: (tx: unknown) => Promise<void>) => {
      const priorSessions = new Map(state.sessions), priorUses = new Map(state.uses);
      try { return await run(db); } catch (e) { state.sessions = priorSessions; state.uses = priorUses; throw e; }
    },
  };
  return { state, db };
}

let fake: ReturnType<typeof databaseFake>;
function add(purpose: "legacy" | "work" | "official", token = purpose) {
  fake.state.sessions.set(token, { id: token, tokenHash: tokenHash(token), membershipGeneration:0,csrfToken: `csrf-${purpose}`, userId, purpose,
    expiresAt: new Date(Date.now() + 60000), createdAt: new Date(), oidcIssuer: issuer,
    oidcClientId: purpose === "official" ? "official-client" : clientId, oidcAudience: purpose === "official" ? "official-audience" : audience, authenticatedAt: new Date() });
}
function server() {
  return buildFinalsServer(finalsEnvironmentSchema.parse({ SERVICE_ROLE: "issuer", WEB_ORIGIN: origin, PLATFORM_INTERNAL_TOKEN: serviceToken, SENDER_INTERNAL_TOKEN: "s".repeat(32),
    ISSUER_URL: "http://issuer:4101", SENDER_URL: "http://sender:4102", INSTITUTION_ID: institutionId, NETWORK_ID: "20260914", REGISTRY_ADDRESS: "0x1111111111111111111111111111111111111111", TRUST_BUNDLE_PATH: "fixture-trust.json" }));
}
function headers(cookie: string, csrfToken?: string) { return { cookie, origin, "x-service-token": serviceToken, ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) }; }
beforeEach(() => {
  fake = databaseFake(); injected.db = fake.db;injected.quotaCalls=[];
  injected.institution = { id: institutionId, members: { [userId]: { role: "recipient" } }, intents: { mine: { id: "mine", recipientId: userId } }, policy: {} };
  injected.identity = { sub: "alice", iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+300, aud: audience };
  for (const [key, value] of Object.entries({ ISSUER_DATABASE_URL: "fake-only", AUTH_DATABASE_URL: "fake-only", OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId, OFFICIAL_OIDC_CLIENT_ID: "official-client", OIDC_AUDIENCE: audience, OFFICIAL_OIDC_AUDIENCE: "official-audience", OIDC_JWKS_URL: "https://identity.example/keys", OIDC_AUTHORIZATION_URL: "", OIDC_TOKEN_URL: "" })) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

describe("issuer purpose-bound sessions (offline routes)", () => {
  it("preserves legacy sessions without letting a v2 token enter legacy routes", async () => {
    add("legacy"); add("work");
    expect((await sessionForRequest(fake.db, { cookies: { ip_session: "legacy" } } as any)).purpose).toBe("legacy");
    await expect(sessionForRequest(fake.db, { cookies: { ip_session: "work" } } as any)).rejects.toThrow("SESSION_SCOPE_INVALID");
  });
  it("rejects swapping work/official/legacy tokens across cookie names", async () => {
    add("work"); add("official"); add("legacy"); const app = await server();
    try {
      expect((await app.inject({ url: "/v2/official/mine", headers: headers("official_session=official") })).statusCode).toBe(200);
      for (const token of ["work", "legacy"]) {
        const result = await app.inject({ url: "/v2/official/mine", headers: headers(`official_session=${token}`) });
        expect(result.statusCode).toBe(403); expect(result.json().error.code).toBe("OFFICIAL_SCOPE_REQUIRED");
      }
      expect(injected.quotaCalls).toHaveLength(1);
      const swapped = await app.inject({ url: "/v2/auth/me?purpose=work", headers: headers("ip_session=official") });
      expect(swapped.statusCode).toBe(403);
      expect((await app.inject({ url: "/v2/official/not-owned", headers: headers("official_session=official") })).statusCode).toBe(404);
    } finally { await app.close(); }
  });
  it.each(["oidcIssuer", "oidcClientId", "oidcAudience", "authenticatedAt"] as const)("rejects a stored official session with invalid %s", async field => {
    add("official"); (fake.state.sessions.get("official") as any)[field] = null;
    const app = await server();
    try { expect((await app.inject({ url: "/v2/official-tasks", headers: headers("official_session=official") })).statusCode).toBe(403); }
    finally { await app.close(); }
  });
  it("checks the selected scope CSRF and deletes only that session on logout", async () => {
    add("work"); add("official"); const app = await server();
    try {
      const cookie = "ip_session=work; official_session=official";
      const rejected = await app.inject({ method: "POST", url: "/v2/auth/logout", headers: headers(cookie, "csrf-work"), payload: { purpose: "official" } });
      expect(rejected.statusCode).toBe(403); expect(fake.state.sessions.size).toBe(2);
      const logout = await app.inject({ method: "POST", url: "/v2/auth/logout", headers: headers(cookie, "csrf-official"), payload: { purpose: "official" } });
      expect(logout.statusCode).toBe(200); expect(logout.headers["set-cookie"]).toEqual(expect.arrayContaining([expect.stringMatching(/^official_session=;/)]));
      expect((await app.inject({ url: "/v2/official-tasks", headers: headers(cookie) })).statusCode).toBe(401);
      expect((await app.inject({ url: "/v2/auth/me?purpose=work", headers: headers(cookie) })).statusCode).toBe(200);
      expect((await app.inject({ method: "POST", url: "/v2/auth/logout", headers: headers(cookie), payload: { purpose: "work" } })).statusCode).toBe(403);
    } finally { await app.close(); }
  });
  it("persists login scope and prevents reusing an ID token after logout", async () => {
    fake.state.uses.set("expired-login", { tokenHash: "expired-login", expiresAt: new Date(Date.now()-1) });
    const app = await server();
    try {
      const login = await app.inject({ method: "POST", url: "/v2/login", headers: headers(""), payload: { idToken: "fixture-id-token", official: false } });
      expect(login.statusCode).toBe(200);
      const row = [...fake.state.sessions.values()][0]!;
      expect(row).toMatchObject({ purpose: "work", oidcIssuer: issuer, oidcClientId: clientId, oidcAudience: audience });
      const cookies = login.headers["set-cookie"]!;
      const cookie = (Array.isArray(cookies) ? cookies[0]! : cookies).split(";")[0]!;
      const logout = await app.inject({ method: "POST", url: "/v2/auth/logout", headers: headers(cookie, login.json().csrfToken), payload: { purpose: "work" } });
      expect(logout.statusCode).toBe(200); expect(fake.state.sessions.size).toBe(0); expect(fake.state.uses.size).toBe(1); expect(fake.state.uses.has("expired-login")).toBe(false);
      const replay = await app.inject({ method: "POST", url: "/v2/login", headers: headers(""), payload: { idToken: "fixture-id-token", official: false } });
      expect(replay.statusCode).toBe(401); expect(replay.json().error.code).toBe("OIDC_TOKEN_ALREADY_USED");
    } finally { await app.close(); }
  });
  it("refuses the wrong authorized party even with an accepted audience", async () => {
    injected.identity.azp = "unregistered-client"; const app = await server();
    try { expect((await app.inject({ method: "POST", url: "/v2/login", headers: headers(""), payload: { idToken: "wrong-client", official: false } })).statusCode).toBe(401); expect(fake.state.sessions.size).toBe(0); }
    finally { await app.close(); }
  });
});

it('exposes the shared purpose-bound authentication through the default service route without fallback',async()=>{add('work');add('official');const app=await server();try{const work=await app.inject({method:'GET',url:'/v3/auth/me?purpose=work',headers:headers('ip_session=work')});expect(work.statusCode).toBe(200);expect(work.json().purpose).toBe('work');const wrong=await app.inject({method:'GET',url:'/v3/auth/me?purpose=official',headers:headers('official_session=work')});expect(wrong.statusCode).toBe(403);}finally{await app.close();}});
it('rejects an old session even after the account is active again with a newer membership generation',async()=>{add('work');injected.institution.members[userId]={role:'recipient',active:true,sessionGeneration:1};const app=await server();try{const result=await app.inject({method:'GET',url:'/v3/auth/me?purpose=work',headers:headers('ip_session=work')});expect(result.statusCode).toBe(401);expect(result.json().error.code).toBe('MEMBERSHIP_SESSION_REVOKED');}finally{await app.close();}});
