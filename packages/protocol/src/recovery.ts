import {z} from 'zod';
type Hex=`0x${string}`;

// Match the contract: 65 bytes, low S, and v=27/28.
export function assertEvmSignature(signature:string){if(!/^0x[0-9a-fA-F]{128}(1[bBcC])$/.test(signature)||BigInt(`0x${signature.slice(66,130)}`)>0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0n||BigInt(`0x${signature.slice(66,130)}`)===0n)throw new Error('EVM_SIGNATURE_NON_CANONICAL');}
export const recoveryV2Schema=z.object({institutionId:z.string().regex(/^0x[0-9a-fA-F]{64}$/),expectedEpoch:z.string().regex(/^\d+$/),newAdministrator:z.string().regex(/^0x[0-9a-fA-F]{40}$/),newApprovalPublicKey:z.string().regex(/^0x[0-9a-fA-F]{64}$/),newEmergencyStopper:z.string().regex(/^0x[0-9a-fA-F]{40}$/),nonce:z.string().regex(/^0x[0-9a-fA-F]{64}$/),deadline:z.string().regex(/^\d+$/)}).strict();
export type RecoveryV2=z.infer<typeof recoveryV2Schema>;
export function recoveryTypedData(chainId:number,registry:Hex,request:RecoveryV2){
 return {domain:{name:'CallSign Registry',version:'1',chainId,verifyingContract:registry},types:{RecoverInstitution:[{name:'actionType',type:'bytes32'},{name:'institutionId',type:'bytes32'},{name:'expectedEpoch',type:'uint64'},{name:'newAdministrator',type:'address'},{name:'newApprovalPublicKey',type:'bytes32'},{name:'newEmergencyStopper',type:'address'},{name:'nonce',type:'bytes32'},{name:'deadline',type:'uint64'}]},primaryType:'RecoverInstitution',message:{actionType:'0x084ae6688bcae52c9acfb237edd4d94a8a88479295fbce4f55395edc7b78a38c' as Hex,...request,institutionId:request.institutionId as Hex,expectedEpoch:BigInt(request.expectedEpoch),newAdministrator:request.newAdministrator as Hex,newApprovalPublicKey:request.newApprovalPublicKey as Hex,newEmergencyStopper:request.newEmergencyStopper as Hex,nonce:request.nonce as Hex,deadline:BigInt(request.deadline)}} as const;
}

export const recoverySignatureFileSchema=z.object({signer:z.string().regex(/^0x[0-9a-fA-F]{40}$/),digest:z.string().regex(/^0x[0-9a-fA-F]{64}$/),signature:z.string().regex(/^0x[0-9a-fA-F]{130}$/)}).strict();
