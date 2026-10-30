import { bankPolicy, generateEd25519KeyPair, hashCanonical, signPayload, type ServiceBinding } from '../../packages/protocol/src/index.js';
import { ServiceAuthority } from '../../services/api/src/service-authority.js';
import { newServiceState } from '../../services/api/src/service-state.js';
import type { Actor, AuthorityStore, InstitutionRecord } from '../../services/api/src/finals-model.js';

export async function serviceFixture(institutionId='mock-bank-institution') {
  const issuer = await generateEd25519KeyPair(), service = await generateEd25519KeyPair(), sender = await generateEd25519KeyPair(), recipient = await generateEd25519KeyPair();
  const institution: Actor = {userId:'staff',role:'institution',institutionId}, agent: Actor = {...institution,userId:'agent',role:'gateway'}, receiver: Actor = {...institution,userId:'recipient',role:'recipient'};
  let now = 1800000000, current: 'current'|'revoked'|'unavailable' = 'current';
  let state: InstitutionRecord = {authorityCheckpointVersion:1,id:institution.institutionId,did:'https://bank.example',institutionUri:'https://bank.example',epoch:'1',approvalKeyVersion:1,approvalKid:issuer.kid,approvalPublicKey:issuer.publicJwk,status:'active',policy:bankPolicy,serviceV3:newServiceState(),services:{'https://center.example':{did:'https://center.example',kid:service.kid,publicKey:service.publicJwk,keyVersion:1,active:true}},members:{staff:{role:'institution',permissions:['contact.manage','delegation.manage','institution.suspend','institution.recover','key.activate']},agent:{role:'gateway',serviceDid:'https://center.example'},recipient:{role:'recipient'},other:{role:'recipient'}},intents:{},attempts:{},credentials:{},authorizations:{},consumptions:{},recipientKeys:{},audit:[]};
  const store: AuthorityStore = {read:async()=>structuredClone(state),transact:async(_id,op)=>{const draft=structuredClone(state);const result=await op(draft);state=draft;return structuredClone(result);}};
  const authority = new ServiceAuthority({store,networkId:'20260914',registryAddress:`0x${'1'.repeat(40)}`,signingKey:async()=>issuer,current:async()=>current,now:()=>now});
  let sequence=0; const id=()=>`request-${++sequence}`;
  await authority.createIntent(institution,id(),{id:'fraud-case',recipientId:receiver.userId,agentId:agent.userId,serviceDid:'https://center.example',expiresAt:now+7200});
  const vc = await authority.issueCredential(institution,id(),'https://center.example');
  const attempt = await authority.createAttempt(agent,id(),'fraud-case','direct-webrtc-v3');
  const challenge = await authority.challenge(agent,id(),attempt.id,vc.digest,sender.publicJwk);
  const proofJws = await signPayload(challenge,service);
  const authorization = await authority.authorize(agent,id(),challenge.challengeId,proofJws);
  const nonce='recipient-generated-nonce'; await authority.enroll(receiver,id(),attempt.id,recipient.publicJwk,nonce);
  const binding: ServiceBinding = {...authority.base(),type:'ServiceSessionBinding',authorizationHash:hashCanonical(authorization.payload),sessionId:attempt.sessionId,connectionGeneration:attempt.generation,recipientId:receiver.userId,recipientNonce:nonce,recipientKeyHash:hashCanonical(recipient.publicJwk),senderSdpHash:'a'.repeat(64),recipientSdpHash:'b'.repeat(64),senderFingerprint:'AA:'.repeat(31)+'AA',recipientFingerprint:'BB:'.repeat(31)+'BB',callProfile:'direct-webrtc-v3',issuedAt:now,expiresAt:now+120};
  const proof = async (role:'sender'|'recipient',nonce=binding.recipientNonce,b=binding) => signPayload({...authority.base(),type:'ServicePossession',role,authorizationId:authorization.payload.authorizationId,sessionId:attempt.sessionId,bindingHash:hashCanonical(b),nonce,issuedAt:now,expiresAt:now+30},{privateKey:(role==='sender'?sender:recipient).privateKey,kid:hashCanonical((role==='sender'?sender:recipient).publicJwk)});
  const consume = async (requestId=id(),b=binding)=>authority.consume(receiver,requestId,attempt.id,{binding:b,senderProof:await proof('sender',b.recipientNonce,b),recipientProof:await proof('recipient',b.recipientNonce,b)});
  const lease = async (seq:number,choice:'pause'|'continue'='pause') => {
    const challenge=await authority.renewalChallenge(receiver,id(),attempt.id), {proofs:_,...round}=challenge;
    const signed=await Promise.all(([['sender',sender],['recipient',recipient]] as const).map(async([role,key])=>signPayload({...authority.base(),type:'LeaseRenewalProof',role,authorizationId:authorization.payload.authorizationId,sessionId:attempt.sessionId,bindingHash:hashCanonical(binding),...round},{privateKey:key.privateKey,kid:hashCanonical(key.publicJwk)})));
    await authority.submitRenewal(agent,id(),attempt.id,signed[0]!);await authority.submitRenewal(receiver,id(),attempt.id,signed[1]!);
    return authority.lease(receiver,id(),attempt.id,seq,round.nonce,signed[1]!,choice,signed[0]!);
  };
  return {authority,store,institution,agent,receiver,vc,attempt,authorization,challenge,proofJws,binding,issuer,service,sender,recipient,id,proof,consume,lease,setTime:(value:number)=>{now=value;},setCurrent:(value:typeof current)=>{current=value;}};
}
