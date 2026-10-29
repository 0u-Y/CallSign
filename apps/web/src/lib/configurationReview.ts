import {configurationReviewSchema,configurationContentsSchema,configurationSignatureFileSchema,configurationTypedData,hashCanonical,policyHash,type ConfigurationReview,type ConfigurationContents} from '@callsign/protocol';
import {hashTypedData,recoverTypedDataAddress,type Hex} from 'viem';
export function verifyConfigurationReview(input:unknown,expected:{chainId:string|number;registryAddress:string;institutionKey:string}){
 const r=configurationReviewSchema.parse(input),q=r.request;
 if(r.chainId!==Number(expected.chainId)||r.registryAddress.toLowerCase()!==expected.registryAddress.toLowerCase()||r.institutionId.toLowerCase()!==expected.institutionKey.toLowerCase()||q.institutionId.toLowerCase()!==r.institutionId.toLowerCase()||r.operation!==hashCanonical(q)||r.digest!==hashTypedData(configurationTypedData(r.chainId,r.registryAddress as Hex,q))||q.newPolicyHash!==`0x${policyHash(r.contents.policy)}`||q.newDirectoryHash!==`0x${hashCanonical(r.contents.directory)}`||q.newPolicyVersion!==String(r.contents.policy.version))throw new Error('검토 내용·서명 대상·현재 기관이 일치하지 않습니다. 원본 요청을 다시 조회하세요.');
 if(r.previous&&(q.expectedPolicyHash!==`0x${policyHash(r.previous.policy)}`||q.expectedDirectoryHash!==`0x${hashCanonical(r.previous.directory)}`))throw new Error('변경 전 내용이 서명 대상 해시와 다릅니다.');
 return r;
}
export async function verifyConfigurationSignature(input:unknown,review:ConfigurationReview,approvers:string[],now:number){
 const file=configurationSignatureFileSchema.parse(input),seen=approvers.map(a=>a.toLowerCase());
 if(seen.length!==3||new Set(seen).size!==3||file.operation!==review.operation||file.digest!==review.digest||BigInt(review.request.deadline)<=BigInt(now))throw new Error('다른 요청·중복 승인자 설정·만료된 서명 파일입니다.');
 const signature=file.signature as Hex;
 if(BigInt(`0x${signature.slice(66,130)}`)>0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0n)throw new Error('정규 형식의 서명이 아닙니다.');
 const signer=(await recoverTypedDataAddress({...configurationTypedData(review.chainId,review.registryAddress as Hex,review.request),signature})).toLowerCase();
 if(signer!==file.signer.toLowerCase()||!seen.includes(signer))throw new Error('등록된 승인자의 유효한 서명이 아닙니다.');
 return {signer,signature};
}
export function configurationChanges(review:ConfigurationReview){
 const before=review.previous,after=review.contents;
 return [
  {label:'공식 업무 표시명',before:before?.directory.map(e=>e.title).join(', ')??`해시 ${review.request.expectedDirectoryHash}`,after:after.directory.map(e=>e.title).join(', ')},
  {label:'정책 버전',before:review.request.expectedPolicyVersion,after:review.request.newPolicyVersion},
  {label:'연락 목적',before:before?.policy.purpose??'이전 원문 없음',after:after.policy.purpose},
  {label:'허용 질문',before:before?.policy.allowedQuestions.join('\n')??'이전 원문 없음',after:after.policy.allowedQuestions.join('\n')},
  {label:'금지 요구',before:before?.policy.forbiddenRequests.map(v=>({OTP:'인증번호 요구',TRANSFER:'송금 요구',REMOTE_CONTROL:'원격제어 요구',SECRECY:'비밀 유지 요구'})[v]).join('\n')??'이전 원문 없음',after:after.policy.forbiddenRequests.map(v=>({OTP:'인증번호 요구',TRANSFER:'송금 요구',REMOTE_CONTROL:'원격제어 요구',SECRECY:'비밀 유지 요구'})[v]).join('\n')},
  {label:'공식 경로',before:before?.policy.followUpPath??'이전 원문 없음',after:after.policy.followUpPath},
 ];
}
export function editedConfiguration(base:ConfigurationContents,title:string,allowed:string,forbidden:string):ConfigurationContents{
 const policy={...base.policy,allowedQuestions:allowed.split('\n').map(s=>s.trim()).filter(Boolean),forbiddenRequests:forbidden.split('\n').map(s=>s.trim()).filter(Boolean)};
 if(hashCanonical(policy)!==hashCanonical(base.policy))policy.version=base.policy.version+1;
 return configurationContentsSchema.parse({directory:[{path:'/official',title}],policy});
}
