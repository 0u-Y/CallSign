import {expect,it} from 'vitest';
import {privateKeyToAccount} from 'viem/accounts';
import {keccak256,stringToHex,type Hex} from 'viem';
import {recoveryTypedData} from '../../packages/protocol/src/index.js';
import {recoveryTypedData as serverTypedData,verifyRecoveryApprovers} from '../../services/api/src/governance-v2.js';
import {verifyRecoveryRequest,verifyRecoverySignature,type RecoveryManagement} from '../../apps/web/src/lib/recoveryReview.js';

const now=1800000000;
const accounts=[1,2,3,4].map(n=>privateKeyToAccount(`0x${String(n).padStart(64,'0')}`)); // Public synthetic fixture keys only.
function fixture(){
 const state:RecoveryManagement={status:'suspended',epoch:'1',observedEpoch:'2',chainId:'20260914',registryAddress:`0x${'1'.repeat(40)}`,institutionKey:`0x${'a'.repeat(64)}`,approvers:accounts.slice(0,3).map(a=>a.address)};
 const request={institutionId:state.institutionKey,expectedEpoch:'2',newAdministrator:accounts[0]!.address,newApprovalPublicKey:`0x${'b'.repeat(64)}`,newEmergencyStopper:accounts[1]!.address,nonce:`0x${'c'.repeat(64)}`,deadline:String(now+300)};
 return {state,request,review:verifyRecoveryRequest(request,state,now)};
}
it('reviews the current observed epoch and exactly the same EIP-712 recovery action as the server',()=>{
 const {request,state,review}=fixture(),data=recoveryTypedData(review.chainId,review.registryAddress,request);
 expect(data).toEqual(serverTypedData(review.chainId,review.registryAddress,request));
 expect(data.message.actionType).toBe(keccak256(stringToHex('RECOVER_INSTITUTION')));
 expect(review.request.expectedEpoch).toBe('2');
 expect(()=>verifyRecoveryRequest({...request,deadline:'0'+request.deadline},state,now)).toThrow();
 expect(()=>verifyRecoveryRequest({...request,expectedEpoch:String(2n**64n)},state,now)).toThrow();
 expect(verifyRecoveryRequest({...request,nonce:'0x'+request.nonce.slice(2).toUpperCase(),institutionId:'0x'+request.institutionId.slice(2).toUpperCase()},state,now).operation).toBe(review.operation);
 for(const changed of [{...request,institutionId:`0x${'f'.repeat(64)}`},{...request,expectedEpoch:'1'},{...request,deadline:String(now)},{...request,deadline:String(now+601)},{...request,newAdministrator:`0x${'0'.repeat(40)}`},{...request,newApprovalPublicKey:`0x${'0'.repeat(64)}`},{...request,privateKey:'must-not-be-imported'}])expect(()=>verifyRecoveryRequest(changed,state,now)).toThrow();
 expect(()=>verifyRecoveryRequest(request,{...state,status:'active'},now)).toThrow();
 expect(()=>verifyRecoveryRequest(request,{...state,chainId:'invalid'},now)).toThrow();
});
it('imports existing public signature files and preserves the server distinct-key quorum',async()=>{
 const {state,request,review}=fixture(),data=recoveryTypedData(review.chainId,review.registryAddress,request);
 const files=await Promise.all(accounts.slice(0,2).map(async account=>({signer:account.address,digest:review.digest,signature:await account.signTypedData(data)})));
 const verified=await Promise.all(files.map(file=>verifyRecoverySignature(file,review,state.approvers,now)));
 expect(new Set(verified.map(s=>s.signer)).size).toBe(2);
 const server={chainId:review.chainId,registry:review.registryAddress,request,signatures:verified.map(s=>s.signature),approvers:state.approvers,now};
 expect(await verifyRecoveryApprovers(server)).toHaveLength(2);
 await expect(verifyRecoveryApprovers({...server,signatures:[verified[0]!.signature,verified[0]!.signature]})).rejects.toThrow('RECOVERY_SIGNER_INVALID_OR_DUPLICATE');
 for(const changed of [{...files[0],signer:accounts[1]!.address},{...files[0],digest:`0x${'f'.repeat(64)}`},{...files[0],privateKey:'never-accepted'}])await expect(verifyRecoverySignature(changed,review,state.approvers,now)).rejects.toThrow();
 const wrong=accounts[3]!,signature=await wrong.signTypedData(data);
 await expect(verifyRecoverySignature({signer:wrong.address,digest:review.digest,signature},review,state.approvers,now)).rejects.toThrow();
 await expect(verifyRecoverySignature(files[0],review,[state.approvers[0]!,state.approvers[0]!,state.approvers[2]!],now)).rejects.toThrow();
 await expect(verifyRecoverySignature(files[0],review,state.approvers,now+300)).rejects.toThrow();
 const wrongChain=await accounts[0]!.signTypedData(recoveryTypedData(1,review.registryAddress,request));
 await expect(verifyRecoverySignature({...files[0],signature:wrongChain},review,state.approvers,now)).rejects.toThrow();
 const highS=`${files[0]!.signature.slice(0,66)}${'f'.repeat(64)}1b` as Hex;
 await expect(verifyRecoverySignature({...files[0],signature:highS},review,state.approvers,now)).rejects.toThrow('EVM_SIGNATURE_NON_CANONICAL');
});
