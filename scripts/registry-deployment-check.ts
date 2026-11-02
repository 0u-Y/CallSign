import {keccak256,stringToHex,recoverTransactionAddress,type TransactionSerialized} from 'viem';

// Re-read immutable constructor policy and signer membership before trusting deployment metadata.
export async function verifyRegistryConfiguration(read:(name:string,args?:readonly string[])=>Promise<unknown>,approvers:readonly string[],policyHash:string){
 if(approvers.length!==3||new Set(approvers.map(x=>x.toLowerCase())).size!==3||approvers.some(x=>!/^0x[0-9a-fA-F]{40}$/.test(x)||/^0x0{40}$/.test(x)))throw new Error('DEPLOYMENT_APPROVERS_INVALID');
 const [profile,initialPolicy,...members]=await Promise.all([read('PROFILE'),read('initialPolicyHash'),...approvers.map(a=>read('registrationApprovers',[a]))]);
 if(profile!==keccak256(stringToHex('CALLSIGN_SERVICE_JOINT_CONFIGURATION_1'))||initialPolicy!==policyHash||members.some(value=>value!==true))throw new Error('REGISTRY_CONFIGURATION_MISMATCH');
}

export async function verifyDeploymentSigner(raw:TransactionSerialized,expected:string){
 if((await recoverTransactionAddress({serializedTransaction:raw})).toLowerCase()!==expected.toLowerCase())throw new Error('PENDING_DEPLOYMENT_SIGNER_MISMATCH');
}
