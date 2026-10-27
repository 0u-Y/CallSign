import { createPublicClient, createWalletClient, fallback, http, keccak256, parseAbi, recoverTypedDataAddress, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

export const recoveryV2Schema = z.object({ institutionId: z.string().regex(/^0x[0-9a-fA-F]{64}$/), expectedEpoch: z.string().regex(/^\d+$/), newAdministrator: z.string().regex(/^0x[0-9a-fA-F]{40}$/), newApprovalPublicKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/), newEmergencyStopper: z.string().regex(/^0x[0-9a-fA-F]{40}$/), nonce: z.string().regex(/^0x[0-9a-fA-F]{64}$/), deadline: z.string().regex(/^\d+$/) }).strict();
export type RecoveryV2 = z.infer<typeof recoveryV2Schema>;
export function recoveryTypedData(chainId: number, registry: Hex, request: RecoveryV2) {
  return { domain: { name: "CallSign Registry", version: "1", chainId, verifyingContract: registry },
    types: { RecoverInstitution: [{ name: "actionType", type: "bytes32" }, { name: "institutionId", type: "bytes32" }, { name: "expectedEpoch", type: "uint64" }, { name: "newAdministrator", type: "address" }, { name: "newApprovalPublicKey", type: "bytes32" }, { name: "newEmergencyStopper", type: "address" }, { name: "nonce", type: "bytes32" }, { name: "deadline", type: "uint64" }] }, primaryType: "RecoverInstitution",
    message: { actionType: keccak256(stringToHex("RECOVER_INSTITUTION")), ...request, institutionId: request.institutionId as Hex, expectedEpoch: BigInt(request.expectedEpoch), newAdministrator: request.newAdministrator as Hex, newApprovalPublicKey: request.newApprovalPublicKey as Hex, newEmergencyStopper: request.newEmergencyStopper as Hex, nonce: request.nonce as Hex, deadline: BigInt(request.deadline) } } as const;
}
export async function verifyRecoveryApprovers(input: { chainId: number; registry: Hex; request: RecoveryV2; signatures: Hex[]; approvers: string[]; now: number }) {
  const request = recoveryV2Schema.parse(input.request);
  if (BigInt(request.deadline) <= BigInt(input.now) || BigInt(request.deadline) > BigInt(input.now + 600)) throw new Error("RECOVERY_EXPIRED_OR_TOO_LONG");
  if (input.approvers.length !== 3 || new Set(input.approvers.map(a => a.toLowerCase())).size !== 3) throw new Error("RECOVERY_TRUST_INVALID");
  const signers = new Set<string>();
  if (input.signatures.length < 2 || input.signatures.length > 3) throw new Error("RECOVERY_THRESHOLD_NOT_MET");
  for (const signature of input.signatures) {
    const signer = (await recoverTypedDataAddress({ ...recoveryTypedData(input.chainId, input.registry, request), signature })).toLowerCase();
    if (!input.approvers.some(a => a.toLowerCase() === signer) || signers.has(signer)) throw new Error("RECOVERY_SIGNER_INVALID_OR_DUPLICATE"); signers.add(signer);
  }
  return [...signers];
}
const abi = parseAbi([
  "function grantDelegation(bytes32 delegationId,bytes32 institutionId,uint64 expectedEpoch,bytes32 gatewayPublicKey,uint256 purposeMask,uint64 validFrom,uint64 validUntil)",
  "function revokeDelegation(bytes32 delegationId,uint64 expectedEpoch)",
  "function recoverInstitution((bytes32 institutionId,uint64 expectedEpoch,address newAdministrator,bytes32 newApprovalPublicKey,address newEmergencyStopper,bytes32 nonce,uint64 deadline) request,bytes[] signatures)",
  "function suspendInstitution(bytes32 institutionId,uint64 expectedEpoch)",
]);
export class RegistryOperations {
  constructor(private readonly config: { networkId: number; registry: Hex; rpcUrls: string[]; operatorKey: Hex; approvers: string[]; institutionId: string }) {}
  async recover(request: RecoveryV2, signatures: Hex[]) {
    if (request.institutionId.toLowerCase() !== keccak256(stringToHex(this.config.institutionId)).toLowerCase()) throw new Error("RECOVERY_INSTITUTION_MISMATCH");
    await verifyRecoveryApprovers({ chainId: this.config.networkId, registry: this.config.registry, request, signatures, approvers: this.config.approvers, now: Math.floor(Date.now()/1000) });
    return this.submit("recoverInstitution", [{ ...request, institutionId: request.institutionId as Hex, expectedEpoch: BigInt(request.expectedEpoch), newAdministrator: request.newAdministrator as Hex, newApprovalPublicKey: request.newApprovalPublicKey as Hex, newEmergencyStopper: request.newEmergencyStopper as Hex, nonce: request.nonce as Hex, deadline: BigInt(request.deadline) }, signatures]);
  }
  async grantCredential(input: { digest: string; epoch: string; servicePublicKey: string; validFrom: number; validUntil: number }) {
    if (!/^[0-9a-f]{64}$/.test(input.digest) || !/^0x[0-9a-f]{64}$/.test(input.servicePublicKey)) throw new Error("DELEGATION_INPUT_INVALID");
    return this.submit("grantDelegation", [keccak256(stringToHex(input.digest)), keccak256(stringToHex(this.config.institutionId)), BigInt(input.epoch), input.servicePublicKey as Hex, 4n, BigInt(input.validFrom), BigInt(input.validUntil)]);
  }
  async revokeCredential(digest: string, epoch: string) { if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error("VC_DIGEST_INVALID"); return this.submit("revokeDelegation", [keccak256(stringToHex(digest)), BigInt(epoch)]); }
  async suspend(epoch: string) { return this.submit("suspendInstitution", [keccak256(stringToHex(this.config.institutionId)), BigInt(epoch)]); }
  private async submit(functionName: "recoverInstitution" | "suspendInstitution" | "grantDelegation" | "revokeDelegation", args: readonly unknown[]) {
    if (!this.config.rpcUrls.length) throw new Error("RPC_NOT_CONFIGURED");
    const transport = fallback(this.config.rpcUrls.map(url => http(url, { timeout: 2500, retryCount: 0 })));
    const chain = { id: this.config.networkId, name: "CallSign QBFT", nativeCurrency: { name: "Demo", symbol: "DEMO", decimals: 18 }, rpcUrls: { default: { http: this.config.rpcUrls } } };
    const account = privateKeyToAccount(this.config.operatorKey); const wallet = createWalletClient({ account, chain, transport });
    const hash = await wallet.writeContract({ address: this.config.registry, abi, functionName, args } as Parameters<typeof wallet.writeContract>[0]);
    const receipt = await createPublicClient({ chain, transport }).waitForTransactionReceipt({ hash, timeout: 15000 });
    if (receipt.status !== "success") throw new Error("REGISTRY_TRANSACTION_REVERTED"); return { transactionHash: hash, blockNumber: String(receipt.blockNumber) };
  }
}
