import { importJWK, type JWK } from "jose";
import {
  assertTemporalValidity,
  consumptionReceiptSchema,
  extractSingleSdpFingerprint,
  hashCanonical,
  hashSdp,
  randomId,
  recipientChallengeSchema,
  sessionProofSchema,
  signPayload,
  transportTranscriptSchema,
  verifyPayload,
  type ContactAuthorization,
  type ConsumptionReceipt,
  type EnrollmentProof,
  type RecipientChallenge,
  type SessionBinding,
  type SessionProof,
  type TransportTranscript,
} from "@callsign/protocol";
import { verifyAuthorizationContext, verifyStateBundle, type StateBundle, type TrustBundle, type VerifiedState } from "@callsign/verifier";
import { api } from "./api.js";
import type { BrowserSigningKey } from "./browserKeys.js";
import pinnedTrust from "../generated/trust-bundle.json";

export const ALICE_ID = "recipient_alice_01HZZZZZZZZZZZZZZZZZZZZZZZ";
export const GATEWAY_ID = "gateway_c_01HZZZZZZZZZZZZZZZZZZZZZZZZZ";

export interface AuthorizationRow {
  id: string;
  recipientId: string;
  delegationId: string;
  signedJws: string;
  authorizationHash: string;
  cancelledAt: string | null;
  expiresAt: string;
  payload: ContactAuthorization;
}

export interface Enrollment {
  id: string;
  payload: EnrollmentProof;
  proofJws: string;
  enrollmentKid: string;
}

export interface TrustKeys extends TrustBundle {
  networkId: string;
  genesisHash: string;
  registryAddress: string;
  policyVersion: string;
  witnessThreshold: number;
  witnessPublicKeys: TrustBundle["witnessPublicKeys"];
  issuerPublicKey: JWK;
  issuerKid: string;
  enrollmentPublicKey: JWK;
  enrollmentKid: string;
}

export async function verifyLedgerAuthorization(authorization: ContactAuthorization, gatewayPublicJwk: JWK, trust: TrustKeys): Promise<VerifiedState> {
  const bundle = await api<StateBundle>(`/state-bundles?institutionId=${encodeURIComponent(authorization.institutionId)}&delegationId=${encodeURIComponent(authorization.delegationId)}`);
  const now = Math.floor(Date.now() / 1000);
  const verified = await verifyStateBundle(bundle, trust, { nowWallSeconds: now, nowMonotonicMs: performance.now(), expectedInstitutionId: authorization.institutionId, expectedDelegationId: authorization.delegationId });
  const institution = verified.snapshot.institutionState;
  const delegation = verified.snapshot.delegationState;
  if (!institution.exists || institution.status !== "Active") throw new Error("INSTITUTION_NOT_ACTIVE");
  if (!delegation.exists || delegation.revoked) throw new Error("DELEGATION_NOT_ACTIVE");
  if (institution.epoch !== authorization.epoch || delegation.epoch !== authorization.epoch) throw new Error("LEDGER_EPOCH_MISMATCH");
  const expectedGatewayKey = rawJwkHex(gatewayPublicJwk);
  if (delegation.gatewayPublicKey.toLowerCase() !== expectedGatewayKey.toLowerCase()) throw new Error("GATEWAY_KEY_NOT_DELEGATED");
  if (institution.approvalPublicKey.toLowerCase() !== rawJwkHex(trust.issuerPublicKey).toLowerCase()) throw new Error("ISSUER_KEY_NOT_CURRENT_ON_LEDGER");
  const purposeBit = authorization.purposeCode === "CIVIL_REPLY" ? 1n : 2n;
  if ((BigInt(delegation.purposeMask) & purposeBit) !== purposeBit) throw new Error("PURPOSE_NOT_DELEGATED");
  if (now < delegation.validFrom || now >= delegation.validUntil) throw new Error("DELEGATION_TIME_INVALID");
  return verified;
}

export async function loadTrustKeys(): Promise<TrustKeys> {
  const upstream = await api<TrustKeys>("/trust-bundle");
  if (upstream.networkId !== pinnedTrust.networkId || upstream.registryAddress.toLowerCase() !== pinnedTrust.registryAddress.toLowerCase() || upstream.genesisHash !== pinnedTrust.genesisHash) throw new Error("DEPLOYED_TRUST_BUNDLE_MISMATCH_RESTART_REQUIRED");
  if (upstream.enrollmentKid !== pinnedTrust.enrollmentKid || hashCanonical(upstream.enrollmentPublicKey) !== hashCanonical(pinnedTrust.enrollmentPublicKey)) throw new Error("ENROLLMENT_TRUST_KEY_MISMATCH");
  return { ...upstream, ...pinnedTrust, enrollmentPublicKey: pinnedTrust.enrollmentPublicKey as JWK, witnessPublicKeys: pinnedTrust.witnessPublicKeys as TrustBundle["witnessPublicKeys"] };
}

function rawJwkHex(jwk: JWK): string {
  const encoded = jwk.x!.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(jwk.x!.length / 4) * 4, "=");
  return `0x${[...Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export interface SignalMessage {
  type: "invite" | "challenge" | "offer" | "answer" | "ice" | "proof" | "hangup";
  toUserId: string;
  fromUserId?: string;
  sessionId: string;
  payload: unknown;
}

export function openSignaling(onMessage: (message: SignalMessage) => void, onStatus: (status: string) => void): WebSocket {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${scheme}://${location.host}/signaling`);
  socket.addEventListener("open", () => onStatus("SIGNALING_READY"));
  socket.addEventListener("close", () => onStatus("SIGNALING_CLOSED"));
  socket.addEventListener("error", () => onStatus("SIGNALING_ERROR"));
  socket.addEventListener("message", (event) => {
    const value = JSON.parse(String(event.data)) as SignalMessage | { type: "error"; code: string };
    if (value.type === "error") onStatus(value.code);
    else onMessage(value);
  });
  return socket;
}

export function sendSignal(socket: WebSocket, message: SignalMessage): void {
  if (socket.readyState !== WebSocket.OPEN) throw new Error("SIGNALING_NOT_READY");
  socket.send(JSON.stringify(message));
}

export async function waitForIceComplete(peer: RTCPeerConnection, timeoutMs = 8_000): Promise<void> {
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("ICE_GATHERING_TIMEOUT")); }, timeoutMs);
    const changed = () => { if (peer.iceGatheringState === "complete") { cleanup(); resolve(); } };
    const cleanup = () => { window.clearTimeout(timer); peer.removeEventListener("icegatheringstatechange", changed); };
    peer.addEventListener("icegatheringstatechange", changed);
  });
}

export function createPeer(): RTCPeerConnection {
  return new RTCPeerConnection({ bundlePolicy: "max-bundle", iceServers: [] });
}

export async function createSilentAudioTrack(): Promise<{ track: MediaStreamTrack; context: AudioContext }> {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const destination = context.createMediaStreamDestination();
  gain.gain.value = 0.04;
  oscillator.frequency.value = 440;
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  const track = destination.stream.getAudioTracks()[0]!;
  track.enabled = false;
  return { track, context };
}

export async function createRecipientChallenge(input: {
  key: BrowserSigningKey;
  enrollment: Enrollment;
  sessionId: string;
  networkId: string;
  registryAddress: string;
}): Promise<{ payload: RecipientChallenge; jws: string }> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: RecipientChallenge = {
    protocol: "callsign", version: 1, type: "RecipientChallenge",
    networkId: input.networkId, registryAddress: input.registryAddress,
    recipientId: ALICE_ID, recipientSessionPublicKey: input.key.publicJwk.x!, enrollmentProof: input.enrollment.proofJws,
    sessionId: input.sessionId, recipientNonce: randomId("recipient_nonce"), issuedAt, expiresAt: issuedAt + 60,
  };
  recipientChallengeSchema.parse(payload);
  return { payload, jws: await signPayload(payload, input.key) };
}

export async function verifyIncomingAuthorization(row: AuthorizationRow, trust: TrustKeys): Promise<ContactAuthorization> {
  const key = await importJWK(trust.issuerPublicKey, "EdDSA");
  const authorization = await verifyPayload(row.signedJws, key, { type: "ContactAuthorization", kid: trust.issuerKid, schema: (await import("@callsign/protocol")).contactAuthorizationSchema });
  if (hashCanonical(authorization) !== row.authorizationHash || authorization.authorizationId !== row.id) throw new Error("AUTHORIZATION_HASH_MISMATCH");
  verifyAuthorizationContext(authorization, { recipientId: ALICE_ID, epoch: authorization.epoch, delegationId: authorization.delegationId, purposeCode: authorization.purposeCode, nowSeconds: Math.floor(Date.now() / 1000) });
  return authorization;
}

export async function verifyProofPackage(input: {
  authorization: ContactAuthorization;
  authorizationHash: string;
  binding: SessionBinding;
  receipt: ConsumptionReceipt;
  receiptJws: string;
  sessionProof: SessionProof;
  sessionProofJws: string;
  issuerPublicKey: JWK;
  issuerKid: string;
  gatewayPublicJwk: JWK;
  gatewayKid: string;
  localSdp: string;
  remoteSdp: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const issuerKey = await importJWK(input.issuerPublicKey, "EdDSA");
  const gatewayKey = await importJWK(input.gatewayPublicJwk, "EdDSA");
  const receipt = await verifyPayload(input.receiptJws, issuerKey, { type: "ConsumptionReceipt", kid: input.issuerKid, schema: consumptionReceiptSchema });
  const proof = await verifyPayload(input.sessionProofJws, gatewayKey, { type: "SessionProof", kid: input.gatewayKid, schema: sessionProofSchema });
  if (receipt.expiresAt <= receipt.consumedAt || now >= receipt.expiresAt) throw new Error("RECEIPT_EXPIRED");
  assertTemporalValidity(proof, now);
  const bindingHash = hashCanonical(input.binding);
  if (hashCanonical(input.authorization) !== input.authorizationHash || receipt.bindingHash !== bindingHash || receipt.authorizationHash !== input.authorizationHash || proof.bindingHash !== bindingHash || proof.consumptionReceiptHash !== hashCanonical(receipt) || hashCanonical(proof.binding) !== bindingHash) throw new Error("PROOF_PACKAGE_CONTEXT_MISMATCH");
  if (input.binding.receiverFingerprint !== extractSingleSdpFingerprint(input.localSdp) || input.binding.gatewayFingerprint !== extractSingleSdpFingerprint(input.remoteSdp) || input.binding.answerSdpHash !== hashSdp(input.localSdp) || input.binding.offerSdpHash !== hashSdp(input.remoteSdp)) throw new Error("SDP_BINDING_MISMATCH");
  verifyAuthorizationContext(input.authorization, { recipientId: ALICE_ID, sessionId: input.binding.sessionId, epoch: input.binding.epoch, delegationId: input.binding.delegationId, purposeCode: input.authorization.purposeCode, nowSeconds: now, binding: input.binding });
  return bindingHash;
}

export async function makeTransportTranscript(role: "gateway" | "receiver", bindingHash: string, receiverNonce: string, gatewayNonce: string, key: BrowserSigningKey, trust: TrustKeys): Promise<{ payload: TransportTranscript; jws: string }> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: TransportTranscript = { protocol: "callsign", version: 1, type: "TransportTranscript", networkId: trust.networkId, registryAddress: trust.registryAddress, role, bindingHash, receiverNonce, gatewayNonce, issuedAt, expiresAt: issuedAt + 60 };
  return { payload, jws: await signPayload(payload, key) };
}

export async function verifyTransportTranscript(jws: string, payload: TransportTranscript, publicJwk: JWK, kid: string, expectedRole: "gateway" | "receiver"): Promise<void> {
  const key = await importJWK(publicJwk, "EdDSA");
  const verified = await verifyPayload(jws, key, { type: "TransportTranscript", kid, schema: transportTranscriptSchema });
  assertTemporalValidity(verified, Math.floor(Date.now() / 1000));
  if (verified.role !== expectedRole || hashCanonical(verified) !== hashCanonical(payload)) throw new Error("TRANSPORT_TRANSCRIPT_MISMATCH");
}

export async function verifyObservedTransport(peer: RTCPeerConnection, channel: RTCDataChannel, expectedRemoteFingerprint: string): Promise<{ bytesReceived: number; profile: string }> {
  if (peer.connectionState !== "connected" || channel.readyState !== "open") throw new Error("TRANSPORT_NOT_CONNECTED");
  const stats = await peer.getStats();
  let dtlsConnected = false;
  let bytesReceived = 0;
  for (const report of stats.values()) {
    if (report.type === "transport" && report.dtlsState === "connected") dtlsConnected = true;
    if (report.type === "inbound-rtp" && report.kind === "audio") bytesReceived += Number(report.bytesReceived ?? 0);
  }
  if (!dtlsConnected) throw new Error("DTLS_STATS_NOT_CONNECTED");
  const receiver = peer.getReceivers().find((item) => item.track?.kind === "audio");
  const transport = receiver?.transport as (RTCDtlsTransport & { getRemoteCertificates?: () => ArrayBuffer[] }) | null | undefined;
  if (!transport?.getRemoteCertificates) throw new Error("REMOTE_CERTIFICATE_API_UNSUPPORTED");
  const certificate = transport.getRemoteCertificates()[0];
  if (!certificate) throw new Error("REMOTE_CERTIFICATE_UNAVAILABLE");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", certificate));
  const observed = [...digest].map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(":");
  if (observed !== expectedRemoteFingerprint) throw new Error("REMOTE_CERTIFICATE_FINGERPRINT_MISMATCH");
  return { bytesReceived, profile: "chromium-dtls-certificate-v1" };
}
