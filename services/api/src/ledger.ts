import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createPublicClient, createWalletClient, http, keccak256, parseAbi, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { JWK } from "jose";

export interface LedgerDeployment {
  networkId: string;
  genesisHash: Hex;
  registryAddress: Hex;
  institutionId: Hex;
}

interface LedgerRoles {
  privateKeys: {
    approver1: Hex;
    approver2: Hex;
    approver3: Hex;
    administrator: Hex;
    emergencyStopper: Hex;
    recoveryAdministrator: Hex;
    recoveryEmergencyStopper: Hex;
  };
}

export interface InstitutionLedgerState {
  institutionId: string;
  status: "Active" | "Suspended";
  epoch: string;
  administrator: Hex;
  emergencyStopper: Hex;
}

export interface RecoveryRequestPayload {
  institutionId: Hex;
  expectedEpoch: string;
  newAdministrator: Hex;
  newApprovalPublicKey: Hex;
  newEmergencyStopper: Hex;
  nonce: Hex;
  deadline: string;
}

export interface GovernanceLedger {
  state(institutionId: string): Promise<InstitutionLedgerState>;
  suspend(institutionId: string): Promise<{ transactionHash: Hex; state: InstitutionLedgerState }>;
  createRecovery(institutionId: string, now: number): Promise<RecoveryRequestPayload>;
  signRecovery(request: RecoveryRequestPayload, signerUserId: string): Promise<Hex>;
  submitRecovery(request: RecoveryRequestPayload, signatures: Hex[]): Promise<{ transactionHash: Hex; state: InstitutionLedgerState }>;
}

const registryAbi = parseAbi([
  "function institutions(bytes32) view returns (uint8 status,uint64 epoch,address administrator,bytes32 approvalPublicKey,address emergencyStopper,bytes32 directoryHash,uint64 directoryVersion,uint64 policyVersion,bool exists)",
  "function delegations(bytes32) view returns (bytes32 institutionId,uint64 epoch,bytes32 gatewayPublicKey,uint256 purposeMask,uint64 validFrom,uint64 validUntil,bool revoked,bool exists)",
  "function delegationIdUsed(bytes32) view returns (bool)",
  "function grantDelegation(bytes32 delegationId,bytes32 institutionId,uint64 expectedEpoch,bytes32 gatewayPublicKey,uint256 purposeMask,uint64 validFrom,uint64 validUntil)",
  "function revokeDelegation(bytes32 delegationId,uint64 expectedEpoch)",
  "function suspendInstitution(bytes32 institutionId,uint64 expectedEpoch)",
  "function recoverInstitution((bytes32 institutionId,uint64 expectedEpoch,address newAdministrator,bytes32 newApprovalPublicKey,address newEmergencyStopper,bytes32 nonce,uint64 deadline) request,bytes[] signatures)",
]);
const workspaceRoot = resolve(import.meta.dirname, "../../..");
const DEMO_INSTITUTION_ID = "inst_mock_a_city_01HZZZZZZZZZZZZZZZZ";

async function loadLedgerRoles(): Promise<LedgerRoles> {
  return JSON.parse(await readFile(resolve(workspaceRoot, ".local/ledger-roles.json"), "utf8")) as LedgerRoles;
}

async function ledgerClients() {
  const deployment = await loadLedgerDeployment();
  const roles = await loadLedgerRoles();
  const rpcUrl = process.env.BESU_RPC_URL ?? "http://127.0.0.1:18545";
  const chain = { id: Number(deployment.networkId), name: "CallSign Local QBFT", nativeCurrency: { name: "Demo Ether", symbol: "DEMO", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } as const;
  return { deployment, roles, chain, publicClient: createPublicClient({ chain, transport: http(rpcUrl) }) };
}

function institutionKeyFor(deployment: LedgerDeployment, institutionId: string): Hex {
  const institutionKey = keccak256(stringToHex(institutionId));
  if (institutionKey.toLowerCase() !== deployment.institutionId.toLowerCase()) throw new Error("LEDGER_INSTITUTION_MISMATCH");
  return institutionKey;
}

function matchingRoleKey(roles: LedgerRoles, expectedAddress: string, names: Array<keyof LedgerRoles["privateKeys"]>): Hex {
  for (const name of names) {
    const key = roles.privateKeys[name];
    if (privateKeyToAccount(key).address.toLowerCase() === expectedAddress.toLowerCase()) return key;
  }
  throw new Error("LEDGER_ROLE_KEY_NOT_AVAILABLE");
}

export async function loadLedgerDeployment(): Promise<LedgerDeployment> {
  return JSON.parse(await readFile(resolve(workspaceRoot, ".local/deployment.json"), "utf8")) as LedgerDeployment;
}

export async function ensureLedgerDelegation(input: { delegationId: string; institutionId: string; gatewayPublicJwk: JWK; purposeMask: bigint; now: number }): Promise<{ epoch: string; transactionHash?: Hex }> {
  const { deployment, roles, chain, publicClient } = await ledgerClients();
  const institutionKey = institutionKeyFor(deployment, input.institutionId);
  const delegationKey = keccak256(stringToHex(input.delegationId));
  const gatewayKey = `0x${Buffer.from(input.gatewayPublicJwk.x!, "base64url").toString("hex")}` as Hex;
  const institution = await publicClient.readContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "institutions", args: [institutionKey] });
  if (!institution[8] || institution[0] !== 0) throw new Error("LEDGER_INSTITUTION_NOT_ACTIVE");
  const rpcUrl = process.env.BESU_RPC_URL ?? "http://127.0.0.1:18545";
  const account = privateKeyToAccount(matchingRoleKey(roles, institution[2], ["administrator", "recoveryAdministrator"]));
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
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
  const { deployment, roles, chain, publicClient } = await ledgerClients();
  const rpcUrl = process.env.BESU_RPC_URL ?? "http://127.0.0.1:18545";
  const key = keccak256(stringToHex(delegationId));
  const delegation = await publicClient.readContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "delegations", args: [key] });
  const institution = await publicClient.readContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "institutions", args: [delegation[0]] });
  const wallet = createWalletClient({ account: privateKeyToAccount(matchingRoleKey(roles, institution[2], ["administrator", "recoveryAdministrator"])), chain, transport: http(rpcUrl) });
  const hash = await wallet.writeContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "revokeDelegation", args: [key, delegation[1]] });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

async function readInstitutionState(institutionId: string): Promise<InstitutionLedgerState> {
  const { deployment, publicClient } = await ledgerClients();
  const key = institutionKeyFor(deployment, institutionId);
  const institution = await publicClient.readContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "institutions", args: [key] });
  if (!institution[8]) throw new Error("LEDGER_INSTITUTION_NOT_FOUND");
  return { institutionId, status: institution[0] === 0 ? "Active" : "Suspended", epoch: String(institution[1]), administrator: institution[2], emergencyStopper: institution[4] };
}

function recoveryTypedData(deployment: LedgerDeployment, request: RecoveryRequestPayload) {
  return {
    domain: { name: "CallSign Registry", version: "1", chainId: Number(deployment.networkId), verifyingContract: deployment.registryAddress } as const,
    types: { RecoverInstitution: [
      { name: "actionType", type: "bytes32" }, { name: "institutionId", type: "bytes32" }, { name: "expectedEpoch", type: "uint64" },
      { name: "newAdministrator", type: "address" }, { name: "newApprovalPublicKey", type: "bytes32" }, { name: "newEmergencyStopper", type: "address" },
      { name: "nonce", type: "bytes32" }, { name: "deadline", type: "uint64" },
    ] } as const,
    primaryType: "RecoverInstitution" as const,
    message: {
      actionType: keccak256(stringToHex("RECOVER_INSTITUTION")), institutionId: request.institutionId, expectedEpoch: BigInt(request.expectedEpoch),
      newAdministrator: request.newAdministrator, newApprovalPublicKey: request.newApprovalPublicKey, newEmergencyStopper: request.newEmergencyStopper,
      nonce: request.nonce, deadline: BigInt(request.deadline),
    },
  };
}

export const realGovernanceLedger: GovernanceLedger = {
  state: readInstitutionState,

  async suspend(institutionId) {
    const { deployment, roles, chain, publicClient } = await ledgerClients();
    const key = institutionKeyFor(deployment, institutionId);
    const institution = await publicClient.readContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "institutions", args: [key] });
    if (!institution[8] || institution[0] !== 0) throw new Error("LEDGER_INSTITUTION_NOT_ACTIVE");
    const stopperKey = matchingRoleKey(roles, institution[4], ["emergencyStopper", "recoveryEmergencyStopper"]);
    const rpcUrl = process.env.BESU_RPC_URL ?? "http://127.0.0.1:18545";
    const wallet = createWalletClient({ account: privateKeyToAccount(stopperKey), chain, transport: http(rpcUrl) });
    const hash = await wallet.writeContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "suspendInstitution", args: [key, institution[1]] });
    await publicClient.waitForTransactionReceipt({ hash });
    return { transactionHash: hash, state: await readInstitutionState(institutionId) };
  },

  async createRecovery(institutionId, now) {
    const { deployment, roles, publicClient } = await ledgerClients();
    const key = institutionKeyFor(deployment, institutionId);
    const institution = await publicClient.readContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "institutions", args: [key] });
    if (!institution[8] || institution[0] !== 1) throw new Error("LEDGER_INSTITUTION_NOT_SUSPENDED");
    const originalAdministrator = privateKeyToAccount(roles.privateKeys.administrator).address;
    const useRecoveryPair = institution[2].toLowerCase() === originalAdministrator.toLowerCase();
    return {
      institutionId: key,
      expectedEpoch: String(institution[1]),
      newAdministrator: privateKeyToAccount(roles.privateKeys[useRecoveryPair ? "recoveryAdministrator" : "administrator"]).address,
      newApprovalPublicKey: institution[3],
      newEmergencyStopper: privateKeyToAccount(roles.privateKeys[useRecoveryPair ? "recoveryEmergencyStopper" : "emergencyStopper"]).address,
      nonce: keccak256(stringToHex(`recover:${institutionId}:${institution[1]}:${randomUUID()}`)),
      deadline: String(now + 600),
    };
  },

  async signRecovery(request, signerUserId) {
    const { deployment, roles } = await ledgerClients();
    const index = signerUserId.includes("approver_1_") ? 1 : signerUserId.includes("approver_2_") ? 2 : signerUserId.includes("approver_3_") ? 3 : 0;
    if (!index) throw new Error("LEDGER_APPROVER_KEY_NOT_AVAILABLE");
    return privateKeyToAccount(roles.privateKeys[`approver${index}` as "approver1" | "approver2" | "approver3"]).signTypedData(recoveryTypedData(deployment, request));
  },

  async submitRecovery(request, signatures) {
    if (new Set(signatures.map((signature) => signature.toLowerCase())).size < 2) throw new Error("LEDGER_DUPLICATE_RECOVERY_SIGNATURE");
    const { deployment, roles, chain, publicClient } = await ledgerClients();
    const rpcUrl = process.env.BESU_RPC_URL ?? "http://127.0.0.1:18545";
    const wallet = createWalletClient({ account: privateKeyToAccount(roles.privateKeys.administrator), chain, transport: http(rpcUrl) });
    const contractRequest = { ...request, expectedEpoch: BigInt(request.expectedEpoch), deadline: BigInt(request.deadline) };
    const hash = await wallet.writeContract({ address: deployment.registryAddress, abi: registryAbi, functionName: "recoverInstitution", args: [contractRequest, signatures] });
    await publicClient.waitForTransactionReceipt({ hash });
    if (request.institutionId.toLowerCase() !== deployment.institutionId.toLowerCase()) throw new Error("LEDGER_INSTITUTION_MISMATCH");
    const state = await readInstitutionState(DEMO_INSTITUTION_ID);
    return { transactionHash: hash, state };
  },
};
