import { assertEvmSignature } from './governance-v2.js';
import { HttpError } from './auth.js';
import { hashCanonical, policyHash,configurationSchema,configurationContentsSchema,configurationTypedData,type ConfigurationRequest,type ConfigurationContents } from '@callsign/protocol';
import { keccak256, recoverTypedDataAddress, stringToHex, type Hex } from 'viem';
import type { InstitutionRecord } from './finals-model.js';

export interface ConfigurationProposal {id:string;request:ConfigurationRequest;contents:ConfigurationContents;previous?:ConfigurationContents;signatures:Record<string,Hex>;status:'awaiting-approval'|'submitted'|'confirmed'|'failed';activatedAt?:number;transactionHash?:string;block?:string;failure?:string}
export async function configurationSigners(input:{chainId:number;registry:Hex;request:ConfigurationRequest;signatures:Hex[];approvers:string[];now:number;collect?:boolean}){
 const r=configurationSchema.parse(input.request),trusted=input.approvers.map(v=>v.toLowerCase());
 if(trusted.length!==3||new Set(trusted).size!==3||trusted.some(v=>!/^0x[0-9a-f]{40}$/.test(v)||/^0x0{40}$/.test(v)))throw new HttpError(409,'CONFIGURATION_TRUST_INVALID');
 if(BigInt(r.deadline)<=BigInt(input.now)||BigInt(r.deadline)>BigInt(input.now+600)||/^0x0{64}$/.test(r.nonce))throw new HttpError(409,'CONFIGURATION_DEADLINE_OR_NONCE_INVALID');
 if(input.signatures.length<(input.collect?1:2)||input.signatures.length>3)throw new HttpError(409,'CONFIGURATION_QUORUM_REQUIRED');
 const seen=new Set<string>();for(const signature of input.signatures){let signer:string;try{assertEvmSignature(signature);signer=(await recoverTypedDataAddress({...configurationTypedData(input.chainId,input.registry,r),signature})).toLowerCase();}catch{throw new HttpError(403,'CONFIGURATION_SIGNATURE_INVALID');}if(!trusted.includes(signer)||seen.has(signer))throw new HttpError(409,'CONFIGURATION_SIGNER_INVALID_OR_DUPLICATE');seen.add(signer);}return [...seen];
}
export function assertConfiguration(record:InstitutionRecord,request:ConfigurationRequest,contents:ConfigurationContents){
 const r=configurationSchema.parse(request),c=configurationContentsSchema.parse(contents),d=record.directory;
 if(record.status!=='active'||!d||r.institutionId.toLowerCase()!==keccak256(stringToHex(record.id)).toLowerCase()||r.expectedEpoch!==record.epoch||r.expectedDirectoryHash!==d.hash||r.expectedDirectoryVersion!==String(d.version)||r.expectedPolicyVersion!==String(record.policy.version)||r.expectedPolicyHash!==`0x${policyHash(record.policy)}`)throw new HttpError(409,'CONFIGURATION_STALE_CONTEXT');
 const dh=`0x${hashCanonical(c.directory)}`,ph=`0x${policyHash(c.policy)}`;
 const changedPolicy=ph!==r.expectedPolicyHash,changedDirectory=dh!==r.expectedDirectoryHash;
 if(r.newDirectoryHash!==dh||r.newPolicyHash!==ph||r.newDirectoryVersion!==String(d.version+(changedDirectory?1:0))||r.newPolicyVersion!==String(record.policy.version+(changedPolicy?1:0))||r.newPolicyVersion!==String(c.policy.version)||(!changedDirectory&&!changedPolicy)||c.policy.id!==record.policy.id)throw new HttpError(409,'CONFIGURATION_CONTENT_MISMATCH');
 // The only implemented official operation is /official; never advertise unimplemented destinations.
 if(!c.directory.some(e=>e.path===c.policy.followUpPath))throw new HttpError(409,'OFFICIAL_PATH_NOT_REGISTERED');
 return {invalidates:changedPolicy};
}
export function configurationForEvent(record:InstitutionRecord,event:{nonce:string;epoch:string;directoryHash:string;directoryVersion:string;policyVersion:string;policyHash:string;invalidated:boolean}){
 const p=Object.values(record.configurationProposals??{}).find(p=>p.status==='submitted'&&p.request.nonce===event.nonce&&p.request.newDirectoryHash===event.directoryHash&&p.request.newDirectoryVersion===event.directoryVersion&&p.request.newPolicyVersion===event.policyVersion&&p.request.newPolicyHash===event.policyHash);
 if(!p)throw new HttpError(409,'CONFIGURATION_EVENT_RECONCILIATION_REQUIRED');
 const change=assertConfiguration(record,p.request,p.contents);
 if(change.invalidates!==event.invalidated||BigInt(event.epoch)!==BigInt(record.epoch)+(event.invalidated?1n:0n))throw new HttpError(409,'CONFIGURATION_EVENT_CONTEXT_MISMATCH');
 return p;
}

export {directorySchema,initialDirectory,configurationSchema,configurationContentsSchema,configurationTypedData,type ConfigurationRequest,type ConfigurationContents} from '@callsign/protocol';
