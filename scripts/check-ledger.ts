import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPublicClient, http, type Hex } from "viem";

const rpcUrls = [18545, 28545, 38545, 48545].map((port) => `http://127.0.0.1:${port}`);
const deployment = JSON.parse(await readFile(resolve(import.meta.dirname, "../.local/deployment.json"), "utf8")) as { genesisHash: Hex; registryAddress: Hex };
const clients = rpcUrls.map((url) => createPublicClient({ transport: http(url) }));
const heights = await Promise.all(clients.map((client) => client.getBlockNumber()));
const commonHeight = heights.reduce((lowest, height) => height < lowest ? height : lowest);
const [genesisBlocks, commonBlocks, codes, witnessHealth] = await Promise.all([
  Promise.all(clients.map((client) => client.getBlock({ blockNumber: 0n }))),
  Promise.all(clients.map((client) => client.getBlock({ blockNumber: commonHeight }))),
  Promise.all(clients.map((client) => client.getCode({ address: deployment.registryAddress, blockNumber: commonHeight }))),
  Promise.all([4201, 4202, 4203, 4204].map(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    if (!response.ok) throw new Error(`WITNESS_${port}_UNHEALTHY`);
    return response.json() as Promise<{ witnessId: string; blockNumber: string; rpcBoundary: string }>;
  })),
]);
const genesisHashes = new Set(genesisBlocks.map((block) => block.hash));
const commonHashes = new Set(commonBlocks.map((block) => block.hash));
if (genesisHashes.size !== 1 || !genesisHashes.has(deployment.genesisHash)) throw new Error("GENESIS_MISMATCH");
if (commonHashes.size !== 1) throw new Error("COMMON_BLOCK_HASH_MISMATCH");
if (codes.some((code) => !code || code === "0x")) throw new Error("REGISTRY_CODE_MISSING");
const result = {
  checkedAt: new Date().toISOString(), profile: "qbft-4-node-plus-independent-witness-processes",
  nodeHeights: heights.map(String), commonHeight: String(commonHeight), commonBlockHash: commonBlocks[0]!.hash,
  genesisHash: deployment.genesisHash, registryAddress: deployment.registryAddress,
  registryCodeBytes: (codes[0]!.length - 2) / 2, witnesses: witnessHealth,
};
await mkdir(resolve(import.meta.dirname, "../artifacts"), { recursive: true });
await writeFile(resolve(import.meta.dirname, "../artifacts/ledger-readiness.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
