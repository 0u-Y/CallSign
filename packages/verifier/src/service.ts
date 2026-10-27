import { importJWK, type JWK } from 'jose';
import { assertTemporalValidity, extractSingleSdpFingerprint, hashCanonical, hashSdp, pbxEvidenceSchema, policyHash, serviceBindingSchema, serviceCredentialDigest, serviceLeaseSchema, servicePolicy, serviceProofSchema, serviceReceiptSchema, startAuthorizationSchema, verifyPayload, verifyServiceCredential, type PurposePolicy } from '@callsign/protocol';
import { assertLedgerBinding } from './finals.js';
import { MonotonicStateGuard, verifyStateBundle, type StateBundle, type TrustBundle } from './index.js';

export interface ServiceTrust {
  institutionUri: string; issuerKid: string; issuerPublicKey: JWK; approvalKeyVersion: number;
  serviceUri: string; serviceKid: string; servicePublicKey: JWK; serviceKeyVersion: number;
  pbx?: { kid: string; publicKey: JWK }; chain: TrustBundle;
}
// The caller supplies locally observed SDP, SIP Call-ID and DTLS facts, never server success flags.
export async function verifyServicePackage(input: {
  authorizationJws: string; vcJws: string; serviceProofJws: string; receiptJws: string; leaseJws: string; leaseNonce: string;
  binding: unknown; trust: ServiceTrust; policy: PurposePolicy; state: StateBundle; recipientId: string; sessionId: string;
  recipientPublicKey: JWK; recipientNonce: string; connectionGeneration: string; now: number; monotonicMs: number;
  guard: MonotonicStateGuard; minimumLeaseSequence: number;
  observed: { connected: boolean; localSdp: string; remoteSdp: string; remoteFingerprint: string; sipCallId?: string; dataChannelBindingHash?: string };
  pbxEvidenceJws?: string;
}) {
  const t = input.trust, issuer = await importJWK(t.issuerPublicKey, 'EdDSA');
  if (t.chain.witnessThreshold !== 3 || t.chain.witnessPublicKeys.length !== 4) throw new Error('SERVICE_QUORUM_REQUIRED');
  const a = await verifyPayload(input.authorizationJws, issuer, {type:'ContactStartAuthorization',kid:t.issuerKid,schema:startAuthorizationSchema});
  const vc = await verifyServiceCredential(input.vcJws, issuer, t.issuerKid);
  const proof = await verifyPayload(input.serviceProofJws, await importJWK(t.servicePublicKey,'EdDSA'), {type:'CallCenterProof',kid:t.serviceKid,schema:serviceProofSchema});
  const receipt = await verifyPayload(input.receiptJws, issuer, {type:'ServiceConsumptionReceipt',kid:t.issuerKid,schema:serviceReceiptSchema});
  const lease = await verifyPayload(input.leaseJws, issuer, {type:'CallLease',kid:t.issuerKid,schema:serviceLeaseSchema});
  const b = serviceBindingSchema.parse(input.binding), bindingHash = hashCanonical(b), subject = vc.credentialSubject, status = vc.credentialStatus;
  const sameDomain = (value:{networkId:string;registryAddress:string}) => value.networkId === t.chain.networkId && value.registryAddress.toLowerCase() === t.chain.registryAddress.toLowerCase();
  if (![a,b,proof,receipt,lease,status].every(sameDomain)) throw new Error('SERVICE_DOMAIN_MISMATCH');
  if (a.institutionUri !== t.institutionUri || a.approvalKeyVersion !== t.approvalKeyVersion || a.serviceKeyVersion !== t.serviceKeyVersion || a.serviceUri !== t.serviceUri || a.recipientId !== input.recipientId || a.sessionId !== input.sessionId || a.policyHash !== policyHash(input.policy) || a.purpose !== input.policy.purpose || a.vcDigest !== serviceCredentialDigest(vc) || a.serviceProofHash !== hashCanonical(proof) || a.browserKeyHash !== hashCanonical(proof.browserPublicKey)) throw new Error('SERVICE_AUTHORIZATION_MISMATCH');
  if (vc.issuer !== t.institutionUri || subject.id !== t.serviceUri || subject.institutionId !== a.institutionId || subject.keyVersion !== t.serviceKeyVersion || hashCanonical(subject.publicKey) !== hashCanonical(t.servicePublicKey) || policyHash(subject.scope) !== a.policyHash || status.id !== vc.id || status.epoch !== a.epoch || status.approvalKeyVersion !== a.approvalKeyVersion || Date.parse(vc.validFrom)>input.now*1000 || Date.parse(vc.validUntil)<=input.now*1000) throw new Error('SERVICE_CREDENTIAL_MISMATCH');
  if (proof.institutionId !== a.institutionId || proof.intentId !== a.intentId || proof.attemptId !== a.attemptId || proof.sessionId !== a.sessionId || proof.agentId !== a.agentId || proof.serviceUri !== a.serviceUri || proof.serviceKeyVersion !== a.serviceKeyVersion || proof.vcDigest !== a.vcDigest || proof.policyHash !== a.policyHash || proof.callProfile !== a.callProfile || proof.nonce !== a.nonce || proof.expiresAt-proof.issuedAt>servicePolicy.startSeconds) throw new Error('SERVICE_PROOF_MISMATCH');
  if (b.authorizationHash !== hashCanonical(a) || b.sessionId !== a.sessionId || b.recipientId !== a.recipientId || b.recipientNonce !== input.recipientNonce || b.recipientKeyHash !== hashCanonical(input.recipientPublicKey) || b.connectionGeneration !== input.connectionGeneration || b.callProfile !== a.callProfile) throw new Error('SERVICE_BINDING_MISMATCH');
  // Start authorization and original binding may expire during a valid ongoing lease.
  if (receipt.institutionId !== a.institutionId || receipt.authorizationId !== a.authorizationId || receipt.authorizationHash !== hashCanonical(a) || receipt.bindingHash !== bindingHash || receipt.sessionId !== a.sessionId || receipt.recipientId !== a.recipientId || receipt.consumedAt<a.issuedAt || receipt.consumedAt>=a.firstConsumeBy || receipt.consumedAt<proof.issuedAt || receipt.consumedAt>=proof.expiresAt || receipt.consumedAt<b.issuedAt || receipt.consumedAt>=b.expiresAt || b.expiresAt>a.firstConsumeBy || receipt.recoverUntil !== a.callEndBy || input.now<receipt.consumedAt) throw new Error('SERVICE_RECEIPT_MISMATCH');
  assertTemporalValidity(lease,input.now);
  if (lease.authority !== 'current' || lease.institutionId !== a.institutionId || lease.authorizationId !== a.authorizationId || lease.sessionId !== a.sessionId || lease.bindingHash !== bindingHash || lease.connectionGeneration !== input.connectionGeneration || lease.epoch !== a.epoch || lease.approvalKeyVersion !== a.approvalKeyVersion || lease.vcDigest !== a.vcDigest || lease.policyHash !== a.policyHash || lease.nonce !== input.leaseNonce || lease.sequence<input.minimumLeaseSequence || lease.expiresAt-lease.issuedAt>servicePolicy.leaseSeconds || lease.callEndBy !== a.callEndBy || input.now>=a.callEndBy) throw new Error('SERVICE_LEASE_MISMATCH');
  const observed = input.observed;
  if (!observed.connected || b.recipientSdpHash !== hashSdp(observed.localSdp) || b.recipientFingerprint !== extractSingleSdpFingerprint(observed.localSdp) || observed.remoteFingerprint !== extractSingleSdpFingerprint(observed.remoteSdp)) throw new Error('SERVICE_TRANSPORT_UNVERIFIABLE');
  if (a.callProfile === 'direct-webrtc-v3') {
    if (b.senderSdpHash !== hashSdp(observed.remoteSdp) || b.senderFingerprint !== observed.remoteFingerprint || observed.dataChannelBindingHash !== bindingHash) throw new Error('DIRECT_TRANSPORT_MISMATCH');
  } else {
    if (!input.pbxEvidenceJws || !t.pbx || !observed.sipCallId) throw new Error('PBX_EVIDENCE_REQUIRED');
    const e = await verifyPayload(input.pbxEvidenceJws,await importJWK(t.pbx.publicKey,'EdDSA'),{type:'AsteriskSessionEvidence',kid:t.pbx.kid,schema:pbxEvidenceSchema});
    assertTemporalValidity(e,input.now);
    if (!sameDomain(e) || e.state !== 'bridged' || e.institutionId !== a.institutionId || e.authorizationId !== a.authorizationId || e.attemptId !== a.attemptId || e.sessionId !== a.sessionId || e.bindingHash !== bindingHash || e.connectionGeneration !== input.connectionGeneration || e.recipientNonce !== b.recipientNonce || e.senderSdpHash !== b.senderSdpHash || e.recipientSdpHash !== b.recipientSdpHash || e.senderFingerprint !== b.senderFingerprint || e.recipientFingerprint !== b.recipientFingerprint || e.recipientCallId !== observed.sipCallId || e.recipientPbxFingerprint !== observed.remoteFingerprint || e.expiresAt-e.issuedAt>10) throw new Error('PBX_EVIDENCE_MISMATCH');
  }
  const raw = await verifyStateBundle(input.state,t.chain,{expectedInstitutionId:a.institutionId,expectedDelegationId:a.vcDigest,nowWallSeconds:input.now,nowMonotonicMs:input.monotonicMs,maxStateAgeSeconds:servicePolicy.observedStateAgeSeconds,maxFutureSkewSeconds:servicePolicy.eachClockSkewSeconds});
  const verified=input.guard.limitDeadline(raw);input.guard.accept(verified,input.monotonicMs);
  assertLedgerBinding(verified.snapshot,{epoch:a.epoch,approvalPublicKey:t.issuerPublicKey,servicePublicKey:t.servicePublicKey,now:input.now});
  return {authorization:a,lease,bindingHash,authorityDeadline:verified.deadlineMonotonicMs,officialPath:input.policy.followUpPath};
}
