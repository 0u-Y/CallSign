import { measurements } from './telemetry.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { terminal } from './service-state.js';
import { z } from 'zod';
import { hashCanonical, hashSdp, extractSingleSdpFingerprint, servicePossessionSchema, callProfileSchema, outcomeSchema, publicKeySchema, registeredUriSchema, serviceBindingSchema } from '@callsign/protocol';
import { HttpError } from './auth.js';
import { activeIntent, membership, requirePermission, type Actor, type AuthorityStore } from './finals-model.js';
import { ServiceAuthority } from './service-authority.js';

const id = z.string().min(3).max(200), digest = z.string().regex(/^[0-9a-f]{64}$/), jws = z.string().max(32768);
export function registerServiceRoutes(app: FastifyInstance, options: { authority: ServiceAuthority; store: AuthorityStore; sessionId?(request:FastifyRequest):Promise<string>; actorFor(request: FastifyRequest, write?: boolean, purpose?: 'work' | 'official'): Promise<Actor> }) {
  const { authority: a, actorFor, store } = options;
  const requestId = (r: FastifyRequest) => z.string().min(8).max(200).parse(r.headers['idempotency-key']);
  app.get('/v3/workspace', async r => {
    const actor = await actorFor(r), record = await store.read(actor.institutionId); membership(record, actor, ['institution','gateway','recipient','approver']); const s = a.state(record);
    const intents = Object.values(record.intents).filter(i => actor.role === 'institution' || (actor.role === 'gateway' ? i.agentId === actor.userId && record.members[actor.userId]?.serviceDid === i.serviceDid : actor.role === 'recipient' && i.recipientId === actor.userId));
    const ids = new Set(intents.map(i => i.id)), attempts = Object.values(s.attempts).filter(t => ids.has(t.intentId) && t.agentId === record.intents[t.intentId]?.agentId);
    const auths = Object.values(s.authorizations).filter(item => attempts.some(t => t.authorizationId === item.payload.authorizationId));
    const credentials = Object.entries(s.credentials).filter(([key,item]) => actor.role === 'institution' || (actor.role === 'gateway' ? intents.some(i => i.serviceDid === item.vc.credentialSubject.id) : actor.role === 'recipient' && auths.some(auth => auth.payload.vcDigest === key))).map(([digest,item]) => ({digest,...item}));
    const publicAttempts = attempts.map(attempt => { const value = structuredClone(attempt); if (value.pbx) value.pbx.credentials = {}; return value; });
    return { actor, institutionUri:record.institutionUri??record.did, policy: record.policy, intents, attempts: publicAttempts, authorizations: auths, credentials, permissions: record.members[actor.userId]?.permissions ?? [], runtimePolicy:a.policy, services: actor.role === 'institution' ? Object.keys(record.services) : [], defaultProfile: 'asterisk-webrtc-v3', scenario: '모의 금융기관 이상거래 확인', mode: 'provider-code-unverified' };
  });
  app.post('/v3/intents', async r => { const b = z.object({id,recipientId:id,agentId:id,serviceUri:registeredUriSchema,expiresAt:z.number().int().positive()}).strict().parse(r.body); return a.createIntent(await actorFor(r,true),requestId(r),{id:b.id,recipientId:b.recipientId,agentId:b.agentId,serviceDid:b.serviceUri,expiresAt:b.expiresAt}); });
  app.post('/v3/credentials', async r => { const b = z.object({serviceUri:registeredUriSchema}).strict().parse(r.body); return a.issueCredential(await actorFor(r,true),requestId(r),b.serviceUri); });
  app.post('/v3/revoke', async r => { const b = z.object({digest}).strict().parse(r.body); return a.revoke(await actorFor(r,true),requestId(r),b.digest); });
  app.post('/v3/attempts', async r => { const b = z.object({intentId:id,profile:callProfileSchema.default('asterisk-webrtc-v3')}).strict().parse(r.body); return a.createAttempt(await actorFor(r,true),requestId(r),b.intentId,b.profile); });
  app.post('/v3/challenge', async r => { const b = z.object({attemptId:id,digest,publicKey:publicKeySchema}).strict().parse(r.body); return a.challenge(await actorFor(r,true),requestId(r),b.attemptId,b.digest,b.publicKey); });
  app.post('/v3/sender-context', async r => { const b = z.object({challengeId:id,serviceUri:registeredUriSchema}).strict().parse(r.body); return a.senderContext(await actorFor(r,true),b.challengeId,b.serviceUri); });
  app.post('/v3/authorizations', async r => { const b = z.object({challengeId:id,proofJws:jws}).strict().parse(r.body); const actor=await actorFor(r,true);return measurements.measure('authorization',()=>a.authorize(actor,requestId(r),b.challengeId,b.proofJws)); });
  app.post('/v3/enroll', async r => { const b = z.object({attemptId:id,publicKey:publicKeySchema,nonce:z.string().min(16).max(128)}).strict().parse(r.body); return a.enroll(await actorFor(r,true),requestId(r),b.attemptId,b.publicKey,b.nonce); });
  app.post('/v3/consume', async r => { const b = z.object({attemptId:id,binding:serviceBindingSchema,senderProof:jws,recipientProof:jws}).strict().parse(r.body); return a.consume(await actorFor(r,true),requestId(r),b.attemptId,b); });
  app.post('/v3/lease', async r => { const b = z.object({attemptId:id,sequence:z.number().int().positive(),nonce:z.string().min(16).max(128),proofJws:jws,senderProof:jws,choice:z.enum(['pause','continue']).default('pause')}).strict().parse(r.body); return a.lease(await actorFor(r,true),requestId(r),b.attemptId,b.sequence,b.nonce,b.proofJws,b.choice,b.senderProof); });
  app.post('/v3/outcome', async r => { const b = z.object({attemptId:id,outcome:outcomeSchema,reason:z.string().min(1).max(100)}).strict().parse(r.body); return a.outcome(await actorFor(r,true),requestId(r),b.attemptId,b.outcome,b.reason); });
  app.post('/v3/consent', async r => { const b = z.object({attemptId:id,granted:z.boolean()}).strict().parse(r.body); return a.consent(await actorFor(r,true),requestId(r),b.attemptId,b.granted); });
  app.get('/v3/call-context',async r=>{
    const actor=await actorFor(r),{attemptId}=z.object({attemptId:id}).strict().parse(r.query),record=await store.read(actor.institutionId),{attempt,s}=a.party(record,actor,attemptId);
    if(!['gateway','recipient'].includes(actor.role))throw new HttpError(403,'CALL_ROLE_REQUIRED');
    const copy=structuredClone(attempt);if(copy.pbx)copy.pbx.credentials={};
    const auth=attempt.authorizationId?s.authorizations[attempt.authorizationId]:undefined;
    return {attempt:copy,authorization:auth,credential:auth?s.credentials[auth.payload.vcDigest]:undefined,receipt:attempt.authorizationId?s.consumptions[attempt.authorizationId]:undefined,policy:record.policy};
  });
  app.post('/v3/claim',async r=>{
    const actor=await actorFor(r,true),{attemptId}=z.object({attemptId:id}).strict().parse(r.body),sessionId=await options.sessionId?.(r);
    if(!sessionId)throw new HttpError(503,'SESSION_BINDING_UNAVAILABLE');
    return a.idempotent(actor,requestId(r),{action:'claim',attemptId,sessionId},async record=>{
      const {attempt}=a.party(record,actor,attemptId),role=actor.role==='gateway'?'sender':actor.role==='recipient'?'recipient':null;
      if(!role||terminal(attempt.status)||a.now()>=attempt.firstConnectBy)throw new HttpError(409,'CALL_NOT_CLAIMABLE');
      const prior=(attempt.ownerSessions??={})[role];if(prior&&prior!==sessionId)throw new HttpError(409,'CALL_OWNED_BY_ANOTHER_SESSION');attempt.ownerSessions[role]=sessionId;return {claimed:true};
    });
  });
  app.post('/v3/binding',async r=>{
    const actor=await actorFor(r,true),{attemptId}=z.object({attemptId:id}).strict().parse(r.body);
    return a.idempotent(actor,requestId(r),{action:'binding',attemptId},async record=>{
      const {attempt,s}=a.party(record,actor,attemptId),auth=s.authorizations[attempt.authorizationId!],p=attempt.pbx;
      if(!['gateway','recipient'].includes(actor.role)||!auth||!attempt.recipientKey||!p?.reports.sender||!p.reports.recipient||attempt.status!=='authorized')throw new HttpError(409,'BINDING_NOT_READY');
      return serviceBindingSchema.parse({...a.base(),type:'ServiceSessionBinding',authorizationHash:hashCanonical(auth.payload),sessionId:attempt.sessionId,connectionGeneration:attempt.generation,recipientId:auth.payload.recipientId,recipientNonce:attempt.recipientKey.nonce,recipientKeyHash:hashCanonical(attempt.recipientKey.publicKey),senderSdpHash:hashSdp(p.reports.sender.sdp),recipientSdpHash:hashSdp(p.reports.recipient.sdp),senderFingerprint:extractSingleSdpFingerprint(p.reports.sender.sdp),recipientFingerprint:extractSingleSdpFingerprint(p.reports.recipient.sdp),callProfile:attempt.profile,issuedAt:auth.payload.issuedAt,expiresAt:auth.payload.firstConsumeBy});
    });
  });
  app.post('/v3/possession',async r=>{
    const actor=await actorFor(r,true),b=z.object({attemptId:id,binding:serviceBindingSchema,jws}).strict().parse(r.body);
    return a.idempotent(actor,requestId(r),{action:'possession',...b},async record=>{
      const {attempt,s}=a.party(record,actor,b.attemptId),auth=s.authorizations[attempt.authorizationId!],role=actor.role==='gateway'?'sender':actor.role==='recipient'?'recipient':null;
      const challenge=auth&&Object.values(s.challenges).find(c=>hashCanonical(c.payload)===auth.payload.serviceProofHash);
      const key=role==='sender'?challenge?.payload.browserPublicKey:attempt.recipientKey?.publicKey;
      if(!role||!auth||!key||attempt.status!=='authorized'||b.binding.authorizationHash!==hashCanonical(auth.payload)||b.binding.connectionGeneration!==attempt.generation||b.binding.recipientNonce!==attempt.recipientKey?.nonce)throw new HttpError(409,'POSSESSION_NOT_ALLOWED');
      await a.possession(b.jws,key,role,auth.payload.authorizationId,attempt.sessionId,hashCanonical(b.binding),b.binding.recipientNonce);
      (attempt.possessions??={})[role]=b.jws;return {stored:true};
    });
  });
  app.post('/v3/lease-challenge',async r=>{const {attemptId}=z.object({attemptId:id}).strict().parse(r.body);return a.renewalChallenge(await actorFor(r,true),requestId(r),attemptId);});
  app.post('/v3/lease-proof',async r=>{const b=z.object({attemptId:id,jws}).strict().parse(r.body);return a.submitRenewal(await actorFor(r,true),requestId(r),b.attemptId,b.jws);});
  app.post('/v3/ready',async r=>{const b=z.object({attemptId:id,jws}).strict().parse(r.body);return a.ready(await actorFor(r,true),requestId(r),b.attemptId,b.jws);});
  app.post('/v3/cancel',async r=>{
    const actor=await actorFor(r,true),{intentId}=z.object({intentId:id}).strict().parse(r.body);
    return a.idempotent(actor,requestId(r),{action:'cancel',intentId},async(record,s)=>{requirePermission(record,actor,'contact.manage');const intent=record.intents[intentId];if(!intent)throw new HttpError(404,'INTENT_NOT_FOUND');intent.status='cancelled';for(const t of Object.values(s.attempts))if(t.intentId===intentId&&!terminal(t.status)){t.status='cancelled';t.endedAt=a.now();if(t.consent){t.consent.granted=false;t.consent.generation++;}a.event(record,actor,'call.cleanup',t.id);}a.event(record,actor,'intent.cancelled',intent.id);return {cancelled:true};});
  });
  app.get('/v3/official-tasks',async r=>{const actor=await actorFor(r,false,'official'),record=await store.read(actor.institutionId);membership(record,actor,['recipient']);return {intents:Object.values(record.intents).filter(i=>i.recipientId===actor.userId)};});
  app.post('/v3/official/confirm', async r => {
    const actor = await actorFor(r,true,'official'); membership(await store.read(actor.institutionId),actor,['recipient']);
    const b = z.object({intentId:id,answer:z.enum(['recognized','not-recognized'])}).strict().parse(r.body);
    return a.idempotent(actor,requestId(r),{action:'official-confirm',...b},async (record,s) => { const intent = activeIntent(record,b.intentId,actor,a.now());
      if (s.confirmations[intent.id]) throw new HttpError(409,'OFFICIAL_TASK_ALREADY_COMPLETED');
      const confirmation = {id:intent.id,answer:b.answer,at:a.now(),userId:actor.userId}; s.confirmations[intent.id] = confirmation; intent.status = 'completed';
      for (const attempt of Object.values(s.attempts)) if (attempt.intentId === intent.id && !['ended','declined','no-answer','failed','cancelled'].includes(attempt.status)) { attempt.status = 'cancelled'; attempt.endedAt = a.now();if(attempt.consent){attempt.consent.granted=false;attempt.consent.generation++;}a.event(record,actor,'call.cleanup',attempt.id); }
      a.event(record,actor,'official.completed',intent.id,{answer:b.answer}); return {confirmation,source:'mock-crm-fds',externalInstitutionUpdate:false}; });
  });
}
