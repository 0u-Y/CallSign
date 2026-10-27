import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { callProfileSchema, outcomeSchema, publicKeySchema, registeredUriSchema, serviceBindingSchema } from '@callsign/protocol';
import { HttpError } from './auth.js';
import { activeIntent, membership, type Actor, type AuthorityStore } from './finals-model.js';
import { ServiceAuthority } from './service-authority.js';

const id = z.string().min(3).max(200), digest = z.string().regex(/^[0-9a-f]{64}$/), jws = z.string().max(32768);
export function registerServiceRoutes(app: FastifyInstance, options: { authority: ServiceAuthority; store: AuthorityStore; actorFor(request: FastifyRequest, write?: boolean, purpose?: 'work' | 'official'): Promise<Actor> }) {
  const { authority: a, actorFor, store } = options;
  const requestId = (r: FastifyRequest) => z.string().min(8).max(200).parse(r.headers['idempotency-key']);
  app.get('/v3/workspace', async r => {
    const actor = await actorFor(r), record = await store.read(actor.institutionId); membership(record, actor, ['institution','gateway','recipient','approver']); const s = a.state(record);
    const intents = Object.values(record.intents).filter(i => actor.role === 'institution' || (actor.role === 'gateway' ? i.agentId === actor.userId && record.members[actor.userId]?.serviceDid === i.serviceDid : actor.role === 'recipient' && i.recipientId === actor.userId));
    const ids = new Set(intents.map(i => i.id)), attempts = Object.values(s.attempts).filter(t => ids.has(t.intentId) && t.agentId === record.intents[t.intentId]?.agentId);
    const auths = Object.values(s.authorizations).filter(item => attempts.some(t => t.authorizationId === item.payload.authorizationId));
    const credentials = Object.entries(s.credentials).filter(([key,item]) => actor.role === 'institution' || (actor.role === 'gateway' ? intents.some(i => i.serviceDid === item.vc.credentialSubject.id) : actor.role === 'recipient' && auths.some(auth => auth.payload.vcDigest === key))).map(([digest,item]) => ({digest,...item}));
    const publicAttempts = attempts.map(attempt => { const value = structuredClone(attempt); if (value.pbx) value.pbx.credentials = {}; return value; });
    return { actor, policy: record.policy, intents, attempts: publicAttempts, authorizations: auths, credentials, services: actor.role === 'institution' ? Object.keys(record.services) : [], defaultProfile: 'asterisk-webrtc-v3', scenario: '모의 금융기관 이상거래 확인', mode: 'provider-code-unverified' };
  });
  app.post('/v3/intents', async r => { const b = z.object({id,recipientId:id,agentId:id,serviceUri:registeredUriSchema,expiresAt:z.number().int().positive()}).strict().parse(r.body); return a.createIntent(await actorFor(r,true),requestId(r),{id:b.id,recipientId:b.recipientId,agentId:b.agentId,serviceDid:b.serviceUri,expiresAt:b.expiresAt}); });
  app.post('/v3/credentials', async r => { const b = z.object({serviceUri:registeredUriSchema}).strict().parse(r.body); return a.issueCredential(await actorFor(r,true),requestId(r),b.serviceUri); });
  app.post('/v3/revoke', async r => { const b = z.object({digest}).strict().parse(r.body); return a.revoke(await actorFor(r,true),requestId(r),b.digest); });
  app.post('/v3/attempts', async r => { const b = z.object({intentId:id,profile:callProfileSchema.default('asterisk-webrtc-v3')}).strict().parse(r.body); return a.createAttempt(await actorFor(r,true),requestId(r),b.intentId,b.profile); });
  app.post('/v3/challenge', async r => { const b = z.object({attemptId:id,digest,publicKey:publicKeySchema}).strict().parse(r.body); return a.challenge(await actorFor(r,true),requestId(r),b.attemptId,b.digest,b.publicKey); });
  app.post('/v3/sender-context', async r => { const b = z.object({challengeId:id,serviceUri:registeredUriSchema}).strict().parse(r.body); return a.senderContext(await actorFor(r,true),b.challengeId,b.serviceUri); });
  app.post('/v3/authorizations', async r => { const b = z.object({challengeId:id,proofJws:jws}).strict().parse(r.body); return a.authorize(await actorFor(r,true),requestId(r),b.challengeId,b.proofJws); });
  app.post('/v3/enroll', async r => { const b = z.object({attemptId:id,publicKey:publicKeySchema,nonce:z.string().min(16).max(128)}).strict().parse(r.body); return a.enroll(await actorFor(r,true),requestId(r),b.attemptId,b.publicKey,b.nonce); });
  app.post('/v3/consume', async r => { const b = z.object({attemptId:id,binding:serviceBindingSchema,senderProof:jws,recipientProof:jws}).strict().parse(r.body); return a.consume(await actorFor(r,true),requestId(r),b.attemptId,b); });
  app.post('/v3/lease', async r => { const b = z.object({attemptId:id,sequence:z.number().int().positive(),nonce:z.string().min(16).max(128),proofJws:jws,choice:z.enum(['pause','continue']).default('pause')}).strict().parse(r.body); return a.lease(await actorFor(r,true),requestId(r),b.attemptId,b.sequence,b.nonce,b.proofJws,b.choice); });
  app.post('/v3/outcome', async r => { const b = z.object({attemptId:id,outcome:outcomeSchema,reason:z.string().min(1).max(100)}).strict().parse(r.body); return a.outcome(await actorFor(r,true),requestId(r),b.attemptId,b.outcome,b.reason); });
  app.post('/v3/consent', async r => { const b = z.object({attemptId:id,granted:z.boolean()}).strict().parse(r.body); return a.consent(await actorFor(r,true),requestId(r),b.attemptId,b.granted); });
  app.post('/v3/official/confirm', async r => {
    const actor = await actorFor(r,true,'official'); membership(await store.read(actor.institutionId),actor,['recipient']);
    const b = z.object({intentId:id,answer:z.enum(['recognized','not-recognized'])}).strict().parse(r.body);
    return a.idempotent(actor,requestId(r),{action:'official-confirm',...b},async (record,s) => { const intent = activeIntent(record,b.intentId,actor,a.now());
      if (s.confirmations[intent.id]) throw new HttpError(409,'OFFICIAL_TASK_ALREADY_COMPLETED');
      const confirmation = {id:intent.id,answer:b.answer,at:a.now(),userId:actor.userId}; s.confirmations[intent.id] = confirmation; intent.status = 'completed';
      for (const attempt of Object.values(s.attempts)) if (attempt.intentId === intent.id && !['ended','declined','no-answer','failed','cancelled'].includes(attempt.status)) { attempt.status = 'cancelled'; attempt.endedAt = a.now(); }
      a.event(record,actor,'official.completed',intent.id,{answer:b.answer}); return {confirmation,source:'mock-crm-fds',externalInstitutionUpdate:false}; });
  });
}
