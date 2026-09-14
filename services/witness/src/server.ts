import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import Fastify from "fastify";
import { exportJWK, generateKeyPair, importJWK, type JWK, type KeyInput } from "jose";
import { createPublicClient, http, keccak256, parseAbi, stringToHex, type Hex } from "viem";
import { z } from "zod";
import { signPayload } from "@callsign/protocol";
import { stateSnapshotSchema, type StateSnapshot } from "@callsign/verifier";

const witnessId = process.env.WITNESS_ID ?? "witness-1";
const rpcUrl = process.env.BESU_RPC_URL ?? "http://127.0.0.1:18545";
const port = Number(process.env.WITNESS_PORT ?? 4201);
const root = resolve(import.meta.dirname, "../../..");
const deploymentPath = process.env.DEPLOYMENT_PATH ?? resolve(root, ".local/deployment.json");
const keyPath = process.env.WITNESS_KEY_PATH ?? resolve(root, `.local/witness-keys/${witnessId}.json`);
const publicKeyPath = process.env.WITNESS_PUBLIC_PATH ?? resolve(root, `.local/witness-public/${witnessId}.json`);
const client = createPublicClient({ transport: http(rpcUrl) });
const registryAbi = parseAbi([
  "function institutions(bytes32) view returns (uint8 status,uint64 epoch,address administrator,bytes32 approvalPublicKey,address emergencyStopper,bytes32 directoryHash,uint64 directoryVersion,uint64 policyVersion,bool exists)",
  "function delegations(bytes32) view returns (bytes32 institutionId,uint64 epoch,bytes32 gatewayPublicKey,uint256 purposeMask,uint64 validFrom,uint64 validUntil,bool revoked,bool exists)",
]);

interface PersistedKey { privateJwk: JWK; publicJwk: JWK; kid: string }

async function loadOrCreateKey(): Promise<PersistedKey & { privateKey: KeyInput }> {
  try {
    const stored = JSON.parse(await readFile(keyPath, "utf8")) as PersistedKey;
    await publishPublicKey(stored);
    return { ...stored, privateKey: await importJWK(stored.privateJwk, "EdDSA") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const pair = await generateKeyPair("Ed25519", { extractable: true });
  const privateJwk = await exportJWK(pair.privateKey);
  const publicJwk = await exportJWK(pair.publicKey);
  const kid = `${witnessId}-${publicJwk.x!.slice(0, 16)}`;
  const stored = { privateJwk, publicJwk, kid };
  await mkdir(dirname(keyPath), { recursive: true });
  await writeFile(keyPath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  await publishPublicKey(stored);
  return { ...stored, privateKey: pair.privateKey };
}

async function publishPublicKey(stored: PersistedKey): Promise<void> {
  await mkdir(dirname(publicKeyPath), { recursive: true });
  await writeFile(publicKeyPath, `${JSON.stringify({ witnessId, kid: stored.kid, publicJwk: stored.publicJwk }, null, 2)}\n`, { mode: 0o644 });
}

const key = await loadOrCreateKey();
const app = Fastify({ logger: true, bodyLimit: 8 * 1024 });
const querySchema = z.object({
  institutionId: z.string().min(16).max(128),
  delegationId: z.string().min(16).max(128),
  blockNumber: z.string().regex(/^(0|[1-9][0-9]*)$/),
  blockHash: z.string().regex(/^0x[0-9a-f]{64}$/),
}).strict();

app.get("/health", async () => {
  const blockNumber = await client.getBlockNumber();
  return { status: "ok", witnessId, kid: key.kid, publicJwk: key.publicJwk, blockNumber: String(blockNumber), rpcBoundary: rpcUrl };
});

app.post("/snapshot", async (request) => {
  const query = querySchema.parse(request.body);
  const deployment = JSON.parse(await readFile(deploymentPath, "utf8")) as { networkId: string; genesisHash: Hex; registryAddress: Hex; institutionId: Hex };
  const blockNumber = BigInt(query.blockNumber);
  const block = await client.getBlock({ blockNumber });
  if (!block.hash || block.hash.toLowerCase() !== query.blockHash.toLowerCase()) throw new Error("PROPOSED_BLOCK_NOT_CANONICAL_ON_OWN_NODE");
  const institutionKey = keccak256(stringToHex(query.institutionId));
  if (institutionKey.toLowerCase() !== deployment.institutionId.toLowerCase()) throw new Error("INSTITUTION_QUERY_NOT_DEPLOYED");
  const delegationKey = keccak256(stringToHex(query.delegationId));
  const institution = await client.readContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "institutions", args: [institutionKey], blockNumber });
  const delegation = await client.readContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "delegations", args: [delegationKey], blockNumber });
  const snapshot: StateSnapshot = stateSnapshotSchema.parse({
    protocol: "callsign", version: 1, type: "SignedStateSnapshot",
    networkId: deployment.networkId, genesisHash: deployment.genesisHash, registryAddress: deployment.registryAddress,
    policyVersion: String(institution[7]), blockNumber: String(blockNumber), blockHash: block.hash,
    blockTimestamp: Number(block.timestamp), institutionId: query.institutionId,
    institutionState: { exists: institution[8], status: institution[0] === 0 ? "Active" : "Suspended", epoch: String(institution[1]), approvalPublicKey: institution[3], policyVersion: String(institution[7]) },
    delegationId: query.delegationId,
    delegationState: { exists: delegation[7], epoch: String(delegation[1]), gatewayPublicKey: delegation[2], purposeMask: String(delegation[3]), validFrom: Number(delegation[4]), validUntil: Number(delegation[5]), revoked: delegation[6] },
    directoryHash: institution[5], directoryVersion: String(institution[6]),
  });
  return { witnessId, snapshot, jws: await signPayload(snapshot, { privateKey: key.privateKey, kid: key.kid }) };
});

await app.listen({ host: "0.0.0.0", port });
