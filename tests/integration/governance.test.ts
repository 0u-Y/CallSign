import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../../services/api/src/server.js";
import type { GovernanceLedger } from "../../services/api/src/ledger.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://institutionproof:institutionproof_dev_only@localhost:55432/institutionproof";
const origin = "http://localhost:4173";
const institutionId = "inst_mock_a_city_01HZZZZZZZZZZZZZZZZ";

const ledgerState = { status: "Active" as "Active" | "Suspended", epoch: "1" };
const submittedSignatures: string[][] = [];
const governanceLedger = {
  async state(requestedInstitutionId: string) {
    expect(requestedInstitutionId).toBe(institutionId);
    return { ...ledgerState, institutionId, administrator: "0x0000000000000000000000000000000000000044", emergencyStopper: "0x0000000000000000000000000000000000000055" };
  },
  async suspend(requestedInstitutionId: string) {
    expect(requestedInstitutionId).toBe(institutionId);
    if (ledgerState.status !== "Active") throw new Error("LEDGER_INSTITUTION_NOT_ACTIVE");
    ledgerState.status = "Suspended";
    ledgerState.epoch = String(Number(ledgerState.epoch) + 1);
    return { transactionHash: `0x${"ab".repeat(32)}`, state: await this.state(requestedInstitutionId) };
  },
  async createRecovery(requestedInstitutionId: string, now: number) {
    expect(requestedInstitutionId).toBe(institutionId);
    if (ledgerState.status !== "Suspended") throw new Error("LEDGER_INSTITUTION_NOT_SUSPENDED");
    return {
      institutionId: `0x${"11".repeat(32)}`,
      expectedEpoch: ledgerState.epoch,
      newAdministrator: "0x0000000000000000000000000000000000000066",
      newApprovalPublicKey: `0x${"22".repeat(32)}`,
      newEmergencyStopper: "0x0000000000000000000000000000000000000077",
      nonce: `0x${"33".repeat(32)}`,
      deadline: String(now + 600),
    };
  },
  async signRecovery(_request: Record<string, string>, signerUserId: string) {
    const byte = signerUserId.includes("_1_") ? "44" : signerUserId.includes("_2_") ? "55" : "66";
    return `0x${byte.repeat(65)}` as `0x${string}`;
  },
  async submitRecovery(_request: Record<string, string>, signatures: string[]) {
    submittedSignatures.push(signatures);
    ledgerState.status = "Active";
    ledgerState.epoch = String(Number(ledgerState.epoch) + 1);
    return { transactionHash: `0x${"cd".repeat(32)}`, state: await this.state(institutionId) };
  },
} satisfies GovernanceLedger;

const app = await buildServer({ databaseUrl, webOrigin: origin, demoMode: true, keyDirectory: ".local/test-keys", logger: false, governanceLedger });

describe("governance API executes a distinct 2-of-3 recovery on the ledger seam", () => {
  beforeAll(async () => { await app.ready(); });
  afterAll(async () => { await app.close(); });

  async function login(code: string) {
    const response = await app.inject({ method: "POST", url: "/auth/login", headers: { origin }, payload: { demoCode: code } });
    expect(response.statusCode).toBe(200);
    return { cookie: response.headers["set-cookie"]!.split(";")[0]!, csrf: response.json().csrfToken as string };
  }

  async function post(url: string, auth: { cookie: string; csrf: string }, payload: unknown = {}) {
    return app.inject({ method: "POST", url, headers: { origin, cookie: auth.cookie, "x-csrf-token": auth.csrf }, payload });
  }

  it("requires suspension and two different approver sessions before executing recovery", async () => {
    const operator = await login("operator-demo");
    const tooEarly = await post("/governance/proposals", operator, { action: "RECOVER", institutionId });
    expect(tooEarly.statusCode).toBe(409);

    const suspended = await post(`/governance/institutions/${institutionId}/suspend`, operator);
    expect(suspended.statusCode).toBe(200);
    expect(suspended.json()).toMatchObject({ state: { status: "Suspended", epoch: "2" } });

    const created = await post("/governance/proposals", operator, { action: "RECOVER", institutionId });
    expect(created.statusCode).toBe(200);
    const proposalId = created.json().proposal.id as string;
    expect(created.json().proposal.payload).toMatchObject({ expectedEpoch: "2" });

    const approver1 = await login("approver-1-demo");
    const first = await post(`/governance/proposals/${proposalId}/sign`, approver1);
    expect(first.json()).toMatchObject({ signerCount: 1, status: "collecting" });
    const duplicate = await post(`/governance/proposals/${proposalId}/sign`, approver1);
    expect(duplicate.statusCode).toBe(409);

    const institution = await login("institution-demo");
    const wrongRole = await post(`/governance/proposals/${proposalId}/sign`, institution);
    expect(wrongRole.statusCode).toBe(403);

    const approver2 = await login("approver-2-demo");
    const second = await post(`/governance/proposals/${proposalId}/sign`, approver2);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ signerCount: 2, status: "executed", state: { status: "Active", epoch: "3" } });
    expect(second.json().transactionHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(new Set(submittedSignatures[0])).toHaveLength(2);

    const approver3 = await login("approver-3-demo");
    const afterExecution = await post(`/governance/proposals/${proposalId}/sign`, approver3);
    expect(afterExecution.statusCode).toBe(409);
  });
});
