import {assertEvmSignature,hashCanonical,recoverySignatureFileSchema,recoveryV2Schema,recoveryTypedData,type RecoveryV2} from '@callsign/protocol';
import {hashTypedData,recoverTypedDataAddress,type Hex} from 'viem';

export interface RecoveryManagement {status:string;epoch:string;observedEpoch?:string;chainId:string;registryAddress:string;institutionKey:string;approvers:string[];recovery?:{hash:string;submitted:boolean}|null}
export interface RecoveryReview {request:RecoveryV2;operation:string;digest:Hex;chainId:number;registryAddress:Hex}
export function verifyRecoveryRequest(input:unknown,state:RecoveryManagement,now:number):RecoveryReview{
 const parsed=recoveryV2Schema.safeParse(input);if(!parsed.success)throw new Error('복구 요청 JSON 형식이 올바르지 않습니다. 개인키가 아닌 공개 요청 파일을 선택하세요.');
 // One signed action must not acquire different local operation IDs through numeric or hex aliases.
 for(const value of [parsed.data.expectedEpoch,parsed.data.deadline])if(!/^(0|[1-9]\d{0,19})$/.test(value)||BigInt(value)>=2n**64n)throw new Error('권한 세대·만료 숫자의 형식이 올바르지 않습니다. 새 공개 요청 파일을 준비하세요.');
 const request={...parsed.data,institutionId:parsed.data.institutionId.toLowerCase(),newAdministrator:parsed.data.newAdministrator.toLowerCase(),newApprovalPublicKey:parsed.data.newApprovalPublicKey.toLowerCase(),newEmergencyStopper:parsed.data.newEmergencyStopper.toLowerCase(),nonce:parsed.data.nonce.toLowerCase()},chainId=Number(state.chainId);
 if(!Number.isSafeInteger(chainId)||chainId<=0||!/^0x[0-9a-fA-F]{40}$/.test(state.registryAddress)||/^0x0{40}$/.test(state.registryAddress))throw new Error('현재 체인·계약 식별을 확인할 수 없습니다. 다시 조회하세요.');
 if(state.status!=='suspended'||request.institutionId.toLowerCase()!==state.institutionKey.toLowerCase()||request.expectedEpoch!==(state.observedEpoch??state.epoch))throw new Error('정지된 현재 기관·원장 권한 세대와 같은 요청이 아닙니다. 최신 상태로 요청을 다시 준비하세요.');
 if(BigInt(request.deadline)<=BigInt(now)||BigInt(request.deadline)>BigInt(now+600))throw new Error('복구 요청이 만료됐거나 유효기간이 10분을 넘습니다. 새 요청을 준비하세요.');
 if(/^0x0+$/.test(request.newAdministrator)||/^0x0+$/.test(request.newEmergencyStopper)||/^0x0+$/.test(request.newApprovalPublicKey))throw new Error('실제 배치할 새 관리자·정지 권한자·승인 공개키가 필요합니다.');
 const registryAddress=state.registryAddress as Hex;
 return {request,operation:hashCanonical(request),digest:hashTypedData(recoveryTypedData(chainId,registryAddress,request)),chainId,registryAddress};
}
export async function verifyRecoverySignature(input:unknown,review:RecoveryReview,approvers:string[],now:number){
 const parsed=recoverySignatureFileSchema.safeParse(input);if(!parsed.success)throw new Error('기존 별도 서명 도구의 공개 서명 파일이 필요합니다. 개인키를 선택하지 마세요.');
 const file=parsed.data,trusted=approvers.map(s=>s.toLowerCase());
 if(trusted.length!==3||new Set(trusted).size!==3||trusted.some(s=>!/^0x[0-9a-f]{40}$/.test(s)||/^0x0{40}$/.test(s)))throw new Error('등록된 서로 다른 승인키 3개를 확인할 수 없습니다.');
 if(file.digest!==review.digest||BigInt(review.request.deadline)<=BigInt(now))throw new Error('다른 요청의 서명이거나 만료됐습니다. 같은 요청을 다시 검토하세요.');
 assertEvmSignature(file.signature);
 const signature=file.signature as Hex,signer=(await recoverTypedDataAddress({...recoveryTypedData(review.chainId,review.registryAddress,review.request),signature})).toLowerCase();
 if(signer!==file.signer.toLowerCase()||!trusted.includes(signer))throw new Error('현재 등록된 승인키의 유효한 서명이 아닙니다.');
 return {signer,signature};
}
