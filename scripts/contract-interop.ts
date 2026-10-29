// Public deterministic test keys only. Never read deployment keys, providers or RPC configuration.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {encodeFunctionData,encodeAbiParameters,encodeEventTopics,getContractAddress,hashTypedData,keccak256,stringToHex,type Hex,type AbiEvent} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {configurationTypedData,type ConfigurationRequest} from '../packages/protocol/src/index.js';
import {registrationTypedData,recoveryTypedData} from '../services/api/src/governance-v2.js';
import {serviceRegistryAbi} from '../services/api/src/worker-ledger.js';
import {events} from '../services/api/src/ledger-events.js';
const key=(n:number)=>privateKeyToAccount(`0x${n.toString(16).padStart(64,'0')}`);
const hash=(s:string)=>keccak256(stringToHex(s));
export async function contractInteropVector(){
 const chainId=31337,registry=getContractAddress({from:key(99).address,nonce:0n}),institutionId=hash('callsign:public-contract-fixture');
 const registration={institutionId,administrator:key(4).address,approvalPublicKey:hash('public-issuer-key'),emergencyStopper:key(5).address,directoryHash:hash('public-directory'),directoryVersion:'1',policyVersion:'1',nonce:hash('public-register-nonce'),deadline:'1800000600'};
 const configuration:ConfigurationRequest={institutionId,expectedEpoch:'1',expectedDirectoryHash:registration.directoryHash,expectedDirectoryVersion:'1',expectedPolicyVersion:'1',expectedPolicyHash:hash('initial-policy'),newDirectoryHash:registration.directoryHash,newDirectoryVersion:'1',newPolicyVersion:'2',newPolicyHash:hash('new-policy'),nonce:hash('public-config-nonce'),deadline:registration.deadline};
 const recovery={institutionId,expectedEpoch:'3',newAdministrator:key(6).address,newApprovalPublicKey:hash('replacement-issuer-key'),newEmergencyStopper:key(7).address,nonce:hash('public-recovery-nonce'),deadline:registration.deadline};
 const reg=registrationTypedData(chainId,registry,registration),config=configurationTypedData(chainId,registry,configuration),recover=recoveryTypedData(chainId,registry,recovery);
 const regSignatures=await Promise.all([key(1).signTypedData(reg),key(2).signTypedData(reg)]),configSignatures=await Promise.all([key(1).signTypedData(config),key(2).signTypedData(config)]),recoverSignatures=await Promise.all([key(1).signTypedData(recover),key(2).signTypedData(recover)]);
 const regArgs={...reg.message};delete (regArgs as Partial<typeof regArgs>).actionType;
 const configArgs={...config.message};delete configArgs.actionType;
 const recoverArgs={...recover.message};delete (recoverArgs as Partial<typeof recoverArgs>).actionType;
 const changed=events.find(e=>e.name==='ConfigurationUpdated') as AbiEvent;
 const eventArgs={institutionId,epoch:2n,directoryHash:configuration.newDirectoryHash as Hex,directoryVersion:1n,policyVersion:2n,policyHash:configuration.newPolicyHash as Hex,invalidated:true,nonce:configuration.nonce as Hex};
 const nonIndexed=changed.inputs.filter(i=>!i.indexed);
 return {profile:'public-fixture-not-deployment',chainId,registry,institutionId,initialPolicyHash:configuration.expectedPolicyHash,registration,configuration,recovery,
 registrationDigest:hashTypedData(reg),configurationDigest:hashTypedData(config),recoveryDigest:hashTypedData(recover),
 registrationCalldata:encodeFunctionData({abi:serviceRegistryAbi,functionName:'registerInstitution',args:[regArgs,regSignatures]}),
 configurationCalldata:encodeFunctionData({abi:serviceRegistryAbi,functionName:'updateConfiguration',args:[configArgs as never,configSignatures]}),
 recoveryCalldata:encodeFunctionData({abi:serviceRegistryAbi,functionName:'recoverInstitution',args:[recoverArgs,recoverSignatures]}),
 configurationEventTopics:encodeEventTopics({abi:events,eventName:'ConfigurationUpdated',args:eventArgs}),
 configurationEventData:encodeAbiParameters(nonIndexed,nonIndexed.map(i=>eventArgs[i.name as keyof typeof eventArgs]))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [artifactPath,output]=process.argv.slice(2);if(!artifactPath||!output)throw new Error('LOCAL_COMPILED_ARTIFACT_AND_NEW_FIXTURE_PATH_REQUIRED');
 const artifact=JSON.parse(await readFile(artifactPath,'utf8')),v=await contractInteropVector();
 // Encoding through the actual compiled ABI must match the ABI used by the worker.
 const {decodeFunctionData}=await import('viem');
 for(const data of [v.registrationCalldata,v.configurationCalldata,v.recoveryCalldata]){const d=decodeFunctionData({abi:serviceRegistryAbi,data});if(encodeFunctionData({abi:artifact.abi,functionName:d.functionName,args:d.args})!==data)throw new Error('COMPILED_WORKER_ABI_MISMATCH');}
 const {decodeEventLog}=await import('viem');const event=decodeEventLog({abi:artifact.abi,data:v.configurationEventData,topics:v.configurationEventTopics as [Hex,...Hex[]]});if(!event||typeof event!=='object'||!('eventName' in event)||event.eventName!=='ConfigurationUpdated')throw new Error('COMPILED_EVENT_ABI_MISMATCH');
 await writeFile(output,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o644});console.log('Public fixture generated from application typed-data, worker ABI and consumer event ABI; no RPC.');
}
