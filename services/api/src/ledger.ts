import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, keccak256, parseAbi, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { JWK } from "jose";

export interface LedgerDeployment {
  networkId: string;
  genesisHash: Hex;
  registryAddress: Hex;
  institutionId: Hex;
}

interface LedgerRoles { privateKeys: { administrator: Hex; emergencyStopper: Hex } }

const registryAbi = parseAbi([
  "function institutions(bytes32) view returns (uint8 status,uint64 epoch,address administrator,bytes32 approvalPublicKey,address emergencyStopper,bytes32 directoryHash,uint64 directoryVersion,uint64 policyVersion,bool exists)",
  "function delegations(bytes32) view returns (bytes32 institutionId,uint64 epoch,bytes32 gatewayPublicKey,uint256 purposeMask,uint64 validFrom,uint64 validUntil,bool revoked,bool exists)",
  "function delegationIdUsed(bytes32) view returns (bool)",
  "function grantDelegation(bytes32 delegationId,bytes32 institutionId,uint64 expectedEpoch,bytes32 gatewayPublicKey,uint256 purposeMask,uint64 validFrom,uint64 validUntil)",
  "function revokeDelegation(bytes32 delegationId,uint64 expectedEpoch)",
]);
const workspaceRoot = resolve(import.meta.dirname, "../../..");

export async function loadLedgerDeployment(): Promise<LedgerDeployment> {
  return JSON.parse(await readFile(resolve(workspaceRoot, ".local/deployment.json"), "utf8")) as LedgerDeployment;
}

export async function ensureLedgerDelegation(input: { delegationId: string; institutionId: string; gatewayPublicJwk: JWK; purposeMask: bigint; now: number }): Promise<{ epoch: string; transactionHash?: Hex }> {
  const deployment = await loadLedgerDeployment();
  const roles = JSON.parse(await readFile(resolve(workspaceRoot, ".local/ledger-roles.json"), "utf8")) as LedgerRoles;
  const rpcUrl = process.env.BESU_RPC_URL ?? "http://127.0.0.1:18545";
  const chain = { id: Number(deployment.networkId), name: "CallSign Local QBFT", nativeCurrency: { name: "Demo Ether", symbol: "DEMO", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } as const;
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const account = privateKeyToAccount(roles.privateKeys.administrator);
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const institutionKey = keccak256(stringToHex(input.institutionId));
  if (institutionKey.toLowerCase() !== deployment.institutionId.toLowerCase()) throw new Error("LEDGER_INSTITUTION_MISMATCH");
  const delegationKey = keccak256(stringToHex(input.delegationId));
  const gatewayKey = `0x${Buffer.from(input.gatewayPublicJwk.x!, "base64url").toString("hex")}` as Hex;
  const institution = await publicClient.readContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "institutions", args: [institutionKey] });
  if (!institution[8] || institution[0] !== 0) throw new Error("LEDGER_INSTITUTION_NOT_ACTIVE");
  const used = await publicClient.readContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "delegationIdUsed", args: [delegationKey] });
  if (used) {
    const current = await publicClient.readContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "delegations", args: [delegationKey] });
    if (!current[7] || current[6] || current[2].toLowerCase() !== gatewayKey.toLowerCase() || current[1] !== institution[1]) throw new Error("LEDGER_DELEGATION_CONFLICT");
    return { epoch: String(institution[1]) };
  }
  const hash = await wallet.writeContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "grantDelegation", args: [delegationKey, institutionKey, institution[1], gatewayKey, input.purposeMask, BigInt(input.now - 5), BigInt(input.now + 3600)] });
  await publicClient.waitForTransactionReceipt({ hash });
  return { epoch: String(institution[1]), transactionHash: hash };
}

export async function revokeLedgerDelegation(delegationId: string): Promise<Hex> {
  const deployment = await loadLedgerDeployment();
  const roles = JSON.parse(await readFile(resolve(workspaceRoot, ".local/ledger-roles.json"), "utf8")) as LedgerRoles;
  const rpcUrl = process.env.BESU_RPC_URL ?? "http://127.0.0.1:18545";
  const chain = { id: Number(deployment.networkId), name: "CallSign Local QBFT", nativeCurrency: { name: "Demo Ether", symbol: "DEMO", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } as const;
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const wallet = createWalletClient({ account: privateKeyToAccount(roles.privateKeys.administrator), chain, transport: http(rpcUrl) });
  const key = keccak256(stringToHex(delegationId));
  const delegation = await publicClient.readContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "delegations", args: [key] });
  const hash = await wallet.writeContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "revokeDelegation", args: [key, delegation[1]] });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
