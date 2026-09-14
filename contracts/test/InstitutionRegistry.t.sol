// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {InstitutionRegistry} from "../src/InstitutionRegistry.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 newTimestamp) external;
}

contract Actor {
    function grant(InstitutionRegistry registry, bytes32 delegationId, bytes32 institutionId, uint64 epoch, bytes32 gatewayKey, uint256 purposeMask, uint64 validFrom, uint64 validUntil) external {
        registry.grantDelegation(delegationId, institutionId, epoch, gatewayKey, purposeMask, validFrom, validUntil);
    }
    function revoke(InstitutionRegistry registry, bytes32 delegationId, uint64 epoch) external { registry.revokeDelegation(delegationId, epoch); }
    function suspend(InstitutionRegistry registry, bytes32 institutionId, uint64 epoch) external { registry.suspendInstitution(institutionId, epoch); }
}

contract InstitutionRegistryTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant PK1 = 0xA11CE;
    uint256 private constant PK2 = 0xB0B;
    uint256 private constant PK3 = 0xCAFE;
    bytes32 private constant INST = keccak256("mock-a-city");
    bytes32 private constant DEL = keccak256("gateway-c-delegation");
    Actor private administrator;
    Actor private stopper;
    Actor private outsider;
    InstitutionRegistry private registry;

    function setUp() public {
        vm.warp(1_800_000_000);
        administrator = new Actor();
        stopper = new Actor();
        outsider = new Actor();
        address[3] memory approvers = [vm.addr(PK1), vm.addr(PK2), vm.addr(PK3)];
        registry = new InstitutionRegistry(approvers);
        InstitutionRegistry.RegisterRequest memory request = _registration(bytes32(uint256(1)));
        bytes[] memory signatures = new bytes[](2);
        bytes32 digest = registry.hashRegistration(request);
        signatures[0] = _sign(PK1, digest);
        signatures[1] = _sign(PK2, digest);
        registry.registerInstitution(request, signatures);
    }

    function testRegistrationAndDelegationLifecycle() public {
        administrator.grant(registry, DEL, INST, 1, bytes32(uint256(0x1234)), 1, uint64(block.timestamp), uint64(block.timestamp + 600));
        _assertTrue(registry.isDelegationActive(DEL, 1, uint64(block.timestamp)));
        stopper.revoke(registry, DEL, 1);
        _assertFalse(registry.isDelegationActive(DEL, 1, uint64(block.timestamp)));
    }

    function testNonOwnerCannotGrantOrRevoke() public {
        (bool grantOk,) = address(outsider).call(abi.encodeCall(Actor.grant, (registry, DEL, INST, 1, bytes32(uint256(1)), 1, uint64(block.timestamp), uint64(block.timestamp + 600))));
        _assertFalse(grantOk);
        administrator.grant(registry, DEL, INST, 1, bytes32(uint256(1)), 1, uint64(block.timestamp), uint64(block.timestamp + 600));
        (bool revokeOk,) = address(outsider).call(abi.encodeCall(Actor.revoke, (registry, DEL, 1)));
        _assertFalse(revokeOk);
    }

    function testSuspendRejectsRepeatAndOldAdministratorGrant() public {
        stopper.suspend(registry, INST, 1);
        (bool repeatOk,) = address(stopper).call(abi.encodeCall(Actor.suspend, (registry, INST, 2)));
        _assertFalse(repeatOk);
        (bool grantOk,) = address(administrator).call(abi.encodeCall(Actor.grant, (registry, DEL, INST, 1, bytes32(uint256(1)), 1, uint64(block.timestamp), uint64(block.timestamp + 600))));
        _assertFalse(grantOk);
    }

    function testRecoveryNeedsDistinctQuorumAndOldDelegationStaysInactive() public {
        administrator.grant(registry, DEL, INST, 1, bytes32(uint256(1)), 1, uint64(block.timestamp), uint64(block.timestamp + 600));
        stopper.suspend(registry, INST, 1);
        Actor nextAdmin = new Actor();
        Actor nextStopper = new Actor();
        InstitutionRegistry.RecoveryRequest memory request = InstitutionRegistry.RecoveryRequest(INST, 2, address(nextAdmin), bytes32(uint256(55)), address(nextStopper), bytes32(uint256(2)), uint64(block.timestamp + 60));
        bytes32 digest = registry.hashRecovery(request);
        bytes[] memory duplicate = new bytes[](2);
        duplicate[0] = _sign(PK1, digest);
        duplicate[1] = _sign(PK1, digest);
        (bool duplicateOk,) = address(registry).call(abi.encodeCall(InstitutionRegistry.recoverInstitution, (request, duplicate)));
        _assertFalse(duplicateOk);
        bytes[] memory quorum = new bytes[](2);
        quorum[0] = _sign(PK1, digest);
        quorum[1] = _sign(PK3, digest);
        registry.recoverInstitution(request, quorum);
        _assertFalse(registry.isDelegationActive(DEL, 1, uint64(block.timestamp)));
        (bool replayOk,) = address(registry).call(abi.encodeCall(InstitutionRegistry.recoverInstitution, (request, quorum)));
        _assertFalse(replayOk);
    }

    function testRegistrationQuorumAndDomainReplayFail() public {
        InstitutionRegistry.RegisterRequest memory request = _registration(bytes32(uint256(9)));
        request.institutionId = keccak256("other-institution");
        bytes[] memory oneSignature = new bytes[](1);
        oneSignature[0] = _sign(PK1, registry.hashRegistration(request));
        (bool quorumOk,) = address(registry).call(abi.encodeCall(InstitutionRegistry.registerInstitution, (request, oneSignature)));
        _assertFalse(quorumOk);

        address[3] memory approvers = [vm.addr(PK1), vm.addr(PK2), vm.addr(PK3)];
        InstitutionRegistry otherRegistry = new InstitutionRegistry(approvers);
        bytes[] memory wrongDomain = new bytes[](2);
        bytes32 thisDigest = registry.hashRegistration(request);
        wrongDomain[0] = _sign(PK1, thisDigest);
        wrongDomain[1] = _sign(PK2, thisDigest);
        (bool domainOk,) = address(otherRegistry).call(abi.encodeCall(InstitutionRegistry.registerInstitution, (request, wrongDomain)));
        _assertFalse(domainOk);
    }

    function _registration(bytes32 nonce) private view returns (InstitutionRegistry.RegisterRequest memory) {
        return InstitutionRegistry.RegisterRequest(INST, address(administrator), bytes32(uint256(44)), address(stopper), keccak256("directory"), 1, 1, nonce, uint64(block.timestamp + 60));
    }

    function _sign(uint256 key, bytes32 digest) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _assertTrue(bool value) private pure { require(value, "assert true"); }
    function _assertFalse(bool value) private pure { require(!value, "assert false"); }
}
