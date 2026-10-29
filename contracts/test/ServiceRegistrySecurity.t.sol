// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ServiceRegistryFixture} from "./ServiceRegistry.t.sol";
import {ServiceRegistry} from "../src/ServiceRegistry.sol";
import {InstitutionRegistry} from "../src/InstitutionRegistry.sol";
import {Actor} from "./InstitutionRegistry.t.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
interface SecurityVm {
    struct Log { bytes32[] topics; bytes data; address emitter; }
    function chainId(uint256 value) external;
    function expectRevert(bytes4 selector) external;
    function expectPartialRevert(bytes4 selector) external;
    function recordLogs() external;
    function getRecordedLogs() external returns(Log[] memory);
    function warp(uint256 value) external;
    function addr(uint256 key) external returns(address);
}
contract ServiceRegistrySecurityTest is ServiceRegistryFixture {
    SecurityVm private constant cheat=SecurityVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    function snapshot(bytes32 id,bytes32 nonce) internal view returns(bytes32) {
        (bool ok,bytes memory data)=address(registry).staticcall(abi.encodeWithSignature("institutions(bytes32)",id));require(ok);
        return keccak256(abi.encode(data,registry.policyHashes(id),registry.nonceUsed(nonce)));
    }
    function reject(ServiceRegistry.ConfigurationRequest memory r,bytes[] memory sig,bytes4 error) internal {
        bytes32 beforeState=snapshot(r.institutionId,r.nonce);cheat.recordLogs();cheat.expectPartialRevert(error);
        registry.updateConfiguration(r,sig);
        require(snapshot(r.institutionId,r.nonce)==beforeState,"revert changed state/nonce");
        require(cheat.getRecordedLogs().length==0,"failed change emitted logs");
    }
    function testQuorumCountsOrderAndEveryAdditionalSignature() public {
        ServiceRegistry.ConfigurationRequest memory r=request();bytes32 digest=registry.hashConfiguration(r);
        reject(r,new bytes[](0),InstitutionRegistry.InsufficientQuorum.selector);
        bytes[] memory sig=new bytes[](1);sig[0]=sign(1,digest);reject(r,sig,InstitutionRegistry.InsufficientQuorum.selector);
        sig=new bytes[](4);reject(r,sig,InstitutionRegistry.InsufficientQuorum.selector);
        sig=new bytes[](3);sig[0]=sign(1,digest);sig[1]=sign(2,digest);sig[2]=sign(99,digest);
        reject(r,sig,InstitutionRegistry.Unauthorized.selector);
        sig[2]=sig[0];reject(r,sig,InstitutionRegistry.DuplicateSigner.selector);
        // All three distinct signatures are checked; sorting is not required.
        sig[0]=sign(3,digest);sig[1]=sign(1,digest);sig[2]=sign(2,digest);registry.updateConfiguration(r,sig);
        require(registry.nonceUsed(r.nonce));
    }
    function testMalformedHighSZeroAndInvalidVAreAtomicAtEntryPoint() public {
        ServiceRegistry.ConfigurationRequest memory r=request();bytes32 digest=registry.hashConfiguration(r);bytes[] memory sig=signatures(digest);
        sig[1]=hex"1234";reject(r,sig,ECDSA.ECDSAInvalidSignatureLength.selector);
        sig[1]=new bytes(65);reject(r,sig,ECDSA.ECDSAInvalidSignature.selector);
        bytes memory valid=sign(2,digest);bytes32 rr;bytes32 ss;uint8 v;
        assembly {rr:=mload(add(valid,32)) ss:=mload(add(valid,64)) v:=byte(0,mload(add(valid,96)))}
        uint256 order=0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        sig[1]=abi.encodePacked(rr,bytes32(order-uint256(ss)),uint8(v==27?28:27));reject(r,sig,ECDSA.ECDSAInvalidSignatureS.selector);
        sig[1]=abi.encodePacked(rr,ss,uint8(0));reject(r,sig,ECDSA.ECDSAInvalidSignature.selector);
        registry.updateConfiguration(r,signatures(digest));require(registry.policyHashes(INST)==r.newPolicyHash);
    }
    function registerOther(bytes32 id,Actor emergency) internal {
        InstitutionRegistry.RegisterRequest memory r=InstitutionRegistry.RegisterRequest(id,address(this),bytes32(uint256(9)),address(emergency),bytes32(uint256(2)),1,1,keccak256(abi.encode(id)),uint64(block.timestamp+600));
        registry.registerInstitution(r,signatures(registry.hashRegistration(r)));
    }
    function testChainContractInstitutionActionAndContentReplayUseValidContexts() public {
        ServiceRegistry.ConfigurationRequest memory r=request();bytes32 digest=registry.hashConfiguration(r);bytes[] memory sig=signatures(digest);
        uint256 originalChain=block.chainid;cheat.chainId(originalChain+1);reject(r,sig,InstitutionRegistry.Unauthorized.selector);cheat.chainId(originalChain);
        ServiceRegistry other=new ServiceRegistry([cheat.addr(1),cheat.addr(2),cheat.addr(3)],bytes32(uint256(1)));
        bytes32 wrongContract=other.hashConfiguration(r);reject(r,signatures(wrongContract),InstitutionRegistry.Unauthorized.selector);
        bytes32 secondId=keccak256("registered-second");registerOther(secondId,new Actor());r.institutionId=secondId;
        reject(r,sig,InstitutionRegistry.Unauthorized.selector); // Both institutions actually exist with matching old state.
        r.nonce=keccak256("other-institution-control");registry.updateConfiguration(r,signatures(registry.hashConfiguration(r)));
        r=request();r.newPolicyHash=bytes32(uint256(123));reject(r,sig,InstitutionRegistry.Unauthorized.selector);
        r=request();InstitutionRegistry.RecoveryRequest memory recovery=InstitutionRegistry.RecoveryRequest(INST,1,address(this),bytes32(uint256(9)),address(stopper),r.nonce,r.deadline);
        reject(r,signatures(registry.hashRecovery(recovery)),InstitutionRegistry.Unauthorized.selector);
        registry.updateConfiguration(r,sig);require(registry.nonceUsed(r.nonce));
    }
    function testDeadlineBeforeAtAfterAndTooFarNeverConsumeFailedNonce() public {
        ServiceRegistry.ConfigurationRequest memory r=request();bytes[] memory sig=signatures(registry.hashConfiguration(r));
        uint256 original=block.timestamp;cheat.warp(r.deadline);reject(r,sig,InstitutionRegistry.Expired.selector);
        cheat.warp(uint256(r.deadline)+1);reject(r,sig,InstitutionRegistry.Expired.selector);
        cheat.warp(original);ServiceRegistry.ConfigurationRequest memory tooFar=request();tooFar.deadline=uint64(original+601);
        reject(tooFar,signatures(registry.hashConfiguration(tooFar)),InstitutionRegistry.Expired.selector);
        cheat.warp(uint256(r.deadline)-1);registry.updateConfiguration(r,sig);require(registry.nonceUsed(r.nonce));
    }
    function testCompetingProposalsStaleStateAndNonceReplay() public {
        ServiceRegistry.ConfigurationRequest memory first=request();first.newPolicyHash=first.expectedPolicyHash;first.newPolicyVersion=1;first.newDirectoryHash=bytes32(uint256(6));first.newDirectoryVersion=2;
        ServiceRegistry.ConfigurationRequest memory second=abi.decode(abi.encode(first),(ServiceRegistry.ConfigurationRequest));second.nonce=bytes32(uint256(7));second.newDirectoryHash=bytes32(uint256(8));
        bytes[] memory competing=signatures(registry.hashConfiguration(second));registry.updateConfiguration(first,signatures(registry.hashConfiguration(first)));
        reject(second,competing,InstitutionRegistry.InvalidState.selector);require(!registry.nonceUsed(second.nonce));
        second.expectedDirectoryHash=first.newDirectoryHash;second.expectedDirectoryVersion=2;second.newDirectoryVersion=3;
        registry.updateConfiguration(second,signatures(registry.hashConfiguration(second)));
        second.expectedDirectoryHash=second.newDirectoryHash;second.expectedDirectoryVersion=3;second.newDirectoryHash=bytes32(uint256(9));second.newDirectoryVersion=4;
        reject(second,signatures(registry.hashConfiguration(second)),InstitutionRegistry.NonceAlreadyUsed.selector);
    }
    function testRegistrationRejectsUnregisteredExpiredAndAlteredSignaturesThenSucceeds() public {
        bytes32 id=keccak256("registration-security");Actor emergency=new Actor();
        InstitutionRegistry.RegisterRequest memory r=InstitutionRegistry.RegisterRequest(id,address(this),bytes32(uint256(9)),address(emergency),bytes32(uint256(2)),1,1,keccak256("register-new"),uint64(block.timestamp+600));
        cheat.expectRevert(InstitutionRegistry.InsufficientQuorum.selector);registry.registerInstitution(r,new bytes[](0));
        bytes32 initialState=snapshot(id,r.nonce);
        bytes[] memory one=new bytes[](1);one[0]=sign(1,registry.hashRegistration(r));cheat.expectRevert(InstitutionRegistry.InsufficientQuorum.selector);registry.registerInstitution(r,one);
        bytes[] memory sig=signatures(registry.hashRegistration(r));sig[1]=sign(77,registry.hashRegistration(r));
        cheat.expectRevert(InstitutionRegistry.Unauthorized.selector);registry.registerInstitution(r,sig);require(!registry.nonceUsed(r.nonce));
        sig=signatures(registry.hashRegistration(r));r.approvalPublicKey=bytes32(uint256(10));
        cheat.expectRevert(InstitutionRegistry.Unauthorized.selector);registry.registerInstitution(r,sig);require(!registry.nonceUsed(r.nonce));
        r.deadline=uint64(block.timestamp);sig=signatures(registry.hashRegistration(r));cheat.expectRevert(InstitutionRegistry.Expired.selector);registry.registerInstitution(r,sig);
        require(snapshot(id,r.nonce)==initialState);r.deadline=uint64(block.timestamp+60);registry.registerInstitution(r,signatures(registry.hashRegistration(r)));require(registry.nonceUsed(r.nonce));
    }
    function testRecoveryQuorumKeyBindingTenantAndOldRightsCannotRevive() public {
        bytes32 delegation=keccak256("recovery-delegation");registry.grantDelegation(delegation,INST,1,bytes32(uint256(8)),4,uint64(block.timestamp),uint64(block.timestamp+3600));
        bytes32 revoked=keccak256("revoked-before-recovery");registry.grantDelegation(revoked,INST,1,bytes32(uint256(8)),4,uint64(block.timestamp),uint64(block.timestamp+3600));registry.revokeDelegation(revoked,1);
        bytes32 otherId=keccak256("other-with-own-stopper");registerOther(otherId,new Actor());
        cheat.expectRevert(InstitutionRegistry.Unauthorized.selector);stopper.suspend(registry,otherId,1);
        cheat.expectRevert(InstitutionRegistry.Unauthorized.selector);registry.suspendInstitution(INST,1);
        stopper.suspend(registry,INST,1);require(!registry.isDelegationActive(delegation,4,uint64(block.timestamp)));
        Actor nextAdmin=new Actor();Actor nextStopper=new Actor();
        InstitutionRegistry.RecoveryRequest memory r=InstitutionRegistry.RecoveryRequest(INST,2,address(nextAdmin),bytes32(uint256(99)),address(nextStopper),keccak256("recover-new"),uint64(block.timestamp+60));
        bytes32 beforeState=snapshot(INST,r.nonce);cheat.expectRevert(InstitutionRegistry.InsufficientQuorum.selector);registry.recoverInstitution(r,new bytes[](0));
        bytes[] memory sig=new bytes[](1);sig[0]=sign(1,registry.hashRecovery(r));cheat.expectRevert(InstitutionRegistry.InsufficientQuorum.selector);registry.recoverInstitution(r,sig);
        sig=new bytes[](2);sig[0]=sign(1,registry.hashRecovery(r));sig[1]=sig[0];cheat.expectRevert(InstitutionRegistry.DuplicateSigner.selector);registry.recoverInstitution(r,sig);
        sig=signatures(registry.hashRecovery(r));r.newApprovalPublicKey=bytes32(uint256(100));cheat.expectRevert(InstitutionRegistry.Unauthorized.selector);registry.recoverInstitution(r,sig);require(snapshot(INST,r.nonce)==beforeState);
        registry.recoverInstitution(r,signatures(registry.hashRecovery(r)));require(!registry.isDelegationActive(delegation,4,uint64(block.timestamp))&&!registry.isDelegationActive(revoked,4,uint64(block.timestamp)));
        (,uint64 epoch,,bytes32 key,,,,,)=registry.institutions(INST);require(epoch==3&&key==r.newApprovalPublicKey);
        cheat.expectRevert(InstitutionRegistry.Unauthorized.selector);registry.grantDelegation(keccak256("old-admin"),INST,3,bytes32(uint256(8)),4,uint64(block.timestamp),uint64(block.timestamp+60));
        nextAdmin.grant(registry,keccak256("new-admin"),INST,3,bytes32(uint256(8)),4,uint64(block.timestamp),uint64(block.timestamp+60));
        cheat.expectRevert(InstitutionRegistry.InvalidInput.selector);nextAdmin.grant(registry,delegation,INST,3,bytes32(uint256(8)),4,uint64(block.timestamp),uint64(block.timestamp+60));
        sig=signatures(registry.hashRecovery(r));cheat.expectRevert(InstitutionRegistry.InvalidState.selector);registry.recoverInstitution(r,sig);
    }
    function testFuzzTwoSuccessfulTransitionsAndRejectedStaleProposal(bytes32 directory,bytes32 policy) public {
        // No assume/reject filtering: exactly two successful changes in every fuzz case.
        bytes32 high=bytes32(uint256(1)<<255);directory=directory|high;policy=policy|high;
        ServiceRegistry.ConfigurationRequest memory r=request();r.newPolicyHash=r.expectedPolicyHash;r.newPolicyVersion=1;r.newDirectoryHash=directory;r.newDirectoryVersion=2;
        bytes[] memory oldSignatures=signatures(registry.hashConfiguration(r));registry.updateConfiguration(r,oldSignatures);uint256 successes=1;
        reject(r,oldSignatures,InstitutionRegistry.InvalidState.selector);
        r.expectedDirectoryHash=directory;r.expectedDirectoryVersion=2;r.newDirectoryHash=directory;r.newDirectoryVersion=2;r.newPolicyHash=policy;r.newPolicyVersion=2;r.nonce=keccak256("fuzz-second");
        registry.updateConfiguration(r,signatures(registry.hashConfiguration(r)));successes++;
        (,uint64 epoch,,,,,,uint64 version,)=registry.institutions(INST);require(successes==2&&epoch==2&&version==2);
    }
    function testOldEpochSignatureFailsAfterValidRecoveryWithFreshContextControl() public {
        ServiceRegistry.ConfigurationRequest memory r=request();bytes[] memory old=signatures(registry.hashConfiguration(r));
        stopper.suspend(registry,INST,1);
        InstitutionRegistry.RecoveryRequest memory recovery=InstitutionRegistry.RecoveryRequest(INST,2,address(this),bytes32(uint256(100)),address(stopper),keccak256("epoch-recovery"),uint64(block.timestamp+60));
        registry.recoverInstitution(recovery,signatures(registry.hashRecovery(recovery)));
        r.expectedEpoch=3;reject(r,old,InstitutionRegistry.Unauthorized.selector);
        registry.updateConfiguration(r,signatures(registry.hashConfiguration(r)));
        (,uint64 epoch,,,,,,,)=registry.institutions(INST);require(epoch==4);
    }
    function testInvalidStateVersionHashAndZeroNoncePreserveStateBeforeControl() public {
        ServiceRegistry.ConfigurationRequest memory r=request();r.newPolicyHash=bytes32(0);reject(r,signatures(registry.hashConfiguration(r)),InstitutionRegistry.InvalidInput.selector);
        r=request();r.newPolicyVersion=3;reject(r,signatures(registry.hashConfiguration(r)),InstitutionRegistry.InvalidInput.selector);
        r=request();r.expectedPolicyHash=bytes32(uint256(111));reject(r,signatures(registry.hashConfiguration(r)),InstitutionRegistry.InvalidState.selector);
        r=request();r.expectedEpoch=2;reject(r,signatures(registry.hashConfiguration(r)),InstitutionRegistry.InvalidState.selector);
        r=request();r.nonce=bytes32(0);reject(r,signatures(registry.hashConfiguration(r)),InstitutionRegistry.InvalidInput.selector);
        r=request();registry.updateConfiguration(r,signatures(registry.hashConfiguration(r)));require(registry.nonceUsed(r.nonce));
    }

}
