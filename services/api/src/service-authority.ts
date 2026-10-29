import { randomUUID } from "node:crypto";
import { importJWK, type JWK } from "jose";
import { assertTemporalValidity, hashCanonical, policyHash, publicKeySchema, registeredUriSchema, serviceBindingSchema, pbxEvidenceSchema, serviceCredentialDigest, serviceLeaseSchema, servicePolicy, servicePossessionSchema, serviceProofSchema, serviceReceiptSchema, signPayload, signServiceCredential, startAuthorizationSchema, verifyPayload, verifyServiceCredential, renewalProofSchema, runtimePolicySchema, type RuntimePolicy, type ServiceBinding, type SigningKeyPair } from "@callsign/protocol";
import { HttpError } from "./auth.js";
import { activeIntent, importMockFds, membership, requirePermission, type Actor, type AuthorityStore, type InstitutionRecord } from "./finals-model.js";
import { terminal, type ServiceAttempt, type ServiceState } from "./service-state.js";

export interface ServiceAuthorityOptions {
  store: AuthorityStore; networkId: string; registryAddress: string;
  signingKey(version: number): Promise<Pick<SigningKeyPair, "privateKey" | "kid">>;
  current(record: InstitutionRecord, digest: string): Promise<"current" | "revoked" | "unavailable">;
  assertPublished?(record:InstitutionRecord):void;
  pbxTrust?: {kid:string;publicKey:JWK};
  policy?: RuntimePolicy;
  now?: () => number;
}
export class ServiceAuthority {
  constructor(readonly options: ServiceAuthorityOptions) {}
  get policy() { return runtimePolicySchema.parse(this.options.policy ?? servicePolicy); }
  now() { return this.options.now?.() ?? Math.floor(Date.now()/1000); }
  base() { return { protocol: "callsign" as const, version: 3 as const, networkId: this.options.networkId, registryAddress: this.options.registryAddress }; }
  state(r: InstitutionRecord): ServiceState { if (!r.serviceV3 || r.serviceV3.recovery !== "ready") throw new HttpError(503, "CONSUMPTION_HISTORY_RECOVERY_REQUIRED"); return r.serviceV3; }
  event(r: InstitutionRecord, actor: Actor, kind: string, objectId: string, payload: unknown = {}) {
    const id = randomUUID(), at = this.now();
    r.audit.push({ id, at, actor: actor.userId, event: kind, objectId });
    (r.pendingEvents ??= []).push({ id, at, kind, objectId, payload });
  }
  async idempotent<T>(actor: Actor, requestId: string, input: unknown, operation: (r: InstitutionRecord, s: ServiceState) => Promise<T>): Promise<T> {
    if (!/^[A-Za-z0-9:._-]{8,200}$/.test(requestId)) throw new HttpError(400, "REQUEST_ID_REQUIRED");
    return this.options.store.transact(actor.institutionId, async r => {
      membership(r, actor, ["institution", "gateway", "recipient", "approver"]);
      const s = this.state(r), key = `${actor.userId}:${requestId}`, hash = hashCanonical(input), previous = s.requests[key];
      if (previous) { if (previous.hash !== hash) throw new HttpError(409, "IDEMPOTENCY_CONFLICT"); return previous.result as T; }
      for (const [id, value] of Object.entries(s.requests)) if (value.at < this.now()-604800) delete s.requests[id];
      if (Object.keys(s.requests).length >= 10000) throw new HttpError(429, "IDEMPOTENCY_CAPACITY");
      const result = await operation(r, s); s.requests[key] = { hash, at: this.now(), result }; return result;
    });
  }
  party(r: InstitutionRecord, actor: Actor, attemptId: string) {
    membership(r, actor, ["gateway", "recipient", "institution"]);
    const s = this.state(r), attempt = s.attempts[attemptId], intent = attempt && r.intents[attempt.intentId];
    if (!attempt || !intent || intent.institutionId !== r.id || (actor.role === "gateway" && (attempt.agentId !== actor.userId || r.members[actor.userId]?.serviceDid !== intent.serviceDid)) || (actor.role === "recipient" && intent.recipientId !== actor.userId)) throw new HttpError(404, "ATTEMPT_NOT_FOUND");
    if (r.members[intent.recipientId]?.role!=="recipient"||r.members[intent.recipientId]?.active===false||attempt.agentId !== intent.agentId || (r.members[attempt.agentId]?.role !== "gateway" || r.members[attempt.agentId]?.active===false) || r.members[attempt.agentId]?.serviceDid !== intent.serviceDid) throw new HttpError(409, "ASSIGNMENT_CHANGED");
    return { s, attempt, intent };
  }
  async credential(r: InstitutionRecord, digest: string) {
    const item = this.state(r).credentials[digest];
    if (!item || item.state === "revoke-requested" || item.state === "revoked") throw new HttpError(409, "DELEGATION_REVOKED_OR_UNKNOWN");
    const vc = await verifyServiceCredential(item.jws, await importJWK(r.approvalPublicKey, "EdDSA"), r.approvalKid);
    const service = r.services[vc.credentialSubject.id];
    if (r.status !== "active" || vc.issuer !== (r.institutionUri ?? r.did) || serviceCredentialDigest(vc) !== digest || !service?.active || vc.credentialSubject.institutionId !== r.id || vc.credentialSubject.keyVersion !== service.keyVersion || hashCanonical(vc.credentialSubject.publicKey) !== hashCanonical(service.publicKey) || policyHash(vc.credentialSubject.scope) !== policyHash(r.policy) || vc.credentialStatus.epoch !== r.epoch || vc.credentialStatus.approvalKeyVersion !== r.approvalKeyVersion || vc.credentialStatus.networkId !== this.options.networkId || vc.credentialStatus.registryAddress.toLowerCase() !== this.options.registryAddress.toLowerCase() || Date.parse(vc.validFrom) > this.now()*1000 || Date.parse(vc.validUntil) <= this.now()*1000) throw new HttpError(409, "DELEGATION_CONTEXT_INVALID");
    return { item, vc, service };
  }
  async assertCurrent(r: InstitutionRecord, digest: string) {
    const status = await this.options.current(r, digest);
    if (status !== "current") throw new HttpError(status === "revoked" ? 409 : 503, status === "revoked" ? "AUTHORITY_REVOKED" : "AUTHORITY_UNAVAILABLE");
  }
  createIntent(actor: Actor, requestId: string, input: unknown) { return this.idempotent(actor, requestId, { action: "intent", input }, async r => { this.options.assertPublished?.(r);
    requirePermission(r,actor,"contact.manage");const intent = importMockFds(r, actor, input, this.now()); this.event(r, actor, "intent.created", intent.id); return intent;
  }); }
  issueCredential(actor: Actor, requestId: string, serviceUri: string) { return this.idempotent(actor, requestId, { action: "vc", serviceUri }, async r => { this.options.assertPublished?.(r);
    requirePermission(r,actor,"delegation.manage"); registeredUriSchema.parse(serviceUri);
    const service = r.services[serviceUri]; if (r.status !== "active" || !service?.active) throw new HttpError(409, "SERVICE_INACTIVE");
    const id = `urn:uuid:${randomUUID()}`;
    const vc = { "@context": ["https://www.w3.org/ns/credentials/v2", { "@vocab": "urn:callsign:delegation:v1:" }], id, type: ["VerifiableCredential", "CallCenterDelegation"], issuer: registeredUriSchema.parse(r.institutionUri ?? r.did), validFrom: new Date(this.now()*1000).toISOString(), validUntil: new Date((this.now()+86400)*1000).toISOString(), credentialSubject: { id: serviceUri, institutionId: r.id, publicKey: publicKeySchema.parse(service.publicKey), keyVersion: service.keyVersion, scope: r.policy }, credentialStatus: { id, type: "CallSignRegistryStatus", networkId: this.options.networkId, registryAddress: this.options.registryAddress, epoch: r.epoch, approvalKeyVersion: r.approvalKeyVersion } };
    const parsed = (await import("@callsign/protocol")).serviceVcSchema.parse(vc), digest = serviceCredentialDigest(parsed);
    const item = { vc: parsed, jws: await signServiceCredential(parsed, await this.options.signingKey(r.approvalKeyVersion)), state: "pending" as const };
    this.state(r).credentials[digest] = item; this.event(r, actor, "credential.register", digest, { digest }); return { digest, ...item };
  }); }
  createAttempt(actor: Actor, requestId: string, intentId: string, profile: ServiceAttempt["profile"]) { return this.idempotent(actor, requestId, { action: "attempt", intentId, profile }, async (r, s) => { this.options.assertPublished?.(r);
    membership(r, actor, ["gateway"]); const intent = activeIntent(r, intentId, actor, this.now());
    for (const a of Object.values(s.attempts)) if (!terminal(a.status) && a.intentId === intentId) {
      if (a.status !== "accepted" && a.firstConnectBy <= this.now()) { a.status = "no-answer"; a.endedAt = this.now(); }
      else throw new HttpError(409, "ATTEMPT_ALREADY_ACTIVE");
    }
    if (Object.keys(s.attempts).length >= 10000) throw new HttpError(429, "ATTEMPT_CAPACITY_RETENTION_REQUIRED");
    const a: ServiceAttempt = { id: `v3-${randomUUID()}`, intentId, agentId: actor.userId, sessionId: randomUUID(), generation: randomUUID(), profile, status: "created", firstConnectBy: Math.min(this.now()+120, intent.expiresAt), callEndBy: Math.min(this.now()+this.policy.maxCallSeconds, intent.expiresAt), revision: 1 };
    s.attempts[a.id] = a; this.event(r, actor, "attempt.created", a.id); return a;
  }); }
  challenge(actor: Actor, requestId: string, attemptId: string, digest: string, publicKey: unknown) { return this.idempotent(actor, requestId, { action: "challenge", attemptId, digest, publicKey }, async (r, s) => { this.options.assertPublished?.(r);
    membership(r, actor, ["gateway"]); const { attempt, intent } = this.party(r, actor, attemptId); activeIntent(r, intent.id, actor, this.now());
    if (attempt.status !== "created" || this.now() >= attempt.firstConnectBy) throw new HttpError(409, "START_EXPIRED");
    const { vc, service } = await this.credential(r, digest); if (vc.credentialSubject.id !== intent.serviceDid) throw new HttpError(403, "SERVICE_MISMATCH"); await this.assertCurrent(r, digest);
    const payload = serviceProofSchema.parse({ ...this.base(), type: "CallCenterProof", challengeId: randomUUID(), nonce: randomUUID(), institutionId: r.id, intentId: intent.id, attemptId, sessionId: attempt.sessionId, agentId: actor.userId, serviceUri: intent.serviceDid, serviceKeyVersion: service.keyVersion, browserPublicKey: publicKeySchema.parse(publicKey), vcDigest: digest, policyHash: intent.policyHash, callProfile: attempt.profile, issuedAt: this.now(), expiresAt: attempt.firstConnectBy });
    s.challenges[payload.challengeId] = { payload, used: false }; return payload;
  }); }
  senderContext(actor: Actor, challengeId: string, serviceUri: string) { return this.options.store.read(actor.institutionId).then(r => {
    membership(r, actor, ["gateway"]); const challenge = this.state(r).challenges[challengeId];
    if (!challenge || challenge.used || challenge.payload.serviceUri !== serviceUri || challenge.payload.agentId !== actor.userId) throw new HttpError(403, "CHALLENGE_FORBIDDEN");
    this.party(r, actor, challenge.payload.attemptId); assertTemporalValidity(challenge.payload, this.now()); return challenge.payload;
  }); }
  authorize(actor: Actor, requestId: string, challengeId: string, proofJws: string) { return this.idempotent(actor, requestId, { action: "authorize", challengeId, proofJws }, async (r, s) => { this.options.assertPublished?.(r);
    membership(r, actor, ["gateway"]); const challenge = s.challenges[challengeId]; if (!challenge || challenge.used) throw new HttpError(409, "CHALLENGE_USED_OR_UNKNOWN");
    const expected = challenge.payload, { attempt, intent } = this.party(r, actor, expected.attemptId); activeIntent(r, intent.id, actor, this.now());
    if (attempt.status !== "created" || expected.agentId !== actor.userId) throw new HttpError(409, "ATTEMPT_INVALID");
    const { vc, service } = await this.credential(r, expected.vcDigest);
    const proof = await verifyPayload(proofJws, await importJWK(service.publicKey, "EdDSA"), { type: "CallCenterProof", kid: service.kid, schema: serviceProofSchema });
    if (hashCanonical(proof) !== hashCanonical(expected)) throw new HttpError(409, "CHALLENGE_CONTEXT_INVALID"); assertTemporalValidity(proof, this.now()); await this.assertCurrent(r, proof.vcDigest);
    const payload = startAuthorizationSchema.parse({ ...this.base(), type: "ContactStartAuthorization", authorizationId: `v3-${randomUUID()}`, institutionId: r.id, institutionUri: r.institutionUri ?? r.did, intentId: intent.id, attemptId: attempt.id, sessionId: attempt.sessionId, agentId: actor.userId, recipientId: intent.recipientId, serviceUri: proof.serviceUri, serviceKeyVersion: service.keyVersion, approvalKeyVersion: r.approvalKeyVersion, epoch: r.epoch, nonce: proof.nonce, browserKeyHash: hashCanonical(proof.browserPublicKey), serviceProofHash: hashCanonical(proof), vcDigest: proof.vcDigest, policyHash: intent.policyHash, purpose: intent.purpose, callProfile: attempt.profile, issuedAt: this.now(), firstConsumeBy: Math.min(attempt.firstConnectBy, proof.expiresAt), callEndBy: Math.min(attempt.callEndBy, Math.floor(Date.parse(vc.validUntil)/1000)) });
    const result = { payload, jws: await signPayload(payload, await this.options.signingKey(r.approvalKeyVersion)), serviceProofJws: proofJws, cancelled: false };
    challenge.used = true; attempt.authorizationId = payload.authorizationId; attempt.status = "authorized"; attempt.callEndBy = payload.callEndBy; s.authorizations[payload.authorizationId] = result;
    this.event(r, actor, "authorization.issued", payload.authorizationId); return result;
  }); }
  enroll(actor: Actor, requestId: string, attemptId: string, publicKey: unknown, nonce: string) { return this.idempotent(actor, requestId, { action: "enroll", attemptId, publicKey, nonce }, async r => {
    membership(r, actor, ["recipient"]); const { attempt, intent } = this.party(r, actor, attemptId); activeIntent(r, intent.id, actor, this.now());
    const parsed = publicKeySchema.parse(publicKey); if (nonce.length < 16 || nonce.length > 128 || terminal(attempt.status) || this.now() >= attempt.firstConnectBy) throw new HttpError(409, "ENROLLMENT_EXPIRED");
    if (attempt.recipientKey && (hashCanonical(parsed) !== hashCanonical(attempt.recipientKey.publicKey) || nonce !== attempt.recipientKey.nonce)) throw new HttpError(409, "RECIPIENT_ALREADY_BOUND");
    attempt.recipientKey = { userId: actor.userId, publicKey: parsed, nonce }; return { sessionId: attempt.sessionId, generation: attempt.generation, nonce, keyHash: hashCanonical(parsed) };
  }); }
  async possession(jws: string, publicKey: JWK, role: "sender" | "recipient", authorizationId: string, sessionId: string, bindingHash: string, nonce: string) {
    const proof = await verifyPayload(jws, await importJWK(publicKey, "EdDSA"), { type: "ServicePossession", kid: hashCanonical(publicKey), schema: servicePossessionSchema }); assertTemporalValidity(proof, this.now());
    if (proof.expiresAt-proof.issuedAt > 120 || proof.networkId !== this.options.networkId || proof.registryAddress !== this.options.registryAddress || proof.role !== role || proof.authorizationId !== authorizationId || proof.sessionId !== sessionId || proof.bindingHash !== bindingHash || proof.nonce !== nonce) throw new HttpError(409, "POSSESSION_CONTEXT_INVALID");
  }
  consume(actor: Actor, requestId: string, attemptId: string, input: { binding: ServiceBinding; senderProof: string; recipientProof: string }) { return this.idempotent(actor, requestId, { action: "consume", attemptId, ...input }, async (r, s) => { this.options.assertPublished?.(r);
    membership(r, actor, ["recipient"]); const { attempt, intent } = this.party(r, actor, attemptId), auth = attempt.authorizationId && s.authorizations[attempt.authorizationId];
    if (!auth) throw new HttpError(404, "AUTHORIZATION_NOT_FOUND"); const a = auth.payload, binding = serviceBindingSchema.parse(input.binding), hash = hashCanonical(binding), prior = s.consumptions[a.authorizationId];
    if (prior) { if (prior.payload.bindingHash !== hash) throw new HttpError(409, "AUTHORIZATION_ALREADY_CONSUMED"); return prior; }
    activeIntent(r, intent.id, actor, this.now());
    if (auth.cancelled || attempt.status !== "authorized" || this.now() >= a.firstConsumeBy || a.epoch !== r.epoch || a.approvalKeyVersion !== r.approvalKeyVersion) throw new HttpError(409, "START_EXPIRED_OR_REVOKED");
    await this.credential(r, a.vcDigest); await this.assertCurrent(r, a.vcDigest);
    const enrollment = attempt.recipientKey; if (!enrollment || enrollment.userId !== actor.userId || binding.recipientNonce !== enrollment.nonce || binding.recipientKeyHash !== hashCanonical(enrollment.publicKey) || binding.authorizationHash !== hashCanonical(a) || binding.sessionId !== a.sessionId || binding.connectionGeneration !== attempt.generation || binding.callProfile !== attempt.profile || binding.networkId !== a.networkId || binding.registryAddress !== a.registryAddress || binding.recipientId !== actor.userId || binding.expiresAt > a.firstConsumeBy) throw new HttpError(409, "BINDING_CONTEXT_INVALID");
    assertTemporalValidity(binding, this.now());
    const challenge = Object.values(s.challenges).find(item => hashCanonical(item.payload) === a.serviceProofHash);
    if (!challenge) throw new HttpError(409, "SENDER_CHALLENGE_MISSING");
    const proof = challenge.payload;
    await this.possession(input.senderProof, proof.browserPublicKey, "sender", a.authorizationId, a.sessionId, hash, binding.recipientNonce);
    await this.possession(input.recipientProof, enrollment.publicKey, "recipient", a.authorizationId, a.sessionId, hash, binding.recipientNonce);
    if (attempt.profile === "asterisk-webrtc-v3") {
      if (!attempt.pbx?.evidence || attempt.pbx.state !== "prepared" || !this.options.pbxTrust) throw new HttpError(409, "PBX_EVIDENCE_REQUIRED");
      const trust = this.options.pbxTrust;
      const evidence = await verifyPayload(attempt.pbx.evidence, await importJWK(trust.publicKey,"EdDSA"), {type:"AsteriskSessionEvidence",kid:trust.kid,schema:pbxEvidenceSchema});
      assertTemporalValidity(evidence,this.now());
      if (evidence.bindingHash !== hash || evidence.authorizationId !== a.authorizationId || evidence.institutionId !== r.id || evidence.attemptId !== attempt.id || evidence.sessionId !== attempt.sessionId || evidence.connectionGeneration !== attempt.generation || evidence.recipientNonce !== enrollment.nonce || evidence.state !== "prepared" || evidence.bridgeId !== attempt.pbx.bridgeId || evidence.senderChannelId !== attempt.pbx.senderChannelId || evidence.recipientChannelId !== attempt.pbx.recipientChannelId || evidence.networkId !== a.networkId || evidence.registryAddress !== a.registryAddress) throw new HttpError(409,"PBX_EVIDENCE_CONTEXT_INVALID");
    }
    if (r.consumptions[a.authorizationId] || r.authorizations[a.authorizationId]) throw new HttpError(409, "CROSS_PROFILE_REUSE");
    const payload = serviceReceiptSchema.parse({ ...this.base(), type: "ServiceConsumptionReceipt", institutionId: r.id, authorizationId: a.authorizationId, authorizationHash: hashCanonical(a), bindingHash: hash, sessionId: a.sessionId, recipientId: a.recipientId, consumedAt: this.now(), recoverUntil: a.callEndBy });
    const receipt = { payload, jws: await signPayload(payload, await this.options.signingKey(r.approvalKeyVersion)) };
    s.consumptions[a.authorizationId] = receipt; attempt.binding = binding; attempt.status = "consumed"; attempt.revision++;
    this.event(r, actor, "authorization.consumed", a.authorizationId, { bindingHash: hash }); return receipt;
  }); }
  lease(actor: Actor, requestId: string, attemptId: string, sequence: number, nonce: string, proofJws: string, choice: "pause" | "continue" = "pause", senderProofJws?: string) { return this.idempotent(actor, requestId, { action: "lease", attemptId, sequence, nonce, proofJws, choice, senderProofJws:senderProofJws??null }, async (r, s) => {
    membership(r, actor, ["recipient"]); const { attempt, intent } = this.party(r, actor, attemptId), auth = attempt.authorizationId && s.authorizations[attempt.authorizationId];
    if (!auth || !attempt.binding || !attempt.recipientKey || !["consumed", "accepted"].includes(attempt.status) || auth.cancelled || this.now() >= attempt.callEndBy || auth.payload.epoch !== r.epoch || auth.payload.approvalKeyVersion !== r.approvalKeyVersion) throw new HttpError(409, "CALL_NO_LONGER_AUTHORIZED");
    activeIntent(r, intent.id, actor, this.now()); await this.credential(r, auth.payload.vcDigest);
    if (sequence !== (attempt.lease?.payload.sequence ?? 0)+1) throw new HttpError(409, "LEASE_SEQUENCE_CONFLICT");
    const hash = hashCanonical(attempt.binding);
    const renewal = attempt.renewal;
    if (!renewal || renewal.sequence !== sequence || renewal.nonce !== nonce || this.now() >= renewal.expiresAt || !senderProofJws || renewal.proofs.sender !== senderProofJws || renewal.proofs.recipient !== proofJws) throw new HttpError(409, "BOTH_RENEWAL_PROOFS_REQUIRED");
    await this.renewalProof(r, attempt, "sender", senderProofJws);
    await this.renewalProof(r, attempt, "recipient", proofJws);
    const status = await this.options.current(r, auth.payload.vcDigest);
    if (status === "revoked") {
      attempt.status = "cancelled"; attempt.endedAt = this.now(); auth.cancelled = true; this.event(r, actor, "call.cleanup", attempt.id); this.event(r, actor, "attempt.cancelled", attempt.id);
      return { authority: "revoked" as const, terminated: true };
    }
    if (attempt.status === "consumed" && this.now() >= auth.payload.firstConsumeBy) throw new HttpError(409,"INITIAL_CONNECTION_START_EXPIRED");
    if (status === "unavailable" && attempt.status !== "accepted") throw new HttpError(503, "INITIAL_AUTHORITY_CHECK_REQUIRED");
    if (attempt.status === "accepted" && (!attempt.lease || this.now() >= attempt.lease.payload.expiresAt)) throw new HttpError(409, "LEASE_EXPIRED_REVALIDATION_REQUIRED");
    const payload = serviceLeaseSchema.parse({ ...this.base(), type: "CallLease", institutionId: r.id, authorizationId: auth.payload.authorizationId, bindingHash: hash, sessionId: attempt.sessionId, connectionGeneration: attempt.generation, epoch: r.epoch, approvalKeyVersion: r.approvalKeyVersion, policyHash: intent.policyHash, vcDigest: auth.payload.vcDigest, sequence, nonce, authority: status, callEndBy: attempt.callEndBy, issuedAt: this.now(), expiresAt: Math.min(this.now()+this.policy.leaseSeconds, attempt.callEndBy) });
    const result = { payload, jws: await signPayload(payload, await this.options.signingKey(r.approvalKeyVersion)) };
    attempt.authorityStatus=status;attempt.authorityUntil=status==="current"?Math.min(this.now()+8,s.checkpoints[auth.payload.vcDigest]?.blockTimestamp!==undefined?s.checkpoints[auth.payload.vcDigest]!.blockTimestamp+8:this.now()+8):this.now();
    attempt.lease = result; attempt.status = "accepted"; if (status === "unavailable") attempt.unverifiedChoice = choice; else delete attempt.unverifiedChoice; attempt.revision++;
    this.event(r, actor, "call.lease", attempt.id, { sequence, authority: status, choice }); return { authority: status, lease: result };
  }); }
  async renewalProof(r: InstitutionRecord, attempt: ServiceAttempt, role: "sender" | "recipient", jws: string) {
    const s=this.state(r), auth=s.authorizations[attempt.authorizationId!], challenge=Object.values(s.challenges).find(c=>hashCanonical(c.payload)===auth?.payload.serviceProofHash);
    const key=role==="sender"?challenge?.payload.browserPublicKey:attempt.recipientKey?.publicKey;
    if(!key||!attempt.renewal||!attempt.binding)throw new HttpError(409,"RENEWAL_CONTEXT_REQUIRED");
    const proof=await verifyPayload(jws,await importJWK(key,"EdDSA"),{type:"LeaseRenewalProof",kid:hashCanonical(key),schema:renewalProofSchema});assertTemporalValidity(proof,this.now());
    const expected={...this.base(),type:"LeaseRenewalProof",role,authorizationId:attempt.authorizationId,sessionId:attempt.sessionId,bindingHash:hashCanonical(attempt.binding),...attempt.renewal};
    const {proofs:_,...payload}=expected;
    if(hashCanonical(proof)!==hashCanonical(payload))throw new HttpError(409,"RENEWAL_CONTEXT_MISMATCH");return proof;
  }
  renewalChallenge(actor:Actor,requestId:string,attemptId:string) { return this.idempotent(actor,requestId,{action:"renewal-challenge",attemptId},async r=>{
    const {attempt}=this.party(r,actor,attemptId);if(actor.role!=="recipient"||!["consumed","accepted"].includes(attempt.status)||!attempt.binding)throw new HttpError(409,"CALL_NO_LONGER_AUTHORIZED");
    if(attempt.renewal&&attempt.renewal.sequence===(attempt.lease?.payload.sequence??0)+1&&attempt.renewal.expiresAt>this.now())return attempt.renewal;
    const expiresAt=Math.min(this.now()+20,attempt.callEndBy,attempt.lease?.payload.expiresAt??attempt.firstConnectBy);
    if(expiresAt<=this.now())throw new HttpError(409,"LEASE_EXPIRED_REVALIDATION_REQUIRED");
    attempt.renewal={nonce:randomUUID(),sequence:(attempt.lease?.payload.sequence??0)+1,priorLeaseHash:hashCanonical(attempt.lease?.payload??this.state(r).consumptions[attempt.authorizationId!]!.payload),issuedAt:this.now(),expiresAt,proofs:{}};return attempt.renewal;
  }); }
  submitRenewal(actor:Actor,requestId:string,attemptId:string,jws:string) { return this.idempotent(actor,requestId,{action:"renewal-proof",attemptId,jws},async r=>{
    const {attempt}=this.party(r,actor,attemptId);if(!["gateway","recipient"].includes(actor.role)||terminal(attempt.status))throw new HttpError(403,"CALL_ROLE_REQUIRED");
    const role=actor.role==="gateway"?"sender":"recipient";await this.renewalProof(r,attempt,role,jws);attempt.renewal!.proofs[role]=jws;return {stored:true};
  }); }
  ready(actor:Actor,requestId:string,attemptId:string,jws:string) {return this.idempotent(actor,requestId,{action:"media-ready",attemptId,jws},async r=>{
    const {attempt}=this.party(r,actor,attemptId),role=actor.role==="gateway"?"sender":actor.role==="recipient"?"recipient":null;
    const auth=this.state(r).authorizations[attempt.authorizationId!], challenge=Object.values(this.state(r).challenges).find(c=>hashCanonical(c.payload)===auth?.payload.serviceProofHash);
    const key=role==="sender"?challenge?.payload.browserPublicKey:attempt.recipientKey?.publicKey;
    if(!role||!key||!attempt.binding||attempt.status!=="accepted"||!attempt.lease||attempt.lease.payload.authority!=="current"||attempt.lease.payload.expiresAt<=this.now())throw new HttpError(409,"MEDIA_NOT_VERIFIED");
    const hash=hashCanonical(attempt.binding);await this.possession(jws,key,role,auth!.payload.authorizationId,attempt.sessionId,hash,`media-ready:${hash}`);
    (attempt.mediaReady??={})[role]=jws;return {ready:Object.keys(attempt.mediaReady).length===2};
  }); }
  async sweep(institutionId:string) {
    const observed=await this.options.store.read(institutionId),snapshot=observed.serviceV3;
    const digests=[...new Set(Object.values(snapshot?.attempts??{}).filter(t=>!terminal(t.status)).map(t=>snapshot?.authorizations[t.authorizationId??'']?.payload.vcDigest).filter((d):d is string=>!!d))];
    const checked=new Map<string,{status:"current"|"revoked"|"unavailable";checkpoint?:ServiceState["checkpoints"][string]}>();
    // Witness I/O must not hold the institution lock or serialize identical VC queries for every call.
    let index=0;await Promise.all([0,1].map(async()=>{while(index<digests.length){const digest=digests[index++]!;try{const draft=structuredClone(observed),status=await this.options.current(draft,digest),checkpoint=draft.serviceV3?.checkpoints[digest];checked.set(digest,{status,...(checkpoint?{checkpoint}:{})});}catch{checked.set(digest,{status:"unavailable"});}}}));
    return this.options.store.transact(institutionId,async r=>{
      const s=r.serviceV3;if(!s)return;const actor:Actor={userId:"runtime",role:"institution",institutionId};
      for(const attempt of Object.values(s.attempts)) {
        if(terminal(attempt.status))continue;const intent=r.intents[attempt.intentId],auth=attempt.authorizationId&&s.authorizations[attempt.authorizationId];
        let reason="",outcome:"cancelled"|"no-answer"|"failed"="cancelled";
        if(s.recovery!=="ready"||r.status!=="active"||!intent||intent.status!=="open"||intent.expiresAt<=this.now()||r.members[attempt.agentId]?.role!=="gateway"||r.members[intent.recipientId]?.role!=="recipient"||r.members[attempt.agentId]?.active===false||r.members[intent.recipientId]?.active===false||r.members[attempt.agentId]?.serviceDid!==intent.serviceDid||(auth&&(auth.cancelled||auth.payload.epoch!==r.epoch||auth.payload.approvalKeyVersion!==r.approvalKeyVersion)))reason="authority-invalid";
        else if(attempt.status!=="accepted"&&attempt.firstConnectBy<=this.now()){reason="ring-timeout";outcome="no-answer";}
        else if(attempt.status==="accepted"&&(!attempt.lease||attempt.lease.payload.expiresAt<=this.now()||attempt.callEndBy<=this.now())){reason="lease-expired";outcome="failed";}
        else if(auth){
          try{
            await this.credential(r,auth.payload.vcDigest);
            const result=checked.get(auth.payload.vcDigest),previous=s.checkpoints[auth.payload.vcDigest],cp=result?.checkpoint;
            const rollback=cp&&previous&&(BigInt(cp.height)<BigInt(previous.height)||(cp.height===previous.height&&(cp.hash!==previous.hash||cp.payloadHash!==previous.payloadHash)));
            const unchanged=r.epoch===observed.epoch&&r.approvalKeyVersion===observed.approvalKeyVersion;
            const status=unchanged&&!rollback?(result?.status??"unavailable"):"unavailable";
            if(status==="revoked")reason="authority-revoked";
            else {attempt.authorityStatus=status;if(cp&&!rollback&&unchanged)s.checkpoints[auth.payload.vcDigest]={...cp,firstSeenAt:previous?.hash===cp.hash?Math.min(previous.firstSeenAt,cp.firstSeenAt):cp.firstSeenAt};if(status==="current")attempt.authorityUntil=Math.min(this.now()+8,cp?cp.blockTimestamp+8:this.now()+8);}
          }catch(error){if((error as {statusCode?:number}).statusCode===409)reason="authority-invalid";else attempt.authorityStatus="unavailable";}
        }
        if(reason){attempt.status=outcome;attempt.reason=reason;attempt.endedAt=this.now();attempt.revision++;if(attempt.consent){attempt.consent.granted=false;attempt.consent.generation++;}this.event(r,actor,"call.cleanup",attempt.id);}
      }
    });
  }

  outcome(actor: Actor, requestId: string, attemptId: string, outcome: "ended" | "declined" | "no-answer" | "failed" | "cancelled", reason: string) { return this.idempotent(actor, requestId, { action: "outcome", attemptId, outcome, reason }, async r => {
    const { attempt } = this.party(r, actor, attemptId);
    if (terminal(attempt.status)) { if (attempt.status !== outcome) throw new HttpError(409, "TERMINAL_STATE_CONFLICT"); return attempt; }
    if (outcome === "cancelled" && actor.role !== "institution") throw new HttpError(403, "INSTITUTION_REQUIRED");
    if (outcome === "declined" && (actor.role !== "recipient" || attempt.status === "accepted")) throw new HttpError(409, "DECLINE_NOT_ALLOWED");
    if (outcome === "no-answer" && (this.now() < attempt.firstConnectBy || attempt.status === "accepted")) throw new HttpError(409, "RINGING_NOT_EXPIRED");
    if (outcome === "ended" && attempt.status !== "accepted") throw new HttpError(409, "CALL_NOT_ACCEPTED");
    attempt.status = outcome; attempt.endedAt = this.now(); attempt.reason = reason.slice(0,100); attempt.revision++;
    if (attempt.consent) { attempt.consent.granted = false; attempt.consent.generation++; }
    this.event(r, actor, "call.cleanup", attempt.id); this.event(r, actor, `attempt.${outcome}`, attempt.id); return attempt;
  }); }
  revoke(actor: Actor, requestId: string, digest: string) { return this.idempotent(actor, requestId, { action: "revoke", digest }, async (r, s) => {
    requirePermission(r,actor,"delegation.manage"); const item = s.credentials[digest]; if (!item) throw new HttpError(404, "VC_NOT_FOUND"); item.state = "revoke-requested";
    for (const a of Object.values(s.authorizations)) if (a.payload.vcDigest === digest) { a.cancelled = true; const attempt = s.attempts[a.payload.attemptId]; if (attempt && !terminal(attempt.status)) { attempt.status = "cancelled"; attempt.endedAt = this.now(); if(attempt.consent){attempt.consent.granted=false;attempt.consent.generation++;} this.event(r,actor,"call.cleanup",attempt.id); } }
    this.event(r, actor, "credential.revoke", digest, { digest }); return { status: "revoke-requested", ledgerStatus: "pending" };
  }); }
  usage(r: InstitutionRecord, actor: Actor, attempt: ServiceAttempt, unit: string, amount: number, max: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new HttpError(400, "INVALID_USAGE");
    const s = this.state(r), day = Math.floor(this.now()/86400);
    for (const [key, limit] of [[`call:${attempt.id}:${unit}`, max], [`user:${actor.userId}:${day}:${unit}`, max*20], [`institution:${day}:${unit}`, max*100]] as const) {
      const q = s.quotas[key] ??= { limit, used: 0, reserved: 0, expiresAt: (day+2)*86400 };
      if (q.used+amount > q.limit) throw new HttpError(429, "QUOTA_EXHAUSTED"); q.used += amount;
    }
    (r.pendingUsage ??= []).push({ key: `global:${day}:${unit}`, units: amount, limit: max*1000, expiresAt: (day+2)*86400 });
  }
  consent(actor: Actor, requestId: string, attemptId: string, granted: boolean) { return this.idempotent(actor, requestId, { action: "consent", attemptId, granted }, async (r, s) => {
    membership(r, actor, ["recipient"]); const { attempt } = this.party(r, actor, attemptId);
    if (granted && (attempt.status !== "accepted" || !attempt.lease || this.now() >= attempt.lease.payload.expiresAt)) throw new HttpError(409, "ACTIVE_CALL_REQUIRED");
    if(granted)this.usage(r,actor,attempt,"consent-starts",1,3);
    const generation = (attempt.consent?.generation ?? 0)+1; attempt.consent = { granted, generation, at: this.now() };

    for (const [key, q] of Object.entries(s.quotas)) if (q.expiresAt <= this.now()) delete s.quotas[key];
    this.event(r, actor, granted ? "analysis.consented" : "analysis.withdrawn", attempt.id); return attempt.consent;
  }); }
}
