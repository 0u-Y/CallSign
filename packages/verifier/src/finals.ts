import { importJWK, type JWK } from "jose";
import { assertTemporalValidity, authorizationStatusSchema, authorizationV2Schema, bindingV2Schema, hashCanonical, permitSchema, policyHash, publicKeySchema, receiptV2Schema, verifyDelegationVc, verifyPayload, vcDigest, type PurposePolicy } from "@callsign/protocol";
import { verifyStateBundle, type StateBundle, type TrustBundle, MonotonicStateGuard } from "./index.js";

export interface FinalsTrust { issuerDid: string; issuerKid: string; issuerPublicKey: JWK; serviceDid: string; serviceKid: string; servicePublicKey: JWK; approvalKeyVersion: number; serviceKeyVersion: number; chain: TrustBundle }
export function assertLedgerBinding(state: StateBundle["snapshot"], expected: { epoch: string; approvalPublicKey: JWK; servicePublicKey: JWK; purposeMask?: bigint; now: number }) {
  const raw = (jwk: JWK) => { const x = publicKeySchema.parse(jwk).x; const padded = x.replace(/-/g, "+").replace(/_/g, "/") + "="; return `0x${Array.from(atob(padded), c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")}`; };
  if (!state.institutionState.exists || state.institutionState.status !== "Active") throw new Error("INSTITUTION_NOT_ACTIVE");
  if (state.institutionState.epoch !== expected.epoch || state.delegationState.epoch !== expected.epoch) throw new Error("EPOCH_MISMATCH");
  if (state.institutionState.approvalPublicKey.toLowerCase() !== raw(expected.approvalPublicKey) || state.delegationState.gatewayPublicKey.toLowerCase() !== raw(expected.servicePublicKey)) throw new Error("LEDGER_KEY_MISMATCH");
  const d = state.delegationState;
  if (!d.exists || d.revoked) throw new Error("DELEGATION_REVOKED");
  if (expected.now < d.validFrom || expected.now >= d.validUntil || (BigInt(d.purposeMask) & (expected.purposeMask ?? 4n)) !== (expected.purposeMask ?? 4n)) throw new Error("DELEGATION_SCOPE_INVALID");
}
export async function verifyFinalsPackage(input: {
  statusJws: string; statusNonce: string; authorizationJws: string; vcJws: string; permitJws: string; receiptJws: string; binding: unknown;
  trust: FinalsTrust; policy: PurposePolicy; state: StateBundle; recipientId: string; sessionId: string;
  localSdp: string; remoteSdp: string; recipientPublicKey: JWK; guard: MonotonicStateGuard;
  now: number; monotonicMs: number;
  observedTransport: { profile: string; remoteFingerprint: string; dataChannelBindingHash: string; connected: boolean };
}) {
  const t = input.trust;
  if (t.chain.witnessThreshold !== 3 || t.chain.witnessPublicKeys.length !== 4) throw new Error("FINALS_REQUIRES_THREE_OF_FOUR"); const issuer = await importJWK(t.issuerPublicKey, "EdDSA");
  const a = await verifyPayload(input.authorizationJws, issuer, { type: "ContactAuthorization", kid: t.issuerKid, schema: authorizationV2Schema });
  const receipt = await verifyPayload(input.receiptJws, issuer, { type: "ConsumptionReceipt", kid: t.issuerKid, schema: receiptV2Schema });
  const vc = await verifyDelegationVc(input.vcJws, issuer, t.issuerKid);
  const permit = await verifyPayload(input.permitJws, await importJWK(t.servicePublicKey, "EdDSA"), { type: "SenderSessionPermit", kid: t.serviceKid, schema: permitSchema });
  const b = bindingV2Schema.parse(input.binding);
  const statusProof = await verifyPayload(input.statusJws, issuer, { type: "AuthorizationStatus", kid: t.issuerKid, schema: authorizationStatusSchema });
  assertTemporalValidity(statusProof, input.now);
  if (statusProof.nonce !== input.statusNonce || statusProof.status !== "consumed" || statusProof.authorizationId !== a.authorizationId || statusProof.bindingHash !== hashCanonical(b) || statusProof.approvalKeyVersion !== a.approvalKeyVersion || statusProof.networkId !== a.networkId || statusProof.registryAddress !== a.registryAddress || statusProof.expiresAt - statusProof.issuedAt > 5) throw new Error("AUTHORIZATION_STATUS_INVALID");
  for (const value of [a, permit, b]) assertTemporalValidity(value, input.now);
  if (input.now < receipt.consumedAt || input.now >= receipt.expiresAt || receipt.expiresAt <= receipt.consumedAt) throw new Error("RECEIPT_EXPIRED");
  if (a.networkId !== t.chain.networkId || a.registryAddress !== t.chain.registryAddress || a.issuerDid !== t.issuerDid || a.approvalKeyVersion !== t.approvalKeyVersion || a.recipientId !== input.recipientId || a.sessionId !== input.sessionId || a.policyHash !== policyHash(input.policy) || a.purpose !== input.policy.purpose || a.vcDigest !== vcDigest(vc) || a.permitHash !== hashCanonical(permit) || a.browserKeyHash !== hashCanonical(permit.browserPublicKey)) throw new Error("AUTHORIZATION_CONTEXT_INVALID");
  const s = vc.credentialSubject; const status = vc.credentialStatus;
  if (vc.issuer !== t.issuerDid || s.id !== t.serviceDid || s.controller !== t.serviceDid || s.institutionId !== a.institutionId || s.serviceKeyVersion !== t.serviceKeyVersion || hashCanonical(s.publicKey) !== hashCanonical(t.servicePublicKey) || s.policyHash !== a.policyHash || s.purpose !== a.purpose || status.id !== vc.id || status.epoch !== a.epoch || status.approvalKeyVersion !== a.approvalKeyVersion || status.networkId !== a.networkId || status.registryAddress !== a.registryAddress || Date.parse(vc.validFrom) > input.now * 1000 || Date.parse(vc.validUntil) <= input.now * 1000) throw new Error("VC_CONTEXT_INVALID");
  if (permit.institutionId !== a.institutionId || permit.intentId !== a.intentId || permit.attemptId !== a.attemptId || permit.sessionId !== a.sessionId || permit.serviceDid !== t.serviceDid || permit.serviceKeyVersion !== t.serviceKeyVersion || permit.policyHash !== a.policyHash || permit.vcDigest !== a.vcDigest || permit.networkId !== a.networkId || permit.registryAddress !== a.registryAddress || permit.expiresAt - permit.issuedAt > 60) throw new Error("PERMIT_CONTEXT_INVALID");
  const bindingHash = hashCanonical(b);
  if (b.authorizationHash !== hashCanonical(a) || b.sessionId !== a.sessionId || b.recipientId !== a.recipientId || b.recipientKeyHash !== hashCanonical(input.recipientPublicKey) || b.networkId !== a.networkId || b.registryAddress !== a.registryAddress || receipt.authorizationId !== a.authorizationId || receipt.authorizationHash !== hashCanonical(a) || receipt.bindingHash !== bindingHash || receipt.sessionId !== a.sessionId || receipt.recipientId !== a.recipientId || receipt.approvalKeyVersion !== a.approvalKeyVersion || receipt.networkId !== a.networkId || receipt.registryAddress !== a.registryAddress) throw new Error("BINDING_CONTEXT_INVALID");
  const { hashSdp, extractSingleSdpFingerprint } = await import("@callsign/protocol");
  if (b.transportProfile !== "webrtc-bundle-v2" || b.answerSdpHash !== hashSdp(input.localSdp) || b.offerSdpHash !== hashSdp(input.remoteSdp) || b.receiverFingerprint !== extractSingleSdpFingerprint(input.localSdp) || b.gatewayFingerprint !== extractSingleSdpFingerprint(input.remoteSdp)) throw new Error("SDP_BINDING_MISMATCH");
  const transport = input.observedTransport;
  if (!transport.connected || transport.profile !== "chromium-dtls-certificate-v1" || transport.remoteFingerprint !== b.gatewayFingerprint || transport.dataChannelBindingHash !== bindingHash) throw new Error("TRANSPORT_UNVERIFIABLE");
  const verifiedRaw = await verifyStateBundle(input.state, t.chain, { nowWallSeconds: input.now, nowMonotonicMs: input.monotonicMs, expectedInstitutionId: a.institutionId, expectedDelegationId: a.vcDigest });
  const verified = input.guard.limitDeadline(verifiedRaw);
  input.guard.accept(verified, input.monotonicMs);
  assertLedgerBinding(verified.snapshot, { epoch: a.epoch, approvalPublicKey: t.issuerPublicKey, servicePublicKey: t.servicePublicKey, now: input.now });
  return { authorization: a, bindingHash, deadlineMonotonicMs: verified.deadlineMonotonicMs, officialPath: input.policy.followUpPath };
}
