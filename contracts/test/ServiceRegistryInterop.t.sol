// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ServiceRegistry} from "../src/ServiceRegistry.sol";
import {InstitutionRegistry} from "../src/InstitutionRegistry.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SecurityVm} from "./ServiceRegistrySecurity.t.sol";
interface InteropVm {
    function readFile(string calldata path) external view returns(string memory);
    function parseJsonBytes(string calldata json,string calldata key) external pure returns(bytes memory);
    function parseJsonBytes32(string calldata json,string calldata key) external pure returns(bytes32);
    function parseJsonAddress(string calldata json,string calldata key) external pure returns(address);
    function parseJsonUint(string calldata json,string calldata key) external pure returns(uint256);
    function addr(uint256 key) external returns(address);
    function prank(address sender) external;
    function chainId(uint256 value) external;
    function warp(uint256 value) external;
    function expectRevert(bytes4 error) external;
    function recordLogs() external;
    function getRecordedLogs() external returns(SecurityVm.Log[] memory);
}
contract ServiceRegistryInteropTest {
    InteropVm private constant vm=InteropVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ServiceRegistry private registry;
    function payload(bytes memory data) internal pure returns(bytes memory out){require(data.length>=4);out=new bytes(data.length-4);for(uint256 n;n<out.length;++n)out[n]=data[n+4];}
    function execute(bytes memory data) internal { (bool ok,bytes memory result)=address(registry).call(data);if(!ok)assembly{revert(add(result,32),mload(result))} }
    function registration(string memory json) internal {
        bytes memory data=vm.parseJsonBytes(json,".registrationCalldata");require(bytes4(data)==ServiceRegistry.registerInstitution.selector);
        (InstitutionRegistry.RegisterRequest memory r,bytes[] memory sig)=abi.decode(payload(data),(InstitutionRegistry.RegisterRequest,bytes[]));
        require(registry.hashRegistration(r)==vm.parseJsonBytes32(json,".registrationDigest"));
        require(ECDSA.recover(registry.hashRegistration(r),sig[0])==vm.addr(1));execute(data);require(registry.nonceUsed(r.nonce));
    }
    function configuration(string memory json) internal {
        bytes memory data=vm.parseJsonBytes(json,".configurationCalldata");require(bytes4(data)==ServiceRegistry.updateConfiguration.selector);
        (ServiceRegistry.ConfigurationRequest memory r,bytes[] memory sig)=abi.decode(payload(data),(ServiceRegistry.ConfigurationRequest,bytes[]));
        require(registry.hashConfiguration(r)==vm.parseJsonBytes32(json,".configurationDigest"));
        require(ECDSA.recover(registry.hashConfiguration(r),sig[1])==vm.addr(2));
        bytes32 expected=r.newPolicyHash;r.newPolicyHash=keccak256("tampered-but-structurally-valid");
        vm.expectRevert(InstitutionRegistry.Unauthorized.selector);registry.updateConfiguration(r,sig);
        require(!registry.nonceUsed(r.nonce)&&registry.policyHashes(r.institutionId)==r.expectedPolicyHash);
        r.newPolicyHash=expected;vm.recordLogs();execute(data);SecurityVm.Log[] memory logs=vm.getRecordedLogs();require(logs.length==1);
        require(logs[0].emitter==address(registry)&&logs[0].topics.length==2);
        require(logs[0].topics[0]==vm.parseJsonBytes32(json,".configurationEventTopics[0]"));
        require(logs[0].topics[1]==r.institutionId);
        require(keccak256(logs[0].data)==keccak256(vm.parseJsonBytes(json,".configurationEventData")));
    }
    function recovery(string memory json) internal {
        vm.prank(vm.addr(5));registry.suspendInstitution(vm.parseJsonBytes32(json,".institutionId"),2);
        bytes memory data=vm.parseJsonBytes(json,".recoveryCalldata");require(bytes4(data)==InstitutionRegistry.recoverInstitution.selector);
        (InstitutionRegistry.RecoveryRequest memory r,bytes[] memory sig)=abi.decode(payload(data),(InstitutionRegistry.RecoveryRequest,bytes[]));
        require(registry.hashRecovery(r)==vm.parseJsonBytes32(json,".recoveryDigest"));
        require(ECDSA.recover(registry.hashRecovery(r),sig[0])==vm.addr(1));execute(data);
        (,uint64 epoch,address admin,bytes32 key,,,,,)=registry.institutions(r.institutionId);require(epoch==4&&admin==r.newAdministrator&&key==r.newApprovalPublicKey);
    }
    function testApplicationTypedDataCalldataSignaturesAndConsumerEventMatchEvm() public {
        string memory json=vm.readFile("artifacts/contract-interop-fixture-20261030.json");vm.chainId(vm.parseJsonUint(json,".chainId"));vm.warp(1800000000);
        address[3] memory approvers=[vm.addr(1),vm.addr(2),vm.addr(3)];vm.prank(vm.addr(99));
        registry=new ServiceRegistry(approvers,vm.parseJsonBytes32(json,".initialPolicyHash"));
        require(address(registry)==vm.parseJsonAddress(json,".registry"),"fixture CREATE identity mismatch");
        registration(json);configuration(json);recovery(json);
    }
}
