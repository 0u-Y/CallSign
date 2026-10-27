import { expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { recoveryTypedData, verifyRecoveryApprovers } from "../../services/api/src/governance-v2.js";
it("requires two distinct approved signers and binds the recovery action to chain and contract", async () => {
  // Public deterministic keys are fixtures only, never provisioned in deployment files.
  const accounts = [1,2,3].map(i => privateKeyToAccount(`0x${i.toString(16).padStart(64,"0")}` as Hex));
  const request = { institutionId: `0x${"1".repeat(64)}`, expectedEpoch: "1", newAdministrator: accounts[0]!.address, newApprovalPublicKey: `0x${"2".repeat(64)}`, newEmergencyStopper: accounts[1]!.address, nonce: `0x${"3".repeat(64)}`, deadline: "1800000300" };
  const registry = `0x${"4".repeat(40)}` as Hex;
  const signatures = await Promise.all(accounts.slice(0,2).map(a => a.signTypedData(recoveryTypedData(20260914,registry,request))));
  const input = { chainId: 20260914, registry, request, signatures, approvers: accounts.map(a => a.address), now: 1800000000 };
  expect(await verifyRecoveryApprovers(input)).toHaveLength(2);
  await expect(verifyRecoveryApprovers({ ...input, signatures: [signatures[0]!, signatures[0]!] })).rejects.toThrow("RECOVERY_SIGNER_INVALID_OR_DUPLICATE");
  await expect(verifyRecoveryApprovers({ ...input, chainId: 1 })).rejects.toThrow("RECOVERY_SIGNER_INVALID_OR_DUPLICATE");
});
