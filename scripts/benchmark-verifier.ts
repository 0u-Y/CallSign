import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { generateEd25519KeyPair, signPayload } from "../packages/protocol/src/index.js";
import { verifyStateBundle, type StateBundle, type StateSnapshot, type TrustBundle } from "../packages/verifier/src/index.js";

const now = Math.floor(Date.now() / 1000);
const snapshot: StateSnapshot = {
  protocol: "callsign", version: 1, type: "SignedStateSnapshot",
  networkId: "20260914", genesisHash: `0x${"11".repeat(32)}`,
  registryAddress: "0x1111111111111111111111111111111111111111", policyVersion: "1",
  blockNumber: "100", blockHash: `0x${"22".repeat(32)}`, blockTimestamp: now - 1,
  institutionId: "inst_benchmark_0123456789abcdef", institutionState: { exists: true, status: "Active", epoch: "1", approvalPublicKey: `0x${"33".repeat(32)}`, policyVersion: "1" },
  delegationId: "delegation_benchmark_0123456789abcdef", delegationState: { exists: true, epoch: "1", gatewayPublicKey: `0x${"44".repeat(32)}`, purposeMask: "3", validFrom: now - 60, validUntil: now + 600, revoked: false },
  directoryHash: `0x${"55".repeat(32)}`, directoryVersion: "1",
};
const keys = await Promise.all(Array.from({ length: 4 }, () => generateEd25519KeyPair()));
const signatures = await Promise.all(keys.map(async (key, index) => ({
  witnessId: `witness-${index + 1}`,
  jws: await signPayload(snapshot, key),
})));
const trust: TrustBundle = {
  networkId: snapshot.networkId, genesisHash: snapshot.genesisHash, registryAddress: snapshot.registryAddress,
  policyVersion: snapshot.policyVersion, witnessThreshold: 3,
  witnessPublicKeys: keys.map((key, index) => ({ witnessId: `witness-${index + 1}`, kid: key.kid, jwk: key.publicJwk })),
  enrollmentPublicKey: keys[0]!.publicJwk, supportedProtocolVersions: [1],
};
const bundle: StateBundle = { snapshot, signatures };
const samples: number[] = [];
for (let index = 0; index < 100; index += 1) {
  const started = performance.now();
  await verifyStateBundle(bundle, trust, { nowWallSeconds: now, nowMonotonicMs: performance.now(), expectedInstitutionId: snapshot.institutionId, expectedDelegationId: snapshot.delegationId });
  samples.push(performance.now() - started);
}
samples.sort((a, b) => a - b);
const result = {
  checkedAt: new Date().toISOString(), profile: "cached-canonical-state-bundle-browser-compatible-verifier",
  sampleCount: samples.length, p50Ms: samples[49], p95Ms: samples[94], maxMs: samples[99], targetP95Ms: 500,
  targetMet: samples[94]! <= 500,
  note: "네트워크 왕복을 제외하고 JCS payload 및 Ed25519 witness 4개를 실제 검증한 Node 22 측정값",
};
await mkdir(resolve(import.meta.dirname, "../artifacts"), { recursive: true });
await writeFile(resolve(import.meta.dirname, "../artifacts/verifier-benchmark.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
