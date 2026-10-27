import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { bankPolicy, importEd25519PublicJwk, generateEd25519KeyPair, hashCanonical, signPayload, verifyDelegationVc, policyHash, vcDigest, authorizationV2Schema, contactAuthorizationSchema } from "../../packages/protocol/src/index.js";
import { FinalsAuthority } from "../../services/api/src/finals-authority.js";
import type { Actor, AuthorityStore, InstitutionRecord } from "../../services/api/src/finals-model.js";
import { DidResolver } from "../../services/api/src/did.js";
import { finalsEnvironmentSchema } from "../../services/api/src/finals-config.js";
import { liveAttemptFor } from "../../services/api/src/finals-model.js";

async function fixture() {
  const issuer = await generateEd25519KeyPair(), sender = await generateEd25519KeyPair(), browser = await generateEd25519KeyPair(), recipient = await generateEd25519KeyPair();
  issuer.kid = `did:web:bank.example#${issuer.kid}`; sender.kid = `did:web:sender.example#${sender.kid}`;
  const institution: Actor = { userId: "staff", role: "institution", institutionId: "mock-bank-institution" };
  const agent: Actor = { userId: "agent", role: "gateway", institutionId: institution.institutionId };
  const receiver: Actor = { userId: "recipient", role: "recipient", institutionId: institution.institutionId };
  let state: InstitutionRecord = { id: institution.institutionId, did: "did:web:bank.example", epoch: "1", approvalKeyVersion: 1, approvalKid: issuer.kid, approvalPublicKey: issuer.publicJwk, status: "active", policy: bankPolicy,
    services: { "did:web:sender.example": { did: "did:web:sender.example", kid: sender.kid, publicKey: sender.publicJwk, keyVersion: 1, active: true } }, members: { staff: { role: "institution" }, agent: { role: "gateway", serviceDid: "did:web:sender.example" }, recipient: { role: "recipient" }, other: { role: "gateway", serviceDid: "did:web:sender.example" } }, intents: {}, attempts: {}, credentials: {}, authorizations: {}, consumptions: {}, recipientKeys: {}, audit: [] };
  // Sequential fake with rollback. This exercises transitions, not PostgreSQL isolation.
  const store: AuthorityStore = { read: async () => structuredClone(state), transact: async (_id, op) => { const draft = structuredClone(state); const result = await op(draft); state = draft; return result; } };
  const keys = new Map([[1, issuer]]); const rotation = vi.fn(async () => {});
  const current = vi.fn(async () => {}); let now = 1800000000;
  const authority = new FinalsAuthority({ resolveDid: async did => {
    const key = did === "did:web:bank.example" ? issuer : sender;
    return { id: did, verificationMethod: [{ id: key.kid, controller: did, type: "JsonWebKey2020", publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: key.publicJwk.x! } }], assertionMethod: [key.kid], authentication: [key.kid] };
  }, store, networkId: "20260914", registryAddress: "0x1111111111111111111111111111111111111111", signingKey: async version => keys.get(version)!, assertRotation: rotation, assertCurrent: current, now: () => now });
  const intentInput = { id: "fds-case", recipientId: "recipient", agentId: "agent", serviceDid: "did:web:sender.example", expiresAt: now + 600 };
  await authority.createIntent(institution, intentInput); const credential = await authority.issueCredential(institution, intentInput.serviceDid);
  const attempt = await authority.createAttempt(agent, intentInput.id);
  const permit = await authority.permitContext(agent, { attemptId: attempt.id, vcDigest: credential.digest, browserPublicKey: browser.publicJwk, serviceDid: intentInput.serviceDid });
  const permitJws = await signPayload(permit, sender);
  const authorization = await authority.authorize(agent, permitJws, credential.digest);
  await authority.enroll(receiver, attempt.sessionId, recipient.publicJwk);
  const binding = { protocol: "callsign" as const, version: 2 as const, networkId: permit.networkId, registryAddress: permit.registryAddress, type: "SessionBinding" as const, authorizationHash: hashCanonical(authorization.payload), sessionId: attempt.sessionId, recipientId: receiver.userId, recipientNonce: "fresh-nonce", recipientKeyHash: hashCanonical(recipient.publicJwk), gatewayFingerprint: "AA:".repeat(31) + "AA", receiverFingerprint: "BB:".repeat(31) + "BB", offerSdpHash: "a".repeat(64), answerSdpHash: "b".repeat(64), transportProfile: "webrtc-bundle-v2" as const, issuedAt: now, expiresAt: now + 60 };
  const makeInput = async (b = binding) => {
    const proof = { protocol: "callsign", version: 2, networkId: permit.networkId, registryAddress: permit.registryAddress, type: "PossessionProof", authorizationId: authorization.payload.authorizationId, bindingHash: hashCanonical(b), sessionId: attempt.sessionId, issuedAt: now, expiresAt: now + 60 };
    return { authorizationId: authorization.payload.authorizationId, binding: b, permitJws, senderProof: await signPayload({ ...proof, role: "sender" }, { privateKey: browser.privateKey, kid: hashCanonical(browser.publicJwk) }), recipientProof: await signPayload({ ...proof, role: "recipient" }, { privateKey: recipient.privateKey, kid: hashCanonical(recipient.publicJwk) }) };
  };
  return { issuer, sender, browser, recipient, keys, rotation, authority, store, institution, agent, receiver, credential, authorization, attempt, permit, binding, makeInput, current, intentInput, setTime: (t: number) => { now = t; } };
}
describe("finals authority boundaries", () => {
  it("signs a real VC payload, preserves v1 and rejects version confusion", async () => {
    const f = await fixture(); const vc = await verifyDelegationVc(f.credential.jws, await importEd25519PublicJwk(f.issuer.publicJwk), f.issuer.kid);
    expect(vc.credentialSubject.id).toBe("did:web:sender.example"); expect(vcDigest(vc)).toBe(f.credential.digest);
    expect(contactAuthorizationSchema.safeParse(f.authorization.payload).success).toBe(false);
    expect(authorizationV2Schema.safeParse({ ...f.authorization.payload, version: 1 }).success).toBe(false);
  });
  it("enforces institution, recipient, assignee and immutable input scope", async () => {
    const f = await fixture();
    await expect(f.authority.createAttempt({ ...f.agent, userId: "other" }, f.intentInput.id)).rejects.toThrow("INTENT_NOT_FOUND");
    await expect(f.authority.createAttempt({ ...f.agent, institutionId: "another-bank" }, f.intentInput.id)).rejects.toThrow("OBJECT_FORBIDDEN");
    await expect(f.authority.createIntent(f.institution, { ...f.intentInput, id: "other-case", recipientId: "unknown" })).rejects.toThrow("FDS_ASSIGNMENT_INVALID");
    await expect(f.authority.createIntent(f.institution, { ...f.intentInput, id: "other-case", purpose: "CHANGE" })).rejects.toThrow();
    await expect(f.authority.enroll({ ...f.receiver, userId: "other" }, f.attempt.sessionId, f.recipient.publicJwk)).rejects.toThrow("OBJECT_FORBIDDEN");
  });
  it("requires both key possession proofs, retries the same result and rejects a different binding", async () => {
    const f = await fixture(); const input = await f.makeInput();
    await expect(f.authority.consume(f.receiver, { ...input, senderProof: input.recipientProof })).rejects.toThrow();
    const first = await f.authority.consume(f.receiver, input); const retry = await f.authority.consume(f.receiver, input);
    expect(first.replay).toBe(false); expect(retry.replay).toBe(true); expect(retry.jws).toBe(first.jws);
    await expect(f.authority.consume(f.receiver, await f.makeInput({ ...f.binding, recipientNonce: "changed-nonce" }))).rejects.toThrow("AUTHORIZATION_ALREADY_CONSUMED");
    expect(f.current).toHaveBeenCalledTimes(6);
  });
  it("rejects cancellation, revocation, key rotation, purpose change and expired work at acceptance", async () => {
    for (const change of ["cancel", "revoke", "rotate", "policy", "expire"]) {
      const f = await fixture(); const input = await f.makeInput();
      if (change === "cancel") await f.authority.cancel(f.institution, f.intentInput.id);
      if (change === "revoke") await f.authority.revoke(f.institution, f.credential.digest);
      if (change === "rotate") await f.store.transact(f.institution.institutionId, async r => { r.approvalKeyVersion++; });
      if (change === "policy") await f.store.transact(f.institution.institutionId, async r => { r.policy.version++; });
      if (change === "expire") f.setTime(f.intentInput.expiresAt);
      await expect(f.authority.consume(f.receiver, input)).rejects.toThrow();
    }
  });
  it("rejects copied VC without an authorized sender signature", async () => {
    const f = await fixture(); const attempt = await f.authority.createAttempt(f.agent, f.intentInput.id);
    const permit = await f.authority.permitContext(f.agent, { attemptId: attempt.id, vcDigest: f.credential.digest, browserPublicKey: f.browser.publicJwk, serviceDid: "did:web:sender.example" });
    await expect(f.authority.authorize(f.agent, await signPayload(permit, f.browser), f.credential.digest)).rejects.toThrow();
  });
});
describe("DID and public configuration", () => {
  it("pins remote DID URLs and rejects unknown or oversized documents", async () => {
    const fake = vi.fn(async () => Response.json({ id: "did:web:evil.example" }));
    await expect(new DidResolver({}, {}, fake).resolve("did:web:evil.example")).rejects.toThrow("DID_NOT_TRUSTED"); expect(fake).not.toHaveBeenCalled();
    await expect(new DidResolver({}, { "did:web:bank.example": "https://bank.example/.well-known/did.json" }, async () => new Response("x".repeat(32769))).resolve("did:web:bank.example")).rejects.toThrow("DID_DOCUMENT_TOO_LARGE");
  });
  it("refuses public demo controls and HTTP origins", () => {
    const env = { SERVICE_ROLE: "platform", WEB_ORIGIN: "http://bank.example", PUBLIC_DEPLOYMENT: "true", PLATFORM_INTERNAL_TOKEN: "a".repeat(32), SENDER_INTERNAL_TOKEN: "b".repeat(32), ISSUER_URL: "http://issuer:4101", SENDER_URL: "http://sender:4102", INSTITUTION_ID: "mock-bank-institution", NETWORK_ID: "20260914", REGISTRY_ADDRESS: "0x1111111111111111111111111111111111111111", TRUST_BUNDLE_PATH: "/trust.json" };
    expect(finalsEnvironmentSchema.safeParse(env).success).toBe(false);
    expect(finalsEnvironmentSchema.safeParse({ ...env, WEB_ORIGIN: "https://bank.example", DEMO_MODE: "true" }).success).toBe(false);
    expect(finalsEnvironmentSchema.safeParse({ ...env, WEB_ORIGIN: "https://bank.example", PUBLIC_DEPLOYMENT: "false" }).success).toBe(false);
  });
});

it("pins policy hash with independent RFC 8785 compatible vector bytes", () => {
  expect(policyHash(bankPolicy)).toBe("c1d35d7fb9752b9994ee24791c47d1724504a0c80eedb780a06e7df00df36dc5");
});

it("verifies the receiver package itself and rejects forged status, unsupported transport and a changed receipt", async () => {
  const f = await fixture(); const { verifyFinalsPackage, MonotonicStateGuard } = await import("../../packages/verifier/src/index.js");
  const { hashSdp } = await import("../../packages/protocol/src/index.js");
  const localSdp = `v=0\r\na=fingerprint:sha-256 ${f.binding.receiverFingerprint}\r\n`;
  const remoteSdp = `v=0\r\na=fingerprint:sha-256 ${f.binding.gatewayFingerprint}\r\n`;
  const binding = { ...f.binding, offerSdpHash: hashSdp(remoteSdp), answerSdpHash: hashSdp(localSdp) };
  const consumed = await f.authority.consume(f.receiver, await f.makeInput(binding));
  const witnesses = await Promise.all([1,2,3,4].map(() => generateEd25519KeyPair()));
  const snapshot = { protocol: "callsign", version: 1, type: "SignedStateSnapshot", networkId: f.permit.networkId, registryAddress: f.permit.registryAddress, genesisHash: `0x${"1".repeat(64)}`, policyVersion: "1", blockNumber: "42", blockHash: `0x${"2".repeat(64)}`, blockTimestamp: 1800000000, institutionId: f.institution.institutionId, delegationId: f.credential.digest,
    institutionState: { exists: true, status: "Active", epoch: "1", approvalPublicKey: `0x${Buffer.from(f.issuer.publicJwk.x!, "base64url").toString("hex")}`, policyVersion: "1" }, delegationState: { exists: true, epoch: "1", gatewayPublicKey: `0x${Buffer.from(f.sender.publicJwk.x!, "base64url").toString("hex")}`, purposeMask: "4", validFrom: 1799999990, validUntil: 1800000300, revoked: false }, directoryHash: `0x${"3".repeat(64)}`, directoryVersion: "1" } as const;
  const chain = { networkId: snapshot.networkId, registryAddress: snapshot.registryAddress, genesisHash: snapshot.genesisHash, policyVersion: "1", witnessThreshold: 3, witnessPublicKeys: witnesses.map((k,i) => ({ witnessId: `w${i}`, kid: k.kid, jwk: k.publicJwk })), enrollmentPublicKey: f.issuer.publicJwk, supportedProtocolVersions: [1,2] };
  const state = { snapshot, signatures: await Promise.all(witnesses.slice(0,3).map(async (k,i) => ({ witnessId: `w${i}`, jws: await signPayload(snapshot,k) }))) };
  const status = { protocol: "callsign", version: 2, networkId: snapshot.networkId, registryAddress: snapshot.registryAddress, type: "AuthorizationStatus", authorizationId: f.authorization.payload.authorizationId, bindingHash: hashCanonical(binding), nonce: "independent-browser-status-nonce", status: "consumed", approvalKeyVersion: 1, issuedAt: 1800000000, expiresAt: 1800000005 };
  const input = { authorizationJws: f.authorization.jws, vcJws: f.credential.jws, permitJws: (await f.makeInput(binding)).permitJws, receiptJws: consumed.jws, statusJws: await signPayload(status,f.issuer), statusNonce: String(status.nonce), binding, policy: bankPolicy,
    trust: { issuerDid: "did:web:bank.example", issuerKid: f.issuer.kid, issuerPublicKey: f.issuer.publicJwk, serviceDid: "did:web:sender.example", serviceKid: f.sender.kid, servicePublicKey: f.sender.publicJwk, approvalKeyVersion: 1, serviceKeyVersion: 1, chain }, state, recipientId: f.receiver.userId, sessionId: f.attempt.sessionId, localSdp, remoteSdp, recipientPublicKey: f.recipient.publicJwk, now: 1800000000, monotonicMs: 100,
    observedTransport: { profile: "chromium-dtls-certificate-v1", remoteFingerprint: binding.gatewayFingerprint, dataChannelBindingHash: hashCanonical(binding), connected: true }, guard: new MonotonicStateGuard() };
  expect((await verifyFinalsPackage(input)).bindingHash).toBe(hashCanonical(binding));
  await expect(verifyFinalsPackage({ ...input, statusJws: await signPayload({ ...status, status: "cancelled" },f.issuer) })).rejects.toThrow("AUTHORIZATION_STATUS_INVALID");
  await expect(verifyFinalsPackage({ ...input, observedTransport: { ...input.observedTransport, profile: "unsupported" } })).rejects.toThrow("TRANSPORT_UNVERIFIABLE");
  await expect(verifyFinalsPackage({ ...input, receiptJws: await signPayload({ ...consumed.payload, sessionId: "different-session" }, f.issuer) })).rejects.toThrow("BINDING_CONTEXT_INVALID");
});

it("activates a different key only after the ledger check and invalidates old credentials and authorizations", async () => {
  const f = await fixture(); const next = await generateEd25519KeyPair(); next.kid = `did:web:bank.example#${next.kid}`; f.keys.set(2, next);
  await expect(f.authority.activateKey(f.institution, 2, "1")).rejects.toThrow("KEY_ROTATION_INVALID");
  const result = await f.authority.activateKey(f.institution, 2, "2"); expect(result.version).toBe(2); expect(f.rotation).toHaveBeenCalledOnce();
  const record = await f.store.read(f.institution.institutionId); expect(record.approvalPublicKey.x).toBe(next.publicJwk.x); expect(record.credentials[f.credential.digest]?.revoked).toBe(true); expect(record.authorizations[f.authorization.payload.authorizationId]?.cancelled).toBe(true);
});

it("withdraws a consumed authorization when cancellation commits later", async () => {
  const f = await fixture(); const input = await f.makeInput(); await f.authority.consume(f.receiver, input);
  await f.authority.cancel(f.institution, f.intentInput.id);
  await expect(f.authority.consume(f.receiver, input)).rejects.toThrow("INTENT_NOT_ACTIVE");
});

it("rechecks live-call authority independently of the intent and attempt status", async () => {
  const f = await fixture();
  const state = await f.store.read(f.institution.institutionId);
  expect(liveAttemptFor(state, f.agent, f.attempt.id, 1800000000).attempt.id).toBe(f.attempt.id);
  for (const change of [
    (r: InstitutionRecord) => { r.authorizations[f.authorization.payload.authorizationId]!.cancelled = true; },
    (r: InstitutionRecord) => { r.credentials[f.credential.digest]!.revoked = true; },
    (r: InstitutionRecord) => { r.epoch = "2"; },
    (r: InstitutionRecord) => { r.approvalKeyVersion = 2; },
    (r: InstitutionRecord) => { r.services[f.intentInput.serviceDid]!.active = false; },
    (r: InstitutionRecord) => { r.services[f.intentInput.serviceDid]!.keyVersion++; },
    (r: InstitutionRecord) => { r.credentials[f.credential.digest]!.vc.validUntil = new Date(1799999999*1000).toISOString(); },
  ]) {
    const altered = structuredClone(state); change(altered);
    expect(() => liveAttemptFor(altered, f.agent, f.attempt.id, 1800000000)).toThrow();
  }
  expect(() => liveAttemptFor(state, f.receiver, f.attempt.id, 1800000000, true)).toThrow("CALL_CONTEXT_INVALID");
  await f.authority.consume(f.receiver, await f.makeInput());
  expect(liveAttemptFor(await f.store.read(f.institution.institutionId), f.receiver, f.attempt.id, 1800000000, true).attempt.status).toBe("consumed");
});

it("pins the whole VC payload digest to independently computed fixture bytes", () => {
  const vector = JSON.parse(readFileSync(new URL("../fixtures/finals-vc-vector.json", import.meta.url), "utf8"));
  expect(vcDigest(vector.credential)).toBe(vector.sha256);
});
