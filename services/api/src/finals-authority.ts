import { randomUUID } from "node:crypto";
import { importJWK } from "jose";
import {
  authorizationV2Schema, bindingV2Schema, hashCanonical, permitSchema, policyHash, possessionSchema, publicKeySchema,
  receiptV2Schema, signPayload, verifyPayload, signDelegationVc, verifyDelegationVc, vcDigest, assertTemporalValidity,
  type SessionPermit, type SigningKeyPair, type BindingV2,
} from "@callsign/protocol";
import type { DidDocument } from "./did.js";
import { HttpError } from "./auth.js";
import { activeIntent, importMockFds, membership, type Actor, type AuthorityStore, type InstitutionRecord } from "./finals-model.js";

export interface AuthorityOptions {
  store: AuthorityStore; networkId: string; registryAddress: string;
  signingKey(version: number): Promise<Pick<SigningKeyPair, "privateKey" | "kid"> & { publicJwk?: SigningKeyPair["publicJwk"] }>;
  assertRotation?: (record: InstitutionRecord, publicKey: SigningKeyPair["publicJwk"], epoch: string) => Promise<void>;
  resolveDid(did: string): Promise<DidDocument>;
  assertCurrent(record: InstitutionRecord, credentialId: string): Promise<void>;
  now?: () => number;
}
export class FinalsAuthority {
  constructor(private readonly options: AuthorityOptions) {}
  private now() { return this.options.now?.() ?? Math.floor(Date.now() / 1000); }
  private base() { return { protocol: "callsign" as const, version: 2 as const, networkId: this.options.networkId, registryAddress: this.options.registryAddress }; }
  private event(r: InstitutionRecord, actor: Actor, event: string, objectId: string) { r.audit.push({ id: randomUUID(), event, objectId, actor: actor.userId, at: this.now() }); }
  private async key(r: InstitutionRecord) {
    const key = await this.options.signingKey(r.approvalKeyVersion);
    if (key.kid !== r.approvalKid || (key.publicJwk && hashCanonical(key.publicJwk) !== hashCanonical(r.approvalPublicKey))) throw new HttpError(503, "ISSUER_KEY_VERSION_UNAVAILABLE");
    return key;
  }
  private async assertDid(r: InstitutionRecord, serviceDid: string) {
    const service = r.services[serviceDid]; if (!service) throw new HttpError(409, "SERVICE_UNREGISTERED");
    for (const [did, kid, jwk, relation] of [[r.did, r.approvalKid, r.approvalPublicKey, "assertionMethod"], [service.did, service.kid, service.publicKey, "authentication"]] as const) {
      const doc = await this.options.resolveDid(did);
      const method = doc.verificationMethod.find(key => key.id === kid);
      if (doc.id !== did || !method || method.controller !== did || !doc[relation].includes(kid) || hashCanonical(method.publicKeyJwk) !== hashCanonical(jwk)) throw new HttpError(409, "REGISTERED_DID_KEY_MISMATCH");
    }
  }
  private async credential(r: InstitutionRecord, digest: string, serviceDid: string) {
    const item = r.credentials[digest];
    if (!item || item.revoked) throw new HttpError(409, "VC_REVOKED_OR_UNKNOWN");
    await this.assertDid(r, serviceDid);
    const vc = await verifyDelegationVc(item.jws, await importJWK(r.approvalPublicKey, "EdDSA"), r.approvalKid);
    const service = r.services[serviceDid];
    const status = vc.credentialStatus; const subject = vc.credentialSubject;
    if (vcDigest(vc) !== digest || vc.issuer !== r.did || subject.institutionId !== r.id || subject.id !== serviceDid || subject.controller !== serviceDid || !service?.active || subject.serviceKeyVersion !== service.keyVersion || hashCanonical(subject.publicKey) !== hashCanonical(service.publicKey) || subject.policyHash !== policyHash(r.policy) || subject.purpose !== r.policy.purpose || status.id !== vc.id || status.epoch !== r.epoch || status.approvalKeyVersion !== r.approvalKeyVersion || status.networkId !== this.options.networkId || status.registryAddress !== this.options.registryAddress || Date.parse(vc.validFrom) > this.now() * 1000 || Date.parse(vc.validUntil) <= this.now() * 1000) throw new HttpError(409, "VC_CONTEXT_INVALID");
    await this.options.assertCurrent(r, digest);
    return { vc, service };
  }
  createIntent(actor: Actor, input: unknown) {
    return this.options.store.transact(actor.institutionId, async r => { const intent = importMockFds(r, actor, input, this.now()); this.event(r, actor, "intent.created", intent.id); return intent; });
  }
  createAttempt(actor: Actor, intentId: string) {
    return this.options.store.transact(actor.institutionId, async r => {
      membership(r, actor, ["gateway"]); const intent = activeIntent(r, intentId, actor, this.now());
      const attempt = { id: randomUUID(), intentId, sessionId: randomUUID(), agentId: actor.userId, status: "created" as const, expiresAt: Math.min(intent.expiresAt, this.now() + 300) };
      r.attempts[attempt.id] = attempt; this.event(r, actor, "attempt.created", attempt.id); return attempt;
    });
  }
  issueCredential(actor: Actor, serviceDid: string) {
    return this.options.store.transact(actor.institutionId, async r => {
      membership(r, actor, ["institution"]);
      const service = r.services[serviceDid];
      if (r.status !== "active" || !service?.active) throw new HttpError(409, "SERVICE_INACTIVE");
      await this.assertDid(r, serviceDid);
      const credentialId = `urn:uuid:${randomUUID()}`;
      const vc = { "@context": ["https://www.w3.org/ns/credentials/v2", { "@vocab": "urn:callsign:v2:" }],
        id: credentialId, type: ["VerifiableCredential", "DelegationCredential"], issuer: r.did,
        validFrom: new Date(this.now() * 1000).toISOString(), validUntil: new Date((this.now() + 3600) * 1000).toISOString(),
        credentialSubject: { id: serviceDid, institutionId: r.id, controller: serviceDid, serviceKeyVersion: service.keyVersion, publicKey: publicKeySchema.parse(service.publicKey), purpose: r.policy.purpose, policyHash: policyHash(r.policy) },
        credentialStatus: { id: credentialId, type: "CallSignRegistryStatus", ...{ networkId: this.options.networkId, registryAddress: this.options.registryAddress }, epoch: r.epoch, approvalKeyVersion: r.approvalKeyVersion } };
      const parsed = (await import("@callsign/protocol")).delegationVcSchema.parse(vc);
      const item = { vc: parsed, jws: await signDelegationVc(parsed, await this.key(r)), revoked: false };
      r.credentials[vcDigest(parsed)] = item; this.event(r, actor, "vc.issued.pending-ledger", credentialId);
      return { ...item, digest: vcDigest(parsed), ledgerRegistrationRequired: true };
    });
  }
  permitContext(actor: Actor, input: { attemptId: string; vcDigest: string; browserPublicKey: unknown; serviceDid: string }): Promise<SessionPermit> {
    return this.options.store.transact(actor.institutionId, async r => {
      membership(r, actor, ["gateway"]);
      const attempt = r.attempts[input.attemptId];
      if (!attempt || attempt.agentId !== actor.userId || attempt.status !== "created" || attempt.expiresAt <= this.now()) throw new HttpError(409, "ATTEMPT_INVALID");
      const intent = activeIntent(r, attempt.intentId, actor, this.now());
      if (intent.serviceDid !== input.serviceDid) throw new HttpError(403, "SERVICE_MISMATCH");
      const { service } = await this.credential(r, input.vcDigest, intent.serviceDid);
      return permitSchema.parse({ ...this.base(), type: "SenderSessionPermit", institutionId: r.id, intentId: intent.id, attemptId: attempt.id, agentId: actor.userId,
        serviceDid: service.did, serviceKeyVersion: service.keyVersion, browserPublicKey: publicKeySchema.parse(input.browserPublicKey), sessionId: attempt.sessionId,
        policyHash: intent.policyHash, vcDigest: input.vcDigest, issuedAt: this.now(), expiresAt: Math.min(this.now() + 60, attempt.expiresAt) });
    });
  }
  authorize(actor: Actor, permitJws: string, credentialDigest: string) {
    return this.options.store.transact(actor.institutionId, async r => {
      membership(r, actor, ["gateway"]);
      const item = r.credentials[credentialDigest];
      if (!item) throw new HttpError(404, "VC_NOT_FOUND");
      const { service } = await this.credential(r, credentialDigest, item.vc.credentialSubject.id);
      const permit = await verifyPayload(permitJws, await importJWK(service.publicKey, "EdDSA"), { type: "SenderSessionPermit", kid: service.kid, schema: permitSchema });
      assertTemporalValidity(permit, this.now());
      const attempt = r.attempts[permit.attemptId];
      if (!attempt || attempt.status !== "created" || attempt.expiresAt <= this.now() || attempt.agentId !== actor.userId) throw new HttpError(409, "ATTEMPT_INVALID");
      const intent = activeIntent(r, attempt.intentId, actor, this.now());
      if (permit.networkId !== this.options.networkId || permit.registryAddress !== this.options.registryAddress || permit.institutionId !== r.id || permit.agentId !== actor.userId || permit.intentId !== intent.id || permit.sessionId !== attempt.sessionId || permit.serviceDid !== intent.serviceDid || permit.serviceKeyVersion !== service.keyVersion || permit.vcDigest !== credentialDigest || permit.policyHash !== intent.policyHash || permit.expiresAt - permit.issuedAt > 60) throw new HttpError(409, "PERMIT_CONTEXT_INVALID");
      const payload = authorizationV2Schema.parse({ ...this.base(), type: "ContactAuthorization", authorizationId: randomUUID(), institutionId: r.id, issuerDid: r.did, approvalKeyVersion: r.approvalKeyVersion, epoch: r.epoch,
        intentId: intent.id, attemptId: attempt.id, recipientId: intent.recipientId, purpose: intent.purpose, policyHash: intent.policyHash, vcDigest: credentialDigest, permitHash: hashCanonical(permit), sessionId: attempt.sessionId, browserKeyHash: hashCanonical(permit.browserPublicKey), issuedAt: this.now(), expiresAt: Math.min(attempt.expiresAt, permit.expiresAt) });
      const jws = await signPayload(payload, await this.key(r));
      r.authorizations[payload.authorizationId] = { payload, jws, cancelled: false }; attempt.status = "authorized";
      this.event(r, actor, "authorization.issued", payload.authorizationId); return { payload, jws, permitJws };
    });
  }
  enroll(actor: Actor, sessionId: string, publicKey: unknown) {
    return this.options.store.transact(actor.institutionId, async r => {
      membership(r, actor, ["recipient"]);
      const attempt = Object.values(r.attempts).find(a => a.sessionId === sessionId);
      if (!attempt || attempt.expiresAt <= this.now() || ["cancelled", "ended"].includes(attempt.status) || activeIntent(r, attempt.intentId, actor, this.now()).recipientId !== actor.userId) throw new HttpError(404, "SESSION_NOT_FOUND");
      const parsed = publicKeySchema.parse(publicKey); const prior = r.recipientKeys[sessionId];
      if (prior && hashCanonical(prior.publicKey) !== hashCanonical(parsed)) throw new HttpError(409, "RECIPIENT_KEY_ALREADY_BOUND");
      r.recipientKeys[sessionId] = { userId: actor.userId, publicKey: parsed, expiresAt: attempt.expiresAt }; return { sessionId, keyHash: hashCanonical(parsed) };
    });
  }
  consume(actor: Actor, input: { authorizationId: string; binding: BindingV2; senderProof: string; recipientProof: string; permitJws: string }) {
    return this.options.store.transact(actor.institutionId, async r => {
      membership(r, actor, ["recipient"]);
      const auth = r.authorizations[input.authorizationId]; const binding = bindingV2Schema.parse(input.binding);
      if (!auth) throw new HttpError(404, "AUTHORIZATION_NOT_FOUND");
      const a = auth.payload; const attempt = r.attempts[a.attemptId];
      const intent = activeIntent(r, a.intentId, actor, this.now());
      if (auth.cancelled || !attempt || !["authorized", "consumed"].includes(attempt.status) || a.approvalKeyVersion !== r.approvalKeyVersion || a.epoch !== r.epoch) throw new HttpError(409, "AUTHORIZATION_INVALID");
      const { service } = await this.credential(r, a.vcDigest, intent.serviceDid);
      const permit = await verifyPayload(input.permitJws, await importJWK(service.publicKey, "EdDSA"), { type: "SenderSessionPermit", kid: service.kid, schema: permitSchema });
      const enrolled = r.recipientKeys[a.sessionId];
      if (!enrolled || enrolled.userId !== actor.userId || enrolled.expiresAt <= this.now()) throw new HttpError(409, "RECIPIENT_KEY_UNAVAILABLE");
      const bindingHash = hashCanonical(binding);
      if (hashCanonical(permit) !== a.permitHash || hashCanonical(permit.browserPublicKey) !== a.browserKeyHash || binding.authorizationHash !== hashCanonical(a) || binding.sessionId !== a.sessionId || binding.recipientId !== actor.userId || binding.recipientKeyHash !== hashCanonical(enrolled.publicKey) || binding.networkId !== a.networkId || binding.registryAddress !== a.registryAddress || binding.transportProfile !== "webrtc-bundle-v2") throw new HttpError(409, "BINDING_CONTEXT_INVALID");
      for (const [role, jws, jwk] of [["sender", input.senderProof, permit.browserPublicKey], ["recipient", input.recipientProof, enrolled.publicKey]] as const) {
        const proof = await verifyPayload(jws, await importJWK(jwk, "EdDSA"), { type: "PossessionProof", kid: hashCanonical(jwk), schema: possessionSchema });
        assertTemporalValidity(proof, this.now());
        if (proof.expiresAt - proof.issuedAt > 60 || proof.role !== role || proof.authorizationId !== a.authorizationId || proof.bindingHash !== bindingHash || proof.sessionId !== a.sessionId || proof.networkId !== a.networkId || proof.registryAddress !== a.registryAddress) throw new HttpError(409, "POSSESSION_CONTEXT_INVALID");
      }
      const prior = r.consumptions[a.authorizationId];
      if (prior) {
        if (prior.payload.bindingHash !== bindingHash) throw new HttpError(409, "AUTHORIZATION_ALREADY_CONSUMED");
        return { ...prior, replay: true };
      }
      assertTemporalValidity(a, this.now()); assertTemporalValidity(binding, this.now()); assertTemporalValidity(permit, this.now());
      const payload = receiptV2Schema.parse({ ...this.base(), type: "ConsumptionReceipt", authorizationId: a.authorizationId, authorizationHash: hashCanonical(a), bindingHash, sessionId: a.sessionId, recipientId: a.recipientId, approvalKeyVersion: r.approvalKeyVersion, consumedAt: this.now(), expiresAt: Math.min(attempt.expiresAt, this.now() + 60) });
      const result = { payload, jws: await signPayload(payload, await this.key(r)) };
      r.consumptions[a.authorizationId] = result; attempt.status = "consumed";
      this.event(r, actor, "authorization.consumed", a.authorizationId); return { ...result, replay: false };
    });
  }
  cancel(actor: Actor, intentId: string) {
    return this.options.store.transact(actor.institutionId, async r => {
      membership(r, actor, ["institution"]);
      if (!r.intents[intentId]) throw new HttpError(404, "INTENT_NOT_FOUND");
      r.intents[intentId]!.status = "cancelled";
      for (const attempt of Object.values(r.attempts)) if (attempt.intentId === intentId && attempt.status !== "ended") attempt.status = "cancelled";
      for (const auth of Object.values(r.authorizations)) if (auth.payload.intentId === intentId) auth.cancelled = true;
      this.event(r, actor, "intent.cancelled", intentId); return { cancelled: true };
    });
  }
  end(actor: Actor, attemptId: string) {
    return this.options.store.transact(actor.institutionId, async r => {
      const attempt = r.attempts[attemptId]; if (!attempt) throw new HttpError(404, "ATTEMPT_NOT_FOUND");
      activeIntent(r, attempt.intentId, actor, this.now()); attempt.status = "ended";
      this.event(r, actor, "attempt.ended", attemptId); return { ended: true };
    });
  }
  activateKey(actor: Actor, version: number, epoch: string) {
    return this.options.store.transact(actor.institutionId, async r => {
      membership(r, actor, ["institution"]);
      if (!Number.isInteger(version) || version !== r.approvalKeyVersion + 1 || BigInt(epoch) <= BigInt(r.epoch) || !this.options.assertRotation) throw new HttpError(409, "KEY_ROTATION_INVALID");
      const key = await this.options.signingKey(version);
      if (!key.publicJwk || key.publicJwk.x === r.approvalPublicKey.x) throw new HttpError(409, "NEW_APPROVAL_KEY_REQUIRED");
      await this.options.assertRotation(r, key.publicJwk, epoch);
      r.approvalKeyVersion = version; r.approvalKid = key.kid; r.approvalPublicKey = key.publicJwk; r.epoch = epoch; r.status = "active";
      for (const item of Object.values(r.credentials)) item.revoked = true;
      for (const item of Object.values(r.authorizations)) item.cancelled = true;
      for (const item of Object.values(r.attempts)) if (item.status !== "ended") item.status = "cancelled";
      this.event(r, actor, "approval-key.rotated", key.kid); return { version, epoch, kid: key.kid, trustBundleRebuildRequired: true };
    });
  }
  revoke(actor: Actor, digest: string) {
    return this.options.store.transact(actor.institutionId, async r => {
      membership(r, actor, ["institution"]); const item = r.credentials[digest];
      if (!item) throw new HttpError(404, "VC_NOT_FOUND"); item.revoked = true;
      for (const auth of Object.values(r.authorizations)) if (auth.payload.vcDigest === digest) { auth.cancelled = true; const attempt = r.attempts[auth.payload.attemptId]; if (attempt && attempt.status !== "ended") attempt.status = "cancelled"; }
      this.event(r, actor, "vc.revoked", digest); return { revoked: true, ledgerRevocationRequired: true };
    });
  }
}
