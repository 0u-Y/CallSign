import {z} from 'zod';
import {policySchema} from './finals.js';
type Hex=`0x${string}`;
const uint64=z.string().regex(/^(0|[1-9]\d*)$/).refine(v=>BigInt(v)<2n**64n);
const bytes32=z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export const directorySchema=z.array(z.object({path:z.literal('/official'),title:z.string().min(1).max(100)}).strict()).min(1).max(1);
export const initialDirectory=[{path:'/official' as const,title:'공식 거래 확인'}];
export const configurationSchema=z.object({institutionId:bytes32,expectedEpoch:uint64,expectedDirectoryHash:bytes32,expectedDirectoryVersion:uint64,expectedPolicyVersion:uint64,expectedPolicyHash:bytes32,newDirectoryHash:bytes32,newDirectoryVersion:uint64,newPolicyVersion:uint64,newPolicyHash:bytes32,nonce:bytes32,deadline:uint64}).strict();
export type ConfigurationRequest=z.infer<typeof configurationSchema>;
export const configurationContentsSchema=z.object({directory:directorySchema,policy:policySchema}).strict();
export type ConfigurationContents=z.infer<typeof configurationContentsSchema>;
const fields=[['actionType','bytes32'],['institutionId','bytes32'],['expectedEpoch','uint64'],['expectedDirectoryHash','bytes32'],['expectedDirectoryVersion','uint64'],['expectedPolicyVersion','uint64'],['expectedPolicyHash','bytes32'],['newDirectoryHash','bytes32'],['newDirectoryVersion','uint64'],['newPolicyVersion','uint64'],['newPolicyHash','bytes32'],['nonce','bytes32'],['deadline','uint64']].map(([name,type])=>({name:name!,type:type!}));
export function configurationTypedData(chainId:number,registry:Hex,request:ConfigurationRequest){
 const r=configurationSchema.parse(request);const message:Record<string,Hex|bigint>={actionType:'0x4842eefc0f276083cdf0215276db8130bd4656411f6afd9120e298ea07f41975'};
 for(const {name,type} of fields.slice(1))message[name]=type==='uint64'?BigInt(r[name as keyof ConfigurationRequest]):r[name as keyof ConfigurationRequest] as Hex;
 return {domain:{name:'CallSign Registry',version:'1',chainId,verifyingContract:registry},types:{UpdateConfiguration:fields},primaryType:'UpdateConfiguration',message} as const;
}

export const configurationReviewSchema=z.object({format:z.literal('callsign-configuration-review'),version:z.literal(1),operation:z.string().regex(/^[0-9a-f]{64}$/),chainId:z.number().int().positive().safe(),registryAddress:z.string().regex(/^0x[0-9a-fA-F]{40}$/),institutionId:bytes32,digest:bytes32,request:configurationSchema,contents:configurationContentsSchema,previous:configurationContentsSchema.optional()}).strict();
export const configurationSignatureFileSchema=z.object({format:z.literal('callsign-configuration-signature'),version:z.literal(1),operation:z.string().regex(/^[0-9a-f]{64}$/),digest:bytes32,signer:z.string().regex(/^0x[0-9a-fA-F]{40}$/),signature:z.string().regex(/^0x[0-9a-fA-F]{128}(1[bBcC])$/)}).strict();
export type ConfigurationReview= z.infer<typeof configurationReviewSchema>;
