// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ServiceRegistry} from "../src/ServiceRegistry.sol";
import {InstitutionRegistry} from "../src/InstitutionRegistry.sol";
import {Vm,Actor} from "./InstitutionRegistry.t.sol";
// Deferred source. Does not assert that the deployed Besu contract has been tested.
contract ServiceRegistryTest {
    Vm private constant vm=Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ServiceRegistry private registry;
    bytes32 private constant INST=keccak256("institution");
    Actor private stopper;
    function sign(uint256 key,bytes32 digest) internal returns(bytes memory){(uint8 v,bytes32 r,bytes32 s)=vm.sign(key,digest);return abi.encodePacked(r,s,v);}
    function signatures(bytes32 digest) internal returns(bytes[] memory out){out=new bytes[](2);out[0]=sign(1,digest);out[1]=sign(2,digest);}
    function setUp() public {
        vm.warp(1800000000);stopper=new Actor();
        registry=new ServiceRegistry([vm.addr(1),vm.addr(2),vm.addr(3)],bytes32(uint256(1)));
        InstitutionRegistry.RegisterRequest memory r=InstitutionRegistry.RegisterRequest(INST,address(this),bytes32(uint256(9)),address(stopper),bytes32(uint256(2)),1,1,bytes32(uint256(3)),uint64(block.timestamp+600));
        registry.registerInstitution(r,signatures(registry.hashRegistration(r)));
    }
    function request() internal view returns(ServiceRegistry.ConfigurationRequest memory){return ServiceRegistry.ConfigurationRequest(INST,1,bytes32(uint256(2)),1,1,bytes32(uint256(1)),bytes32(uint256(2)),1,2,bytes32(uint256(4)),bytes32(uint256(5)),uint64(block.timestamp+600));}
    function testPolicyChangeInvalidatesOldDelegationAndRejectsReplay() public {
        bytes32 delegation=keccak256("delegation");registry.grantDelegation(delegation,INST,1,bytes32(uint256(8)),4,uint64(block.timestamp),uint64(block.timestamp+3600));
        ServiceRegistry.ConfigurationRequest memory r=request();bytes[] memory sig=signatures(registry.hashConfiguration(r));registry.updateConfiguration(r,sig);
        require(registry.policyHashes(INST)==r.newPolicyHash);require(!registry.isDelegationActive(delegation,4,uint64(block.timestamp)));
        (bool replay,)=address(registry).call(abi.encodeCall(ServiceRegistry.updateConfiguration,(r,sig)));require(!replay);
    }
    function testDirectoryOnlyChangeKeepsDelegationButLegacyUpdateCannotBypassQuorum() public {
        bytes32 delegation=keccak256("delegation");registry.grantDelegation(delegation,INST,1,bytes32(uint256(8)),4,uint64(block.timestamp),uint64(block.timestamp+3600));
        ServiceRegistry.ConfigurationRequest memory r=request();r.newPolicyHash=r.expectedPolicyHash;r.newPolicyVersion=1;r.newDirectoryHash=bytes32(uint256(6));r.newDirectoryVersion=2;
        registry.updateConfiguration(r,signatures(registry.hashConfiguration(r)));require(registry.isDelegationActive(delegation,4,uint64(block.timestamp)));
        InstitutionRegistry.DirectoryRequest memory old=InstitutionRegistry.DirectoryRequest(INST,1,bytes32(uint256(7)),3,bytes32(uint256(8)),uint64(block.timestamp+60));
        (bool legacy,)=address(registry).call(abi.encodeCall(InstitutionRegistry.updateDirectory,(old,sign(1,registry.hashDirectoryUpdate(old)),sign(2,registry.hashDirectoryUpdate(old)))));require(!legacy);
    }
    function testDuplicateThirdSignerWrongOperationAndChangedContentFail() public {
        ServiceRegistry.ConfigurationRequest memory r=request();bytes32 digest=registry.hashConfiguration(r);bytes[] memory sig=new bytes[](3);sig[0]=sign(1,digest);sig[1]=sign(2,digest);sig[2]=sign(1,digest);
        (bool duplicate,)=address(registry).call(abi.encodeCall(ServiceRegistry.updateConfiguration,(r,sig)));require(!duplicate);
        sig=signatures(digest);r.newPolicyHash=bytes32(uint256(99));(bool changed,)=address(registry).call(abi.encodeCall(ServiceRegistry.updateConfiguration,(r,sig)));require(!changed);
        r=request();r.institutionId=keccak256("other-institution");(bool other,)=address(registry).call(abi.encodeCall(ServiceRegistry.updateConfiguration,(r,sig)));require(!other);
        r=request();r.deadline=uint64(block.timestamp);(bool expired,)=address(registry).call(abi.encodeCall(ServiceRegistry.updateConfiguration,(r,sig)));require(!expired);
        InstitutionRegistry.RecoveryRequest memory recovery=InstitutionRegistry.RecoveryRequest(INST,1,address(this),bytes32(uint256(9)),address(stopper),r.nonce,uint64(block.timestamp+60));
        r=request();(bool crossOperation,)=address(registry).call(abi.encodeCall(ServiceRegistry.updateConfiguration,(r,signatures(registry.hashRecovery(recovery)))));require(!crossOperation);
    }
    function testEmergencyStopperCannotRevokeDelegation() public {
        bytes32 delegation=keccak256("delegation");registry.grantDelegation(delegation,INST,1,bytes32(uint256(8)),4,uint64(block.timestamp),uint64(block.timestamp+3600));
        (bool revoked,)=address(stopper).call(abi.encodeCall(Actor.revoke,(registry,delegation,1)));require(!revoked);stopper.suspend(registry,INST,1);require(!registry.isDelegationActive(delegation,4,uint64(block.timestamp)));
    }
    function testUsedNonceCannotAuthorizeAnotherDirectoryChange() public {
        ServiceRegistry.ConfigurationRequest memory r=request();r.newPolicyHash=r.expectedPolicyHash;r.newPolicyVersion=1;r.newDirectoryHash=bytes32(uint256(6));r.newDirectoryVersion=2;
        registry.updateConfiguration(r,signatures(registry.hashConfiguration(r)));
        r.expectedDirectoryHash=r.newDirectoryHash;r.expectedDirectoryVersion=2;r.newDirectoryHash=bytes32(uint256(7));r.newDirectoryVersion=3;
        (bool reused,)=address(registry).call(abi.encodeCall(ServiceRegistry.updateConfiguration,(r,signatures(registry.hashConfiguration(r)))));require(!reused);
    }
}
