import { z } from "zod";
import { canonicalBytes, hashCanonical, importEd25519PublicJwk, verifyPayload } from "@callsign/protocol";
import type { JWK } from "jose";
import { compactVerify } from "jose";
import { assertTemporalValidity, type ContactAuthorization, type SessionBinding } from "@callsign/protocol";

const decimalInteger = z.string().regex(/^(0|[1-9][0-9]*)$/);
const hash32 = z.string().regex(/^0x[0-9a-f]{64}$/);
const id = z.string().min(16).max(128);

export const institutionStateSchema = z.object({
  exists: z.boolean(),
  status: z.enum(["Active", "Suspended"]),
  epoch: decimalInteger,
  approvalPublicKey: z.string().min(32).max(128),
  policyVersion: decimalInteger,
}).strict();

export const delegationStateSchema = z.object({
  exists: z.boolean(),
  epoch: decimalInteger,
  gatewayPublicKey: z.string().min(32).max(128),
  purposeMask: decimalInteger,
  validFrom: z.number().int().safe().nonnegative(),
  validUntil: z.number().int().safe().nonnegative(),
  revoked: z.boolean(),
}).strict();

export const stateSnapshotSchema = z.object({
  protocol: z.literal("callsign"),
  version: z.literal(1),
  type: z.literal("SignedStateSnapshot"),
  networkId: decimalInteger,
  genesisHash: hash32,
  registryAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  policyVersion: decimalInteger,
  blockNumber: decimalInteger,
  blockHash: hash32,
  blockTimestamp: z.number().int().safe().nonnegative(),
  institutionId: id,
  institutionState: institutionStateSchema,
  delegationId: id,
  delegationState: delegationStateSchema,
  directoryHash: hash32,
  directoryVersion: decimalInteger,
}).strict();

export type StateSnapshot = z.infer<typeof stateSnapshotSchema>;

export interface WitnessSignature {
  witnessId: string;
  jws: string;
}

export interface StateBundle {
  snapshot: StateSnapshot;
  signatures: WitnessSignature[];
}

export interface TrustBundle {
  networkId: string;
  genesisHash: string;
  registryAddress: string;
  policyVersion: string;
  witnessThreshold: number;
  witnessPublicKeys: Array<{ witnessId: string; kid: string; jwk: JWK }>;
  enrollmentPublicKey: JWK;
  supportedProtocolVersions: number[];
}

export interface VerificationContext {
  nowWallSeconds: number;
  nowMonotonicMs: number;
  expectedInstitutionId: string;
  expectedDelegationId: string;
}

export interface VerifiedState {
  snapshot: StateSnapshot;
  signerIds: string[];
  snapshotHash: string;
  deadlineMonotonicMs: number;
  observedAgeSeconds: number;
}

export async function verifyStateBundle(bundle: StateBundle, trust: TrustBundle, context: VerificationContext): Promise<VerifiedState> {
  const snapshot = stateSnapshotSchema.parse(bundle.snapshot);
  if (!trust.supportedProtocolVersions.includes(snapshot.version)) throw new Error("UNSUPPORTED_PROTOCOL_VERSION");
  if (snapshot.networkId !== trust.networkId || snapshot.genesisHash !== trust.genesisHash || snapshot.registryAddress.toLowerCase() !== trust.registryAddress.toLowerCase() || snapshot.policyVersion !== trust.policyVersion) {
    throw new Error("TRUST_BUNDLE_MISMATCH");
  }
  if (snapshot.institutionId !== context.expectedInstitutionId || snapshot.delegationId !== context.expectedDelegationId) {
    throw new Error("QUERY_KEY_MISMATCH");
  }
  const observedAgeSeconds = context.nowWallSeconds - snapshot.blockTimestamp;
  if (snapshot.blockTimestamp > context.nowWallSeconds + 2) throw new Error("FUTURE_SNAPSHOT");
  if (observedAgeSeconds > 12) throw new Error("STALE_SNAPSHOT");

  const expectedBytes = canonicalBytes(snapshot);
  const trusted = new Map(trust.witnessPublicKeys.map((entry) => [entry.witnessId, entry]));
  const unique = new Set<string>();
  for (const signature of bundle.signatures) {
    if (unique.has(signature.witnessId)) throw new Error("DUPLICATE_WITNESS");
    const entry = trusted.get(signature.witnessId);
    if (!entry) throw new Error("UNTRUSTED_WITNESS");
    const key = await importEd25519PublicJwk(entry.jwk);
    const result = await compactVerify(signature.jws, key, { algorithms: ["EdDSA"] });
    if (result.protectedHeader.alg !== "EdDSA" || result.protectedHeader.typ !== "callsign/SignedStateSnapshot+jws" || result.protectedHeader.kid !== entry.kid) {
      throw new Error("INVALID_WITNESS_HEADER");
    }
    if (!equalBytes(result.payload, expectedBytes)) throw new Error("MIXED_SNAPSHOT_PAYLOAD");
    unique.add(signature.witnessId);
  }
  if (unique.size < trust.witnessThreshold) throw new Error("WITNESS_THRESHOLD_NOT_MET");
  const remainingMs = Math.max(0, (12 - Math.max(0, observedAgeSeconds)) * 1000);
  return {
    snapshot,
    signerIds: [...unique],
    snapshotHash: hashCanonical(snapshot),
    deadlineMonotonicMs: context.nowMonotonicMs + remainingMs,
    observedAgeSeconds,
  };
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < a.byteLength; index += 1) difference |= a[index]! ^ b[index]!;
  return difference === 0;
}

export class MonotonicStateGuard {
  #highestBlock = -1n;
  #knownRevokedAt = -1n;
  #deadlines = new Map<string, number>();

  accept(verified: VerifiedState, nowMonotonicMs: number): void {
    const block = BigInt(verified.snapshot.blockNumber);
    if (block < this.#highestBlock) throw new Error("STATE_ROLLBACK");
    if (nowMonotonicMs > verified.deadlineMonotonicMs) throw new Error("MONOTONIC_DEADLINE_EXPIRED");
    const priorDeadline = this.#deadlines.get(verified.snapshot.blockHash);
    if (priorDeadline !== undefined && verified.deadlineMonotonicMs > priorDeadline) throw new Error("DEADLINE_EXTENSION_ATTEMPT");
    if (!verified.snapshot.delegationState.revoked && block <= this.#knownRevokedAt) throw new Error("REVOCATION_ROLLBACK");
    this.#deadlines.set(verified.snapshot.blockHash, priorDeadline ?? verified.deadlineMonotonicMs);
    this.#highestBlock = block > this.#highestBlock ? block : this.#highestBlock;
    if (verified.snapshot.delegationState.revoked) this.#knownRevokedAt = block;
  }

  onVisibilityResume(): never {
    throw new Error("REVALIDATION_REQUIRED_AFTER_BACKGROUND");
  }
}

export function verifyAuthorizationContext(
  authorization: ContactAuthorization,
  expected: { recipientId: string; sessionId?: string; epoch: string; delegationId: string; purposeCode: ContactAuthorization["purposeCode"]; nowSeconds: number; binding?: SessionBinding },
): void {
  assertTemporalValidity(authorization, expected.nowSeconds);
  if (authorization.recipientId !== expected.recipientId) throw new Error("RECIPIENT_MISMATCH");
  if (authorization.epoch !== expected.epoch) throw new Error("EPOCH_MISMATCH");
  if (authorization.delegationId !== expected.delegationId) throw new Error("DELEGATION_MISMATCH");
  if (authorization.purposeCode !== expected.purposeCode) throw new Error("PURPOSE_MISMATCH");
  if (expected.binding) {
    if (expected.binding.authorizationHash !== hashCanonical(authorization)) throw new Error("AUTHORIZATION_HASH_MISMATCH");
    if (expected.binding.recipientId !== expected.recipientId || expected.binding.delegationId !== expected.delegationId || expected.binding.epoch !== expected.epoch) throw new Error("BINDING_CONTEXT_MISMATCH");
    if (expected.sessionId && expected.binding.sessionId !== expected.sessionId) throw new Error("SESSION_MISMATCH");
  }
}
