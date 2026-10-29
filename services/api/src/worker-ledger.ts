import { configurationSchema,configurationSigners,assertConfiguration } from './configuration.js';
import { createPublicClient,createWalletClient,decodeFunctionData,encodeFunctionData,fallback,http,keccak256,parseAbi,parseTransaction,recoverTransactionAddress,stringToHex,type Hex,type TransactionSerialized } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { InstitutionRecord } from './finals-model.js';
import { PermanentJobError,type DurableJob,type SignedTransaction,type WorkerLedger } from './service-worker.js';
import { recoveryV2Schema,verifyRecoveryApprovers,registrationSchema,verifyRegistrationApprovers } from './governance-v2.js';
import { z } from 'zod';
export const serviceRegistryAbi=parseAbi([
 'function PROFILE() view returns (bytes32)',
 'function initialPolicyHash() view returns (bytes32)',
 'function policyHashes(bytes32) view returns (bytes32)',
 'function institutions(bytes32) view returns (uint8,uint64,address,bytes32,address,bytes32,uint64,uint64,bool)',
 'function updateConfiguration((bytes32 institutionId,uint64 expectedEpoch,bytes32 expectedDirectoryHash,uint64 expectedDirectoryVersion,uint64 expectedPolicyVersion,bytes32 expectedPolicyHash,bytes32 newDirectoryHash,uint64 newDirectoryVersion,uint64 newPolicyVersion,bytes32 newPolicyHash,bytes32 nonce,uint64 deadline) request,bytes[] signatures)',
 'function registerInstitution((bytes32 institutionId,address administrator,bytes32 approvalPublicKey,address emergencyStopper,bytes32 directoryHash,uint64 directoryVersion,uint64 policyVersion,bytes32 nonce,uint64 deadline) request,bytes[] signatures)',
 'function grantDelegation(bytes32 delegationId,bytes32 institutionId,uint64 expectedEpoch,bytes32 gatewayPublicKey,uint256 purposeMask,uint64 validFrom,uint64 validUntil)',
 'function revokeDelegation(bytes32 delegationId,uint64 expectedEpoch)',
 'function suspendInstitution(bytes32 institutionId,uint64 expectedEpoch)',
 'function recoverInstitution((bytes32 institutionId,uint64 expectedEpoch,address newAdministrator,bytes32 newApprovalPublicKey,address newEmergencyStopper,bytes32 nonce,uint64 deadline) request,bytes[] signatures)',
]);
const abi=serviceRegistryAbi;
export function assertWorkerCalldata(data:Hex|undefined,job:DurableJob){
 if(!data)throw new PermanentJobError('STORED_TRANSACTION_CALL_MISMATCH');
 const decoded=decodeFunctionData({abi,data}),expected={'institution.configure':'updateConfiguration','institution.register':'registerInstitution','institution.recover':'recoverInstitution','institution.suspend':'suspendInstitution','credential.register':'grantDelegation','credential.revoke':'revokeDelegation'}[job.kind];
 if(decoded.functionName!==expected)throw new PermanentJobError('STORED_TRANSACTION_CALL_MISMATCH');
 const args=decoded.args as readonly unknown[],institution=keccak256(stringToHex(job.institution_id));
 if(expected==='grantDelegation'||expected==='revokeDelegation'){
  if(args[0]!==keccak256(stringToHex(job.object_id))||(expected==='grantDelegation'&&(args[1]!==institution||args[4]!==4n)))throw new PermanentJobError('STORED_TRANSACTION_CALL_MISMATCH');
 }else if(expected==='suspendInstitution'){if(args[0]!==institution)throw new PermanentJobError('STORED_TRANSACTION_CALL_MISMATCH');}
 else {
  const payload=job.payload as {request?:Record<string,unknown>;signatures?:unknown},request=args[0] as Record<string,unknown>;
  if(!payload.request||!Array.isArray(payload.signatures)||request.institutionId!==institution||Object.entries(payload.request).some(([k,v])=>String(request[k]).toLowerCase()!==String(v).toLowerCase())||JSON.stringify(args[1]).toLowerCase()!==JSON.stringify(payload.signatures).toLowerCase())throw new PermanentJobError('STORED_TRANSACTION_CALL_MISMATCH');
 }
}
export function workerLedger(config:{networkId:number;genesisHash:string;registry:Hex;codeHash:string;rpcUrls:string[];administratorKey:Hex;stopperKey:Hex;approvers:string[]}):WorkerLedger&{publicClient:ReturnType<typeof createPublicClient>}{
 const chain={id:config.networkId,name:'CallSign QBFT',nativeCurrency:{name:'Demo',symbol:'DEMO',decimals:18},rpcUrls:{default:{http:config.rpcUrls}}};
 const transport=fallback(config.rpcUrls.map(url=>http(url,{timeout:2500,retryCount:0}))),client=createPublicClient({chain,transport});
 const accountFor=(job:DurableJob)=>privateKeyToAccount(job.kind==='institution.suspend'?config.stopperKey:config.administratorKey);
 return {
  publicClient:client,
  signer(job){return accountFor(job).address;},
  async validate(transaction,job){
   if(!/^0x(?:[0-9a-fA-F]{2})+$/.test(transaction.raw))throw new PermanentJobError('STORED_TRANSACTION_INVALID');
   const raw=transaction.raw as TransactionSerialized,parsed=parseTransaction(raw);
   if(keccak256(raw)!==transaction.hash||parsed.chainId!==config.networkId||parsed.to?.toLowerCase()!==config.registry.toLowerCase()||String(parsed.nonce)!==transaction.nonce||(await recoverTransactionAddress({serializedTransaction:raw})).toLowerCase()!==transaction.signer.toLowerCase()||transaction.signer.toLowerCase()!==accountFor(job).address.toLowerCase())throw new PermanentJobError('STORED_TRANSACTION_CONTEXT_INVALID');
   assertWorkerCalldata(parsed.data,job);
   const [genesis,code,chainId]=await Promise.all([client.getBlock({blockNumber:0n}),client.getCode({address:config.registry}),client.getChainId()]);
   if(chainId!==config.networkId||genesis.hash?.toLowerCase()!==config.genesisHash.toLowerCase()||!code||keccak256(code)!==config.codeHash)throw new PermanentJobError('LEDGER_DEPLOYMENT_MISMATCH');
  },
  async prepare(job:DurableJob,record:InstitutionRecord,minimumNonce:bigint){
   const [genesis,code,chainId]=await Promise.all([client.getBlock({blockNumber:0n}),client.getCode({address:config.registry}),client.getChainId()]);
   if(chainId!==config.networkId||genesis.hash?.toLowerCase()!==config.genesisHash.toLowerCase()||!code||keccak256(code)!==config.codeHash)throw new PermanentJobError('LEDGER_DEPLOYMENT_MISMATCH');
   if(await client.readContract({address:config.registry,abi,functionName:'PROFILE'})!==keccak256(stringToHex('CALLSIGN_SERVICE_JOINT_CONFIGURATION_1')))throw new PermanentJobError('SERVICE_REGISTRY_PROFILE_REQUIRED');
   const institution=keccak256(stringToHex(record.id)),credential=record.serviceV3?.credentials[job.object_id];let data:Hex;
   if(job.kind==='institution.register'){
    const b=z.object({request:registrationSchema,signatures:z.array(z.string().regex(/^0x[0-9a-fA-F]{130}$/)).min(2).max(3)}).strict().parse(job.payload),r=b.request;
    if(record.registrationOperation!==job.object_id)throw new PermanentJobError('REGISTRATION_SUPERSEDED');
    if(r.institutionId.toLowerCase()!==institution.toLowerCase()||r.approvalPublicKey.toLowerCase()!==`0x${Buffer.from(record.approvalPublicKey.x!,'base64url').toString('hex')}`)throw new PermanentJobError('REGISTRATION_CONTEXT_MISMATCH');
    await verifyRegistrationApprovers({chainId:config.networkId,registry:config.registry,request:r,signatures:b.signatures as Hex[],approvers:config.approvers,now:Math.floor(Date.now()/1000)});
    data=encodeFunctionData({abi,functionName:'registerInstitution',args:[{institutionId:r.institutionId as Hex,administrator:r.administrator as Hex,approvalPublicKey:r.approvalPublicKey as Hex,emergencyStopper:r.emergencyStopper as Hex,directoryHash:r.directoryHash as Hex,directoryVersion:BigInt(r.directoryVersion),policyVersion:BigInt(r.policyVersion),nonce:r.nonce as Hex,deadline:BigInt(r.deadline)},b.signatures as Hex[]]});
   }else if(job.kind==='institution.configure'){
    const b=z.object({request:configurationSchema,signatures:z.array(z.string().regex(/^0x[0-9a-fA-F]{130}$/)).min(2).max(3)}).strict().parse(job.payload),p=record.configurationProposals?.[job.object_id];
    if(!p||p.status!=='submitted')throw new PermanentJobError('CONFIGURATION_NOT_SUBMITTED');
    assertConfiguration(record,b.request,p.contents);await configurationSigners({chainId:config.networkId,registry:config.registry,request:b.request,signatures:b.signatures as Hex[],approvers:config.approvers,now:Math.floor(Date.now()/1000)});
    const r=b.request;data=encodeFunctionData({abi,functionName:'updateConfiguration',args:[{...r,institutionId:r.institutionId as Hex,expectedDirectoryHash:r.expectedDirectoryHash as Hex,expectedPolicyHash:r.expectedPolicyHash as Hex,newDirectoryHash:r.newDirectoryHash as Hex,newPolicyHash:r.newPolicyHash as Hex,nonce:r.nonce as Hex,expectedEpoch:BigInt(r.expectedEpoch),expectedDirectoryVersion:BigInt(r.expectedDirectoryVersion),expectedPolicyVersion:BigInt(r.expectedPolicyVersion),newDirectoryVersion:BigInt(r.newDirectoryVersion),newPolicyVersion:BigInt(r.newPolicyVersion),deadline:BigInt(r.deadline)},b.signatures as Hex[]]});
   }else if(job.kind==='credential.register'){
    if(!credential||credential.state!=='pending'||credential.vc.credentialStatus.epoch!==record.epoch||record.status!=='active')throw new PermanentJobError('DELEGATION_NO_LONGER_ISSUABLE');
    const vc=credential.vc;data=encodeFunctionData({abi,functionName:'grantDelegation',args:[keccak256(stringToHex(job.object_id)),institution,BigInt(record.epoch),`0x${Buffer.from(vc.credentialSubject.publicKey.x!,'base64url').toString('hex')}`,4n,BigInt(Date.parse(vc.validFrom)/1000),BigInt(Date.parse(vc.validUntil)/1000)]});
   }else if(job.kind==='credential.revoke'){
    if(!credential)throw new PermanentJobError('DELEGATION_NOT_FOUND');data=encodeFunctionData({abi,functionName:'revokeDelegation',args:[keccak256(stringToHex(job.object_id)),BigInt(credential.vc.credentialStatus.epoch)]});
   }else if(job.kind==='institution.suspend')data=encodeFunctionData({abi,functionName:'suspendInstitution',args:[institution,BigInt(record.epoch)]});
   else {
    const b=z.object({request:recoveryV2Schema,signatures:z.array(z.string().regex(/^0x[0-9a-fA-F]{130}$/)).min(2).max(3)}).strict().parse(job.payload);
    if(b.request.institutionId.toLowerCase()!==institution.toLowerCase()||b.request.expectedEpoch!==(record.observedEpoch??record.epoch))throw new PermanentJobError('RECOVERY_INSTITUTION_OR_EPOCH_MISMATCH');
    await verifyRecoveryApprovers({chainId:config.networkId,registry:config.registry,request:b.request,signatures:b.signatures as Hex[],approvers:config.approvers,now:Math.floor(Date.now()/1000)});
    const r=b.request;data=encodeFunctionData({abi,functionName:'recoverInstitution',args:[{institutionId:r.institutionId as Hex,expectedEpoch:BigInt(r.expectedEpoch),newAdministrator:r.newAdministrator as Hex,newApprovalPublicKey:r.newApprovalPublicKey as Hex,newEmergencyStopper:r.newEmergencyStopper as Hex,nonce:r.nonce as Hex,deadline:BigInt(r.deadline)},b.signatures as Hex[]]});
   }
   const account=accountFor(job),pending=BigInt(await client.getTransactionCount({address:account.address,blockTag:'pending'})),nonce=Number(pending>minimumNonce?pending:minimumNonce);
   if(!Number.isSafeInteger(nonce))throw new PermanentJobError('NONCE_OVERFLOW');
   const wallet=createWalletClient({account,chain,transport});const request=await wallet.prepareTransactionRequest({account,to:config.registry,data,nonce,chain,type:'legacy'});
   const raw=await account.signTransaction({type:'legacy',chainId:config.networkId,to:config.registry,data,nonce,gas:request.gas,gasPrice:request.gasPrice});return {raw,hash:keccak256(raw),signer:account.address,nonce:String(nonce)};
  },
  async broadcast(transaction:SignedTransaction){try{const hash=await client.sendRawTransaction({serializedTransaction:transaction.raw as Hex});if(hash!==transaction.hash)throw new Error('TRANSACTION_HASH_MISMATCH');}catch(error){
    // Already-known and lost responses are recovered only by the stored transaction hash.
    const receipt=await this.receipt(transaction.hash);if(!receipt)throw error;
  }},
  async receipt(hash){try{const r=await client.getTransactionReceipt({hash:hash as Hex});return {block:String(r.blockNumber),success:r.status==='success'};}catch(error){if((error as Error).name==='TransactionReceiptNotFoundError')return null;throw error;}}
 };
}
