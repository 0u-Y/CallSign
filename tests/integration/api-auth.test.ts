import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../services/api/src/server.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://institutionproof:institutionproof_dev_only@localhost:55432/institutionproof";
const origin = "http://localhost:4173";
const app = await buildServer({ databaseUrl, webOrigin: origin, demoMode: true, keyDirectory: ".local/test-keys", logger: false });

describe("session, CSRF, and official task object authorization", () => {
  beforeAll(async () => { await app.ready(); });
  afterAll(async () => { await app.close(); });

  async function login(code: string) {
    const response = await app.inject({ method: "POST", url: "/auth/login", headers: { origin }, payload: { demoCode: code } });
    expect(response.statusCode).toBe(200);
    return { cookie: response.headers["set-cookie"]!.split(";")[0]!, csrf: response.json().csrfToken as string };
  }

  it("does not expose Alice's task to Bob", async () => {
    const bob = await login("bob-demo");
    const response = await app.inject({ method: "GET", url: "/tasks/task_alice_document_01HZZZZZZZZZZZZZZZZZZ", headers: { cookie: bob.cookie } });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("TASK_NOT_FOUND");
  });

  it("rejects state-changing requests without matching Origin and CSRF", async () => {
    const alice = await login("alice-demo");
    const noOrigin = await app.inject({ method: "POST", url: "/recipient/enroll-session", headers: { cookie: alice.cookie, "x-csrf-token": alice.csrf }, payload: {} });
    expect(noOrigin.statusCode).toBe(403);
    expect(noOrigin.json().error.code).toBe("ORIGIN_FORBIDDEN");
  });

  it("serves only the fixed official directory path and its canonical hash", async () => {
    const response = await app.inject({ method: "GET", url: "/directory/inst_mock_a_city_01HZZZZZZZZZZZZZZZZ" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ origin, path: "/official", version: "1", directoryHash: "0x5b2e265a6012d5ce0462254e2afc6a515e4b15bfebd356cfa91a06a29e9bd4a5" });
    const arbitrary = await app.inject({ method: "GET", url: "/directory/inst_attacker_01HZZZZZZZZZZZZZZZZZZ" });
    expect(arbitrary.statusCode).toBe(404);
  });

  it("analyzes only consented recipient transcripts and keeps authentication independent", async () => {
    const alice = await login("alice-demo");
    const withoutConsent = await app.inject({ method: "POST", url: "/risk/analyze", headers: { origin, cookie: alice.cookie, "x-csrf-token": alice.csrf }, payload: { transcript: "인증번호를 알려주세요", consent: false } });
    expect(withoutConsent.statusCode).toBe(400);

    const response = await app.inject({ method: "POST", url: "/risk/analyze", headers: { origin, cookie: alice.cookie, "x-csrf-token": alice.csrf }, payload: { transcript: "인증번호를 알려주시고 원격제어 앱을 설치하세요.", consent: true } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ engine: "rules", authenticationIndependent: true });
    expect(response.json().signals).toHaveLength(2);
  });
});
