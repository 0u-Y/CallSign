import { CompactSign } from "jose";
import { describe, expect, it } from "vitest";
import { canonicalBytes, generateEd25519KeyPair } from "@callsign/protocol";
import { MonotonicStateGuard, verifyStateBundle, type StateBundle, type StateSnapshot, type TrustBundle } from "./index.js";

const now = 1_800_000_000;

function snapshot(overrides: Partial<StateSnapshot> = {}): StateSnapshot {
  return {
    protocol: "callsign",
    version: 1,
    type: "SignedStateSnapshot",
    networkId: "20260914",
    genesisHash: `0x${"11".repeat(32)}`,
    registryAddress: "0x1111111111111111111111111111111111111111",
    policyVersion: "1",
    blockNumber: "42",
    blockHash: `0x${"22".repeat(32)}`,
    blockTimestamp: now - 3,
    institutionId: "inst_0123456789abcdef0123456789abcdef",
    institutionState: { exists: true, status: "Active", epoch: "1", approvalPublicKey: "approval_0123456789abcdef0123456789abcdef", policyVersion: "1" },
    delegationId: "delegation_0123456789abcdef0123456789abcdef",
    delegationState: { exists: true, epoch: "1", gatewayPublicKey: "gateway_0123456789abcdef0123456789abcdef", purposeMask: "1", validFrom: now - 60, validUntil: now + 600, revoked: false },
    directoryHash: `0x${"33".repeat(32)}`,
    directoryVersion: "1",
    ...overrides,
  };
}

async function fixture(count = 4, state = snapshot()) {
  const keys = await Promise.all(Array.from({ length: count }, () => generateEd25519KeyPair()));
  const signatures = await Promise.all(keys.map(async (key, index) => ({
    witnessId: `witness-${index + 1}`,
    jws: await new CompactSign(canonicalBytes(state)).setProtectedHeader({ alg: "EdDSA", typ: "callsign/SignedStateSnapshot+jws", kid: key.kid }).sign(key.privateKey),
  })));
  return {
    keys,
    trust: {
      networkId: state.networkId,
      genesisHash: state.genesisHash,
      registryAddress: state.registryAddress,
      policyVersion: state.policyVersion,
      witnessThreshold: 3,
      witnessPublicKeys: keys.map((key, index) => ({ witnessId: `witness-${index + 1}`, kid: key.kid, jwk: key.publicJwk })),
      enrollmentPublicKey: keys[0]!.publicJwk,
      supportedProtocolVersions: [1],
    },
    bundle: { snapshot: state, signatures },
  };
}

function context(state = snapshot()) {
  return { nowWallSeconds: now, nowMonotonicMs: 10_000, expectedInstitutionId: state.institutionId, expectedDelegationId: state.delegationId };
}

describe("3-of-4 witness state verification", () => {
  it("accepts three matching trusted witnesses and records a monotonic deadline", async () => {
    const state = snapshot();
    const { trust, bundle } = await fixture(4, state);
    bundle.signatures = bundle.signatures.slice(0, 3);
    const verified = await verifyStateBundle(bundle, trust, context(state));
    expect(verified.signerIds).toHaveLength(3);
    expect(verified.deadlineMonotonicMs).toBe(19_000);
  });

  it("rejects one signature, duplicate witnesses, mixed payloads, and outsiders", async () => {
    const state = snapshot();
    const { trust, bundle, keys } = await fixture(4, state);
    await expect(verifyStateBundle({ ...bundle, signatures: bundle.signatures.slice(0, 1) }, trust, context(state))).rejects.toThrow("WITNESS_THRESHOLD_NOT_MET");
    await expect(verifyStateBundle({ ...bundle, signatures: [bundle.signatures[0]!, bundle.signatures[0]!, bundle.signatures[1]!] }, trust, context(state))).rejects.toThrow("DUPLICATE_WITNESS");

    const altered = snapshot({ blockHash: `0x${"44".repeat(32)}` });
    const alteredJws = await new CompactSign(canonicalBytes(altered))
      .setProtectedHeader({ alg: "EdDSA", typ: "callsign/SignedStateSnapshot+jws", kid: keys[2]!.kid })
      .sign(keys[2]!.privateKey);
    await expect(verifyStateBundle({ ...bundle, signatures: [bundle.signatures[0]!, bundle.signatures[1]!, { witnessId: "witness-3", jws: alteredJws }] }, trust, context(state))).rejects.toThrow("MIXED_SNAPSHOT_PAYLOAD");

    await expect(verifyStateBundle({ ...bundle, signatures: [...bundle.signatures.slice(0, 2), { ...bundle.signatures[2]!, witnessId: "outside" }] }, trust, context(state))).rejects.toThrow("UNTRUSTED_WITNESS");
  });

  it("rejects stale, future, and query-key mismatched snapshots", async () => {
    for (const [state, message] of [
      [snapshot({ blockTimestamp: now - 13 }), "STALE_SNAPSHOT"],
      [snapshot({ blockTimestamp: now + 3 }), "FUTURE_SNAPSHOT"],
    ] as const) {
      const { trust, bundle } = await fixture(3, state);
      await expect(verifyStateBundle(bundle, trust, context(state))).rejects.toThrow(message);
    }
    const state = snapshot();
    const { trust, bundle } = await fixture(3, state);
    await expect(verifyStateBundle(bundle, trust, { ...context(state), expectedDelegationId: "delegation_wrong_0123456789abcdef" })).rejects.toThrow("QUERY_KEY_MISMATCH");
  });

  it("never extends the same block deadline or rolls back after a known revoke", async () => {
    const guard = new MonotonicStateGuard();
    const state = snapshot();
    const firstFixture = await fixture(3, state);
    const first = await verifyStateBundle(firstFixture.bundle, firstFixture.trust, context(state));
    guard.accept(first, 10_000);
    expect(() => guard.accept({ ...first, deadlineMonotonicMs: first.deadlineMonotonicMs + 1 }, 10_001)).toThrow("DEADLINE_EXTENSION_ATTEMPT");

    const revokedState = snapshot({ blockNumber: "43", blockHash: `0x${"55".repeat(32)}`, delegationState: { ...state.delegationState, revoked: true } });
    const revokedFixture = await fixture(3, revokedState);
    const revoked = await verifyStateBundle(revokedFixture.bundle, revokedFixture.trust, context(revokedState));
    guard.accept(revoked, 10_100);
    expect(() => guard.accept(first, 10_200)).toThrow("STATE_ROLLBACK");
    expect(() => guard.onVisibilityResume()).toThrow("REVALIDATION_REQUIRED_AFTER_BACKGROUND");
  });
});
