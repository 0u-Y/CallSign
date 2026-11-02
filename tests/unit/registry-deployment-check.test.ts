import {expect,it,vi} from 'vitest';
import {keccak256,stringToHex,type TransactionSerialized} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {readFile} from 'node:fs/promises';
import {verifyRegistryConfiguration,verifyDeploymentSigner} from '../../scripts/registry-deployment-check.js';
const approvers=['1','2','3'].map(n=>'0x'+n.repeat(40)),policy='0x'+'a'.repeat(64),profile=keccak256(stringToHex('CALLSIGN_SERVICE_JOINT_CONFIGURATION_1'));
it('reads the actual deployed profile, constructor policy and each distinct signer instead of a complete flag',async()=>{
 const artifact=JSON.parse(await readFile('artifacts/service-registry-build-20261027.json','utf8'));
 for(const name of ['PROFILE','initialPolicyHash','registrationApprovers'])expect(artifact.abi.some((x:{name?:string})=>x.name===name)).toBe(true);
 const read=vi.fn(async(name:string)=>name==='PROFILE'?profile:name==='initialPolicyHash'?policy:true);
 await verifyRegistryConfiguration(read,approvers,policy);expect(read).toHaveBeenCalledTimes(5);
 expect(read).toHaveBeenCalledWith('registrationApprovers',[approvers[2]]);
});
it('rejects a different registry profile, policy or signer even with otherwise plausible metadata',async()=>{
 for(const bad of ['PROFILE','initialPolicyHash','registrationApprovers']){
  const read=async(name:string)=>name===bad?(name==='registrationApprovers'?false:'0x'+'0'.repeat(64)):name==='PROFILE'?profile:name==='initialPolicyHash'?policy:true;
  await expect(verifyRegistryConfiguration(read,approvers,policy)).rejects.toThrow('REGISTRY_CONFIGURATION_MISMATCH');
 }
});
it('rejects duplicate signer identities before any chain lookup',async()=>{
 const read=vi.fn();await expect(verifyRegistryConfiguration(read,[approvers[0]!,approvers[0]!,approvers[1]!],policy)).rejects.toThrow('DEPLOYMENT_APPROVERS_INVALID');expect(read).not.toHaveBeenCalled();
});

it('recovers the real pending transaction signer rather than trusting a journal signer label',async()=>{
 // Public fixed fixture only; no operational key generation or RPC.
 const account=privateKeyToAccount('0x'+'1'.repeat(64) as `0x${string}`);
 const raw=await account.signTransaction({type:'legacy',chainId:20261102,nonce:0,gas:100000n,gasPrice:1n,data:'0x6000'}) as TransactionSerialized;
 await verifyDeploymentSigner(raw,account.address);
 await expect(verifyDeploymentSigner(raw,approvers[0]!)).rejects.toThrow('PENDING_DEPLOYMENT_SIGNER_MISMATCH');
});
