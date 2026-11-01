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
it('keeps repeated service work lists bounded and leaves cryptographic material in the individual call context',async()=>{
 const {default:Fastify}=await import('../../services/api/node_modules/fastify/fastify.js'),{registerServiceRoutes}=await import('../../services/api/src/service-routes.js'),{serviceFixture}=await import('./service-fixture.js');const f=await serviceFixture();
 await f.store.transact(f.institution.institutionId,async r=>{for(let n=0;n<100;n++){const id='old-attempt-'+n;r.serviceV3!.attempts[id]={...f.attempt,id,status:'failed',authorizationId:id,pbx:{bridgeId:'bridge',senderChannelId:'s',recipientChannelId:'r',senderEndpoint:'s',recipientEndpoint:'r',state:'ended',credentials:{sender:'encrypted-password'},reports:{sender:{callId:'call',sdp:'s'.repeat(16000),remoteSdp:'r'.repeat(16000),fingerprint:'fingerprint',proof:'proof'.repeat(4000)}},evidence:'e'.repeat(16000)}};r.serviceV3!.authorizations[id]={...f.authorization,jws:'signed-proof'.repeat(1000),serviceProofJws:'signed-service-proof'.repeat(1000),payload:{...f.authorization.payload,authorizationId:id,attemptId:id},cancelled:true};}});
 const app=Fastify();registerServiceRoutes(app,{authority:f.authority,store:f.store,actorFor:async()=>f.agent});try{const response=await app.inject({method:'GET',url:'/v3/workspace'});expect(response.statusCode).toBe(200);expect(Buffer.byteLength(response.body)).toBeLessThan(131072);const body=response.json();expect(body.attempts).toHaveLength(101);expect(body.attempts.some((a:Record<string,unknown>)=>a.pbx||a.lease||a.binding)).toBe(false);expect(body.authorizations.some((a:Record<string,unknown>)=>a.jws||a.serviceProofJws)).toBe(false);expect(body.credentials[0].jws).toBeUndefined();}finally{await app.close();}
});
