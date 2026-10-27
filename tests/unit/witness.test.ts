import { describe, expect, it } from "vitest";
import { generateEd25519KeyPair, signPayload } from "../../packages/protocol/src/index.js";
import { aggregateWitnesses } from "../../services/api/src/witness-aggregate.js";
import { verifyStateBundle, type StateSnapshot } from "../../packages/verifier/src/index.js";

describe("independent witness candidates", () => {
  it("accepts three matching valid responses without waiting for a hung fourth node or any aggregator RPC", async () => {
    const keys = await Promise.all([1,2,3,4].map(() => generateEd25519KeyPair()));
    const snapshot: StateSnapshot = { protocol: "callsign", version: 1, type: "SignedStateSnapshot", networkId: "20260914", genesisHash: `0x${"1".repeat(64)}`, registryAddress: `0x${"1".repeat(40)}`, policyVersion: "1", blockNumber: "42", blockHash: `0x${"2".repeat(64)}`, blockTimestamp: 1800000000, institutionId: "institution-bank-example", delegationId: "delegation-example-123", institutionState: { exists: true, status: "Active", epoch: "1", approvalPublicKey: "a".repeat(64), policyVersion: "1" }, delegationState: { exists: true, epoch: "1", gatewayPublicKey: "b".repeat(64), purposeMask: "4", validFrom: 1799999990, validUntil: 1800000300, revoked: false }, directoryHash: `0x${"3".repeat(64)}`, directoryVersion: "1" };
    const endpoints = keys.map((_, i) => ({ witnessId: `w${i}`, url: `http://w${i}` }));
    const trust = { networkId: snapshot.networkId, registryAddress: snapshot.registryAddress, genesisHash: snapshot.genesisHash, policyVersion: "1", witnessThreshold: 3, witnessPublicKeys: keys.map((key, i) => ({ witnessId: `w${i}`, kid: key.kid, jwk: key.publicJwk })), enrollmentPublicKey: keys[0]!.publicJwk, supportedProtocolVersions: [1] };
    const signatures = await Promise.all(keys.map(k => signPayload(snapshot, k))); let fourthAborted = false;
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input)); const i = Number(url.hostname.slice(1));
      if (i === 3) return new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => { fourthAborted = true; reject(new Error("aborted")); }); });
      if (url.pathname === "/head") return Response.json({ blockNumber: "42", blockHash: snapshot.blockHash });
      return Response.json({ witnessId: `w${i}`, snapshot, jws: signatures[i] });
    };
    const bundle = await aggregateWitnesses({ endpoints, institutionId: snapshot.institutionId, delegationId: snapshot.delegationId, trust, fetcher, now: 1800000001 });
    expect(bundle.signatures).toHaveLength(3); expect(fourthAborted).toBe(true);
    const duplicatedTrust = { ...trust, witnessPublicKeys: trust.witnessPublicKeys.map(entry => ({ ...entry, jwk: keys[0]!.publicJwk })) };
    await expect(verifyStateBundle(bundle, duplicatedTrust, { nowWallSeconds: 1800000001, nowMonotonicMs: 0, expectedInstitutionId: snapshot.institutionId, expectedDelegationId: snapshot.delegationId })).rejects.toThrow("INVALID_WITNESS_TRUST");
    const stale = { ...snapshot, blockTimestamp: 1799999900 };
    const staleBundle = { snapshot: stale, signatures: await Promise.all(keys.slice(0,3).map(async (k,i) => ({ witnessId: `w${i}`, jws: await signPayload(stale, k) }))) };
    await expect(verifyStateBundle(staleBundle, trust, { nowWallSeconds: 1800000001, nowMonotonicMs: 0, expectedInstitutionId: snapshot.institutionId, expectedDelegationId: snapshot.delegationId })).rejects.toThrow("STALE_SNAPSHOT");
  });
});
