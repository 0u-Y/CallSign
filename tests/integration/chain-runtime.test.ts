// Real, pre-started owned Besu/Witness only. This file starts no node and never selects external RPC.
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='chain')throw new Error('CHAIN_INTEGRATION_EXECUTION_BLOCKED');
import {beforeAll,describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createPublicClient,createWalletClient,http,keccak256,stringToHex,parseEther,type Hex,type Abi} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {registrationTypedData,recoveryTypedData,type Registration} from '../../services/api/src/governance-v2.js';
import {configurationTypedData} from '../../services/api/src/configuration.js';
import {aggregateWitnesses} from '../../services/api/src/witness-aggregate.js';
import {verifyStateBundle,type TrustBundle} from '../../packages/verifier/src/index.js';
import {bankPolicy,policyHash,hashCanonical,initialDirectory} from '../../packages/protocol/src/index.js';
const root=process.env.CALLSIGN_CHAIN_TEST_ROOT;if(!root)throw new Error('OWNED_CHAIN_TEST_ROOT_REQUIRED');
const read=async(p:string)=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const c=await read('synthetic-public-context.json'),d=await read('data/deployment.json'),m=await read('data/public-manifest.json'),ownership=await read('ownership.json');
if(!String(c.institutionId).startsWith('callsign_test_')||ownership.runId!==c.runId||d.networkId!==c.networkId)throw new Error('SYNTHETIC_CHAIN_IDENTITY_REQUIRED');
const urls=(process.env.BESU_NODE_URLS??'').split(',');if(urls.length!==4||urls.some(u=>{try{return new URL(u).hostname!=='127.0.0.1';}catch{return true;}}))throw new Error('ISOLATED_LOOPBACK_CHAIN_REQUIRED');
const abi=(await read('registry.json')).abi as Abi,registry=d.registryAddress as Hex;
const chain={id:Number(c.networkId),name:'Owned synthetic QBFT',nativeCurrency:{name:'Synthetic',symbol:'TEST',decimals:18},rpcUrls:{default:{http:urls}}};
const client=createPublicClient({chain,transport:http(urls[0]!,{timeout:2500,retryCount:0}),pollingInterval:250});
const account=async(role:string)=>privateKeyToAccount((await readFile(resolve(root,'private-keys',role+'.txt'),'utf8')).trim() as Hex);
const deployer=await account('deployer'),administrator=await account('administrator'),stopper=await account('stopper'),approvers=await Promise.all([1,2,3].map(n=>account('approver'+n)));
const nonce=()=>`0x${randomBytes(32).toString('hex')}` as Hex,deadline=()=>String(Math.floor(Date.now()/1000)+300),id=keccak256(stringToHex(c.institutionId)),delegation='callsign_test_delegation_'+c.runId;
const approval=`0x${Buffer.from(m.publicKeys['issuer/approval-v1'].publicJwk.x,'base64url').toString('hex')}` as Hex;
const gateway=`0x${Buffer.from(m.publicKeys['sender/key'].publicJwk.x,'base64url').toString('hex')}` as Hex;
const tx=async(functionName:string,args:readonly unknown[],signer=administrator)=>{
 const wallet=createWalletClient({account:signer,chain,transport:http(urls[0]!,{timeout:2500,retryCount:0})});
 const hash=await wallet.writeContract({address:registry,abi,functionName,args});
 const receipt=await client.waitForTransactionReceipt({hash,timeout:15000});expect(receipt.status).toBe('success');return receipt;
};
const institution=()=>client.readContract({address:registry,abi,functionName:'institutions',args:[id]}) as Promise<readonly [number,bigint,string,string,string,string,bigint,bigint,boolean]>;
const witness=async(version:string)=>{
 const trust:TrustBundle={networkId:d.networkId,genesisHash:d.genesisHash,registryAddress:registry,registryProfile:d.registryProfile,policyVersion:version,witnessThreshold:3,supportedProtocolVersions:[1],enrollmentPublicKey:m.publicKeys['issuer/approval-v1'].publicJwk,witnessPublicKeys:[1,2,3,4].map(n=>({witnessId:`witness-${n}`,kid:m.publicKeys[`witness-keys/witness-${n}`].kid,jwk:m.publicKeys[`witness-keys/witness-${n}`].publicJwk}))};
 const bundle=await aggregateWitnesses({endpoints:[1,2,3,4].map(n=>({witnessId:`witness-${n}`,url:`http://127.0.0.1:${4200+n}`})),institutionId:c.institutionId,delegationId:delegation,trust,timeoutMs:5000});
 return verifyStateBundle(bundle,trust,{nowWallSeconds:Math.floor(Date.now()/1000),nowMonotonicMs:performance.now(),expectedInstitutionId:c.institutionId,expectedDelegationId:delegation,maxStateAgeSeconds:10,maxFutureSkewSeconds:0});
};
let r:Registration;
describe('real isolated Besu contract and independent Witness RPC paths',()=>{
 beforeAll(async()=>{
  expect(keccak256((await client.getCode({address:registry}))!)).toBe(d.registryCodeHash);
  expect(await client.readContract({address:registry,abi,functionName:'PROFILE'})).toBe(keccak256(stringToHex(d.registryProfile)));
  expect(await client.readContract({address:registry,abi,functionName:'initialPolicyHash'})).toBe(`0x${policyHash(bankPolicy)}`);
  const wallet=createWalletClient({account:deployer,chain,transport:http(urls[0]!)});
  for(const a of [administrator,stopper]){const hash=await wallet.sendTransaction({to:a.address,value:parseEther('1')});expect((await client.waitForTransactionReceipt({hash,timeout:15000})).status).toBe('success');}
 });
 it('verifies signed absent state before registration without treating it as active authority',async()=>{
  const state=await witness('0');expect(state.signerIds.length).toBeGreaterThanOrEqual(3);expect(state.snapshot.institutionState.exists).toBe(false);
  for(let n=0;n<3;n++)expect(String(await client.readContract({address:registry,abi,functionName:'approvers',args:[BigInt(n)]})).toLowerCase()).toBe(approvers[n]!.address.toLowerCase());
 });
 it('rejects missing/duplicate quorum at the real entrypoint and registers with two app-encoded signatures',async()=>{
  r={institutionId:id,administrator:administrator.address,approvalPublicKey:approval,emergencyStopper:stopper.address,directoryHash:`0x${hashCanonical(initialDirectory)}`,directoryVersion:'1',policyVersion:'1',nonce:nonce(),deadline:deadline()};
  const signatures=await Promise.all(approvers.slice(0,2).map(a=>a.signTypedData(registrationTypedData(chain.id,registry,r))));
  const payload={...r,directoryVersion:1n,policyVersion:1n,deadline:BigInt(r.deadline)};
  for(const bad of [[],signatures.slice(0,1),[signatures[0],signatures[0]]])await expect(client.simulateContract({address:registry,abi,functionName:'registerInstitution',args:[payload,bad],account:administrator.address})).rejects.toThrow();
  expect(await client.readContract({address:registry,abi,functionName:'nonceUsed',args:[r.nonce]})).toBe(false);
  await tx('registerInstitution',[payload,signatures]);expect((await institution())[8]).toBe(true);
  const state=await witness('1');expect(state.snapshot.institutionState.epoch).toBe('1');expect(state.snapshot.institutionState.exists).toBe(true);
  await expect(client.simulateContract({address:registry,abi,functionName:'registerInstitution',args:[payload,signatures],account:administrator.address})).rejects.toThrow();
 });
 it('confirms a real delegation and rejects a wrong epoch',async()=>{
  const now=BigInt(Math.floor(Date.now()/1000)),args=[keccak256(stringToHex(delegation)),id,1n,gateway,4n,now-1n,now+3600n] as const;
  await expect(client.simulateContract({address:registry,abi,functionName:'grantDelegation',args:[args[0],id,0n,...args.slice(3)],account:administrator.address})).rejects.toThrow();
  await tx('grantDelegation',args);const state=await witness('1');expect(state.snapshot.delegationState.exists).toBe(true);expect(state.snapshot.delegationState.epoch).toBe('1');
 });
 it('executes a jointly signed policy change and observes epoch invalidation via actual Witnesses',async()=>{
  const request={institutionId:id,expectedEpoch:'1',expectedDirectoryHash:r.directoryHash,expectedDirectoryVersion:'1',expectedPolicyVersion:'1',expectedPolicyHash:`0x${policyHash(bankPolicy)}`,newDirectoryHash:r.directoryHash,newDirectoryVersion:'1',newPolicyVersion:'2',newPolicyHash:`0x${policyHash({...bankPolicy,version:2})}`,nonce:nonce(),deadline:deadline()};
  const signatures=await Promise.all(approvers.slice(0,2).map(a=>a.signTypedData(configurationTypedData(chain.id,registry,request))));
  const payload={...request,expectedEpoch:1n,expectedDirectoryVersion:1n,expectedPolicyVersion:1n,newDirectoryVersion:1n,newPolicyVersion:2n,deadline:BigInt(request.deadline)};
  await tx('updateConfiguration',[payload,signatures]);const state=await witness('2');expect(state.snapshot.institutionState.epoch).toBe('2');expect(state.snapshot.delegationState.epoch).toBe('1');
  await expect(client.simulateContract({address:registry,abi,functionName:'updateConfiguration',args:[payload,signatures],account:administrator.address})).rejects.toThrow();
 });
 it('limits emergency suspension to its key and recovers jointly without reviving the old epoch',async()=>{
  await expect(client.simulateContract({address:registry,abi,functionName:'suspendInstitution',args:[id,2n],account:administrator.address})).rejects.toThrow();
  await tx('suspendInstitution',[id,2n],stopper);expect((await witness('2')).snapshot.institutionState.status).toBe('Suspended');
  const request={institutionId:id,expectedEpoch:'3',newAdministrator:administrator.address,newApprovalPublicKey:approval,newEmergencyStopper:stopper.address,nonce:nonce(),deadline:deadline()};
  const signatures=await Promise.all(approvers.slice(0,2).map(a=>a.signTypedData(recoveryTypedData(chain.id,registry,request))));
  const payload={...request,expectedEpoch:3n,deadline:BigInt(request.deadline)};
  await expect(client.simulateContract({address:registry,abi,functionName:'recoverInstitution',args:[payload,signatures.slice(0,1)],account:administrator.address})).rejects.toThrow();
  await tx('recoverInstitution',[payload,signatures]);const state=await witness('2');expect(state.snapshot.institutionState.epoch).toBe('4');expect(state.snapshot.institutionState.status).toBe('Active');expect(state.snapshot.delegationState.epoch).toBe('1');
 });
});
