// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract InstitutionRegistry is EIP712 {
    using ECDSA for bytes32;

    enum Status { Active, Suspended }

    struct Institution {
        Status status;
        uint64 epoch;
        address administrator;
        bytes32 approvalPublicKey;
        address emergencyStopper;
        bytes32 directoryHash;
        uint64 directoryVersion;
        uint64 policyVersion;
        bool exists;
    }

    struct Delegation {
        bytes32 institutionId;
        uint64 epoch;
        bytes32 gatewayPublicKey;
        uint256 purposeMask;
        uint64 validFrom;
        uint64 validUntil;
        bool revoked;
        bool exists;
    }

    struct RegisterRequest {
        bytes32 institutionId;
        address administrator;
        bytes32 approvalPublicKey;
        address emergencyStopper;
        bytes32 directoryHash;
        uint64 directoryVersion;
        uint64 policyVersion;
        bytes32 nonce;
        uint64 deadline;
    }

    struct RecoveryRequest {
        bytes32 institutionId;
        uint64 expectedEpoch;
        address newAdministrator;
        bytes32 newApprovalPublicKey;
        address newEmergencyStopper;
        bytes32 nonce;
        uint64 deadline;
    }

    struct DirectoryRequest {
        bytes32 institutionId;
        uint64 expectedEpoch;
        bytes32 newDirectoryHash;
        uint64 newDirectoryVersion;
        bytes32 nonce;
        uint64 deadline;
    }

    bytes32 public constant ACTION_REGISTER = keccak256("REGISTER_INSTITUTION");
    bytes32 public constant ACTION_RECOVER = keccak256("RECOVER_INSTITUTION");
    bytes32 public constant ACTION_UPDATE_DIRECTORY = keccak256("UPDATE_DIRECTORY");
    bytes32 private constant REGISTER_TYPEHASH = keccak256("RegisterInstitution(bytes32 actionType,bytes32 institutionId,address administrator,bytes32 approvalPublicKey,address emergencyStopper,bytes32 directoryHash,uint64 directoryVersion,uint64 policyVersion,bytes32 nonce,uint64 deadline)");
    bytes32 private constant RECOVERY_TYPEHASH = keccak256("RecoverInstitution(bytes32 actionType,bytes32 institutionId,uint64 expectedEpoch,address newAdministrator,bytes32 newApprovalPublicKey,address newEmergencyStopper,bytes32 nonce,uint64 deadline)");
    bytes32 private constant DIRECTORY_TYPEHASH = keccak256("UpdateDirectory(bytes32 actionType,bytes32 institutionId,uint64 expectedEpoch,bytes32 newDirectoryHash,uint64 newDirectoryVersion,bytes32 nonce,uint64 deadline)");

    mapping(bytes32 => Institution) public institutions;
    mapping(bytes32 => Delegation) public delegations;
    mapping(bytes32 => bool) public delegationIdUsed;
    mapping(bytes32 => bool) public nonceUsed;
    mapping(address => bool) public registrationApprovers;
    address[3] public approvers;

    event InstitutionRegistered(bytes32 indexed institutionId, uint64 epoch, address administrator);
    event DelegationGranted(bytes32 indexed delegationId, bytes32 indexed institutionId, uint64 epoch);
    event DelegationRevoked(bytes32 indexed delegationId, bytes32 indexed institutionId, uint64 epoch);
    event InstitutionSuspended(bytes32 indexed institutionId, uint64 epoch);
    event InstitutionRecovered(bytes32 indexed institutionId, uint64 epoch, address administrator);
    event DirectoryUpdated(bytes32 indexed institutionId, uint64 epoch, bytes32 directoryHash, uint64 directoryVersion);

    error Unauthorized();
    error InvalidState();
    error InvalidInput();
    error Expired();
    error NonceAlreadyUsed();
    error InsufficientQuorum();
    error DuplicateSigner();

    constructor(address[3] memory initialApprovers) EIP712("CallSign Registry", "1") {
        for (uint256 i = 0; i < 3; ++i) {
            address signer = initialApprovers[i];
            if (signer == address(0) || registrationApprovers[signer]) revert InvalidInput();
            registrationApprovers[signer] = true;
            approvers[i] = signer;
        }
    }

    function hashRegistration(RegisterRequest calldata request) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            REGISTER_TYPEHASH, ACTION_REGISTER, request.institutionId, request.administrator,
            request.approvalPublicKey, request.emergencyStopper, request.directoryHash,
            request.directoryVersion, request.policyVersion, request.nonce, request.deadline
        )));
    }

    function registerInstitution(RegisterRequest calldata request, bytes[] calldata signatures) external {
        if (institutions[request.institutionId].exists) revert InvalidState();
        if (request.institutionId == bytes32(0) || request.administrator == address(0) || request.emergencyStopper == address(0) || request.approvalPublicKey == bytes32(0) || request.policyVersion == 0) revert InvalidInput();
        _checkDeadlineAndNonce(request.deadline, request.nonce);
        _requireQuorum(hashRegistration(request), signatures, 2);
        nonceUsed[request.nonce] = true;
        institutions[request.institutionId] = Institution({
            status: Status.Active,
            epoch: 1,
            administrator: request.administrator,
            approvalPublicKey: request.approvalPublicKey,
            emergencyStopper: request.emergencyStopper,
            directoryHash: request.directoryHash,
            directoryVersion: request.directoryVersion,
            policyVersion: request.policyVersion,
            exists: true
        });
        emit InstitutionRegistered(request.institutionId, 1, request.administrator);
    }

    function grantDelegation(
        bytes32 delegationId,
        bytes32 institutionId,
        uint64 expectedEpoch,
        bytes32 gatewayPublicKey,
        uint256 purposeMask,
        uint64 validFrom,
        uint64 validUntil
    ) external {
        Institution storage institution = institutions[institutionId];
        if (!institution.exists || institution.status != Status.Active || institution.epoch != expectedEpoch) revert InvalidState();
        if (msg.sender != institution.administrator) revert Unauthorized();
        if (delegationId == bytes32(0) || delegationIdUsed[delegationId] || gatewayPublicKey == bytes32(0) || purposeMask == 0 || validFrom >= validUntil || validUntil <= block.timestamp) revert InvalidInput();
        delegationIdUsed[delegationId] = true;
        delegations[delegationId] = Delegation(institutionId, expectedEpoch, gatewayPublicKey, purposeMask, validFrom, validUntil, false, true);
        emit DelegationGranted(delegationId, institutionId, expectedEpoch);
    }

    function revokeDelegation(bytes32 delegationId, uint64 expectedEpoch) external {
        Delegation storage delegation = delegations[delegationId];
        Institution storage institution = institutions[delegation.institutionId];
        if (!delegation.exists || delegation.revoked || institution.epoch != expectedEpoch || delegation.epoch != expectedEpoch) revert InvalidState();
        if (msg.sender != institution.administrator && msg.sender != institution.emergencyStopper) revert Unauthorized();
        delegation.revoked = true;
        emit DelegationRevoked(delegationId, delegation.institutionId, expectedEpoch);
    }

    function suspendInstitution(bytes32 institutionId, uint64 expectedEpoch) external {
        Institution storage institution = institutions[institutionId];
        if (!institution.exists || institution.status != Status.Active || institution.epoch != expectedEpoch) revert InvalidState();
        if (msg.sender != institution.emergencyStopper) revert Unauthorized();
        institution.status = Status.Suspended;
        unchecked { institution.epoch += 1; }
        emit InstitutionSuspended(institutionId, institution.epoch);
    }

    function hashRecovery(RecoveryRequest calldata request) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            RECOVERY_TYPEHASH, ACTION_RECOVER, request.institutionId, request.expectedEpoch,
            request.newAdministrator, request.newApprovalPublicKey, request.newEmergencyStopper,
            request.nonce, request.deadline
        )));
    }

    function recoverInstitution(RecoveryRequest calldata request, bytes[] calldata signatures) external {
        Institution storage institution = institutions[request.institutionId];
        if (!institution.exists || institution.status != Status.Suspended || institution.epoch != request.expectedEpoch) revert InvalidState();
        if (request.newAdministrator == address(0) || request.newEmergencyStopper == address(0) || request.newApprovalPublicKey == bytes32(0)) revert InvalidInput();
        _checkDeadlineAndNonce(request.deadline, request.nonce);
        _requireQuorum(hashRecovery(request), signatures, 2);
        nonceUsed[request.nonce] = true;
        institution.administrator = request.newAdministrator;
        institution.approvalPublicKey = request.newApprovalPublicKey;
        institution.emergencyStopper = request.newEmergencyStopper;
        institution.status = Status.Active;
        unchecked { institution.epoch += 1; }
        emit InstitutionRecovered(request.institutionId, institution.epoch, request.newAdministrator);
    }

    function hashDirectoryUpdate(DirectoryRequest calldata request) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            DIRECTORY_TYPEHASH, ACTION_UPDATE_DIRECTORY, request.institutionId, request.expectedEpoch,
            request.newDirectoryHash, request.newDirectoryVersion, request.nonce, request.deadline
        )));
    }

    function updateDirectory(DirectoryRequest calldata request, bytes calldata administratorSignature, bytes calldata approverSignature) external {
        Institution storage institution = institutions[request.institutionId];
        if (!institution.exists || institution.status != Status.Active || institution.epoch != request.expectedEpoch || request.newDirectoryVersion <= institution.directoryVersion || request.newDirectoryHash == bytes32(0)) revert InvalidState();
        _checkDeadlineAndNonce(request.deadline, request.nonce);
        bytes32 digest = hashDirectoryUpdate(request);
        if (digest.recover(administratorSignature) != institution.administrator) revert Unauthorized();
        address approver = digest.recover(approverSignature);
        if (!registrationApprovers[approver] || approver == institution.administrator) revert Unauthorized();
        nonceUsed[request.nonce] = true;
        institution.directoryHash = request.newDirectoryHash;
        institution.directoryVersion = request.newDirectoryVersion;
        emit DirectoryUpdated(request.institutionId, institution.epoch, request.newDirectoryHash, request.newDirectoryVersion);
    }

    function isDelegationActive(bytes32 delegationId, uint256 purposeBit, uint64 atTime) external view returns (bool) {
        Delegation storage delegation = delegations[delegationId];
        Institution storage institution = institutions[delegation.institutionId];
        return delegation.exists && !delegation.revoked && institution.exists && institution.status == Status.Active && delegation.epoch == institution.epoch && atTime >= delegation.validFrom && atTime < delegation.validUntil && (delegation.purposeMask & purposeBit) == purposeBit;
    }

    function _checkDeadlineAndNonce(uint64 deadline, bytes32 nonce) private view {
        if (deadline < block.timestamp) revert Expired();
        if (nonce == bytes32(0)) revert InvalidInput();
        if (nonceUsed[nonce]) revert NonceAlreadyUsed();
    }

    function _requireQuorum(bytes32 digest, bytes[] calldata signatures, uint256 threshold) private view {
        if (signatures.length < threshold) revert InsufficientQuorum();
        address[3] memory seen;
        uint256 valid;
        for (uint256 i = 0; i < signatures.length; ++i) {
            address signer = digest.recover(signatures[i]);
            if (!registrationApprovers[signer]) revert Unauthorized();
            for (uint256 j = 0; j < valid; ++j) if (seen[j] == signer) revert DuplicateSigner();
            seen[valid] = signer;
            unchecked { ++valid; }
            if (valid == threshold) return;
        }
        revert InsufficientQuorum();
    }
}
