// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {InstitutionRegistry} from "./InstitutionRegistry.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// New deployment only. The historical registry is not an upgradeable proxy.
contract ServiceRegistry is InstitutionRegistry {
    using ECDSA for bytes32;
    bytes32 public constant PROFILE = keccak256("CALLSIGN_SERVICE_JOINT_CONFIGURATION_1");
    bytes32 public immutable initialPolicyHash;
    bytes32 public constant ACTION_CONFIGURATION = keccak256("UPDATE_CONFIGURATION");
    bytes32 private constant CONFIGURATION_TYPEHASH = keccak256("UpdateConfiguration(bytes32 actionType,bytes32 institutionId,uint64 expectedEpoch,bytes32 expectedDirectoryHash,uint64 expectedDirectoryVersion,uint64 expectedPolicyVersion,bytes32 expectedPolicyHash,bytes32 newDirectoryHash,uint64 newDirectoryVersion,uint64 newPolicyVersion,bytes32 newPolicyHash,bytes32 nonce,uint64 deadline)");
    struct ConfigurationRequest {
        bytes32 institutionId;
        uint64 expectedEpoch;
        bytes32 expectedDirectoryHash;
        uint64 expectedDirectoryVersion;
        uint64 expectedPolicyVersion;
        bytes32 expectedPolicyHash;
        bytes32 newDirectoryHash;
        uint64 newDirectoryVersion;
        uint64 newPolicyVersion;
        bytes32 newPolicyHash;
        bytes32 nonce;
        uint64 deadline;
    }
    mapping(bytes32 => bytes32) public policyHashes;
    event ConfigurationUpdated(bytes32 indexed institutionId, uint64 epoch, bytes32 directoryHash, uint64 directoryVersion, uint64 policyVersion, bytes32 policyHash, bool invalidated, bytes32 nonce);

    constructor(address[3] memory signers, bytes32 policyHash) InstitutionRegistry(signers) {
        if (policyHash == bytes32(0)) revert InvalidInput();
        initialPolicyHash = policyHash;
    }
    function registerInstitution(RegisterRequest calldata request, bytes[] calldata signatures) public override {
        if (request.policyVersion != 1 || request.directoryHash == bytes32(0) || request.directoryVersion == 0) revert InvalidInput();
        super.registerInstitution(request, signatures);
        policyHashes[request.institutionId] = initialPolicyHash;
    }
    // Disable the inherited administrator + one approver path, including ABI callers.
    function updateDirectory(DirectoryRequest calldata, bytes calldata, bytes calldata) public pure override {
        revert Unauthorized();
    }
    // A sole emergency key may only suspend its institution.
    function revokeDelegation(bytes32 delegationId, uint64 expectedEpoch) public override {
        if (msg.sender != institutions[delegations[delegationId].institutionId].administrator) revert Unauthorized();
        super.revokeDelegation(delegationId, expectedEpoch);
    }
    function hashConfiguration(ConfigurationRequest calldata r) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(CONFIGURATION_TYPEHASH, ACTION_CONFIGURATION, r)));
    }
    function updateConfiguration(ConfigurationRequest calldata r, bytes[] calldata signatures) external {
        Institution storage i = institutions[r.institutionId];
        if (!i.exists || i.status != Status.Active || i.epoch != r.expectedEpoch || i.directoryHash != r.expectedDirectoryHash || i.directoryVersion != r.expectedDirectoryVersion || i.policyVersion != r.expectedPolicyVersion || policyHashes[r.institutionId] != r.expectedPolicyHash) revert InvalidState();
        if (r.newDirectoryHash == bytes32(0) || r.newPolicyHash == bytes32(0)) revert InvalidInput();
        bool policyChanged = r.newPolicyHash != r.expectedPolicyHash;
        bool directoryChanged = r.newDirectoryHash != r.expectedDirectoryHash;
        if (!policyChanged && !directoryChanged) revert InvalidInput();
        if (policyChanged ? r.newPolicyVersion != i.policyVersion + 1 : r.newPolicyVersion != i.policyVersion) revert InvalidInput();
        if (directoryChanged ? r.newDirectoryVersion != i.directoryVersion + 1 : r.newDirectoryVersion != i.directoryVersion) revert InvalidInput();
        _checkDeadlineAndNonce(r.deadline, r.nonce);
        _requireQuorum(hashConfiguration(r), signatures, 2);
        nonceUsed[r.nonce] = true;
        i.directoryHash = r.newDirectoryHash;
        i.directoryVersion = r.newDirectoryVersion;
        i.policyVersion = r.newPolicyVersion;
        policyHashes[r.institutionId] = r.newPolicyHash;
        // Every policy field is authority-bearing. Directory-only additions do not revoke calls.
        if (policyChanged) i.epoch += 1;
        emit ConfigurationUpdated(r.institutionId, i.epoch, i.directoryHash, i.directoryVersion, i.policyVersion, r.newPolicyHash, policyChanged, r.nonce);
    }
    function _checkDeadlineAndNonce(uint64 deadline, bytes32 nonce) internal view override {
        if (deadline <= block.timestamp || deadline > block.timestamp + 600) revert Expired();
        super._checkDeadlineAndNonce(deadline, nonce);
    }
    function _requireQuorum(bytes32 digest, bytes[] calldata signatures, uint256 threshold) internal view override {
        if (signatures.length < threshold || signatures.length > 3) revert InsufficientQuorum();
        address[3] memory seen;
        for (uint256 n; n < signatures.length; ++n) {
            address signer = digest.recover(signatures[n]);
            if (!registrationApprovers[signer]) revert Unauthorized();
            for (uint256 j; j < n; ++j) if (seen[j] == signer) revert DuplicateSigner();
            seen[n] = signer;
        }
    }
}
