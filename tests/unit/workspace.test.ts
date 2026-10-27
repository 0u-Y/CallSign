import { expect, it } from "vitest";
import { workspaceFor, type InstitutionRecord } from "../../services/api/src/finals-model.js";
function record(): InstitutionRecord {
  // This projection fixture omits cryptographic fields: signing is tested by finals.test.ts.
  return {
    id: "bank", members: { alice: { role: "recipient" }, bob: { role: "recipient" }, agent: { role: "gateway", serviceDid: "service-a" }, approver: { role: "approver" }, staff: { role: "institution" } },
    policy: {}, services: { "service-a": {}, "service-b": {} },
    intents: {
      mine: { id: "mine", institutionId: "bank", agentId: "agent", serviceDid: "service-a", recipientId: "alice" },
      other: { id: "other", institutionId: "bank", agentId: "another-agent", serviceDid: "service-b", recipientId: "bob" },
      foreign: { id: "foreign", institutionId: "another-bank", agentId: "agent", serviceDid: "service-a", recipientId: "alice" },
    },
    attempts: { mine: { id: "try-mine", intentId: "mine", agentId: "agent" }, other: { id: "try-other", intentId: "other", agentId: "another-agent" } },
    authorizations: {
      mine: { payload: { institutionId: "bank", intentId: "mine", attemptId: "try-mine", recipientId: "alice", vcDigest: "vc-mine" } },
      other: { payload: { institutionId: "bank", intentId: "other", attemptId: "try-other", recipientId: "bob", vcDigest: "vc-other" } },
      malformed: { payload: { institutionId: "another-bank", intentId: "mine", attemptId: "try-mine", recipientId: "bob", vcDigest: "vc-other" } },
    },
    credentials: { "vc-mine": { vc: { credentialSubject: { id: "service-a" } } }, "vc-unused": { vc: { credentialSubject: { id: "service-a" } } }, "vc-other": { vc: { credentialSubject: { id: "service-b" } } } },
  } as unknown as InstitutionRecord;
}
it("returns only a recipient's attempts, approvals and referenced credentials", () => {
  const result = workspaceFor(record(), { userId: "alice", role: "recipient", institutionId: "bank" });
  expect(result.intents.map(x => x.id)).toEqual(["mine"]);
  expect(result.attempts.map(x => x.id)).toEqual(["try-mine"]);
  expect(result.authorizations).toHaveLength(1);
  expect(result.credentials.map(x => x.digest)).toEqual(["vc-mine"]);
  expect(result.services).toEqual([]);
});
it("limits agents to the currently affiliated service and assigned work", () => {
  const r = record(); const actor = { userId: "agent", role: "gateway", institutionId: "bank" };
  expect(workspaceFor(r, actor).credentials.map(c => c.digest)).toEqual(["vc-mine", "vc-unused"]);
  r.members.agent!.serviceDid = "service-b";
  const result = workspaceFor(r, actor); expect(result.intents).toEqual([]); expect(result.credentials).toEqual([]); expect(result.authorizations).toEqual([]);
});
it("does not expose personal work or credentials to a joint approver", () => {
  const result = workspaceFor(record(), { userId: "approver", role: "approver", institutionId: "bank" });
  expect(result.intents).toEqual([]); expect(result.attempts).toEqual([]); expect(result.authorizations).toEqual([]); expect(result.credentials).toEqual([]);
});
it("checks institution membership even when called outside the HTTP route", () => {
  expect(() => workspaceFor(record(), { userId: "alice", role: "recipient", institutionId: "another-bank" })).toThrow("OBJECT_FORBIDDEN");
  expect(() => workspaceFor(record(), { userId: "alice", role: "institution", institutionId: "bank" })).toThrow("OBJECT_FORBIDDEN");
});
