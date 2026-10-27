import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import postgres from 'postgres';
import { importJWK } from 'jose';
import { z } from 'zod';
import { assertTemporalValidity, extractSingleSdpFingerprint, hashCanonical, pbxReportSchema, serviceBindingSchema, serviceProofSchema, verifyPayload } from '@callsign/protocol';
import { HttpError } from './auth.js';
import { AsteriskBridge } from './asterisk.js';
import type { Actor } from './finals-model.js';
import { activeIntent } from './finals-model.js';
import { ServiceAuthority } from './service-authority.js';
import { terminal } from './service-state.js';

export class PbxEndpoints {
  private readonly sql; private readonly key:Buffer;
  constructor(readonly config:{databaseUrl:string;secret:string;realm:string;wssUrl:string;sipDomain:string}){
    this.key=Buffer.from(config.secret,'base64url');if(this.key.length!==32||!/^wss:\/\//.test(config.wssUrl)||!/^[a-zA-Z0-9.-]+$/.test(config.realm)||!/^[a-zA-Z0-9.-]+$/.test(config.sipDomain))throw new Error('PBX_CREDENTIAL_CONFIG_INVALID');
    this.sql=postgres(config.databaseUrl,{max:2,prepare:false,connect_timeout:3});
  }
  encrypt(value:unknown){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');}
  decrypt(value:string){const b=Buffer.from(value,'base64url'),decipher=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));decipher.setAuthTag(b.subarray(12,28));return z.object({username:z.string(),password:z.string(),realm:z.string()}).strict().parse(JSON.parse(Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString()));}
  generate(username:string){return this.encrypt({username,password:randomBytes(32).toString('base64url'),realm:this.config.realm});}
  async ensure(encrypted:string,institutionId:string,attemptId:string,userId:string,expiresAt:number){const c=this.decrypt(encrypted),digest=`SHA-256:${createHash('sha256').update(`${c.username}:${c.realm}:${c.password}`).digest('hex')}`;
    await this.sql.begin(async tx=>{
      const lease=await tx`SELECT * FROM pbx.endpoint_leases WHERE id=${c.username} FOR UPDATE`;
      if(lease[0]&&(lease[0].institution_id!==institutionId||lease[0].attempt_id!==attemptId||lease[0].user_id!==userId))throw new Error('PBX_ENDPOINT_CONFLICT');
      await tx`INSERT INTO pbx.endpoint_leases VALUES(${c.username},${institutionId},${attemptId},${userId},to_timestamp(${expiresAt})) ON CONFLICT(id) DO NOTHING`;
      await tx`INSERT INTO pbx.ps_auths(id,auth_type,username,realm,password_digest,supported_algorithms_uas) VALUES(${c.username},'digest',${c.username},${c.realm},${digest},'SHA-256') ON CONFLICT(id) DO NOTHING`;
      await tx`INSERT INTO pbx.ps_aors(id,max_contacts,remove_existing,default_expiration,maximum_expiration,minimum_expiration) VALUES(${c.username},1,'no',120,120,30) ON CONFLICT(id) DO NOTHING`;
      await tx`INSERT INTO pbx.ps_endpoints(id,transport,aors,auth,context,disallow,allow,direct_media,webrtc,dtls_auto_generate_cert,dtls_cert_file,dtls_private_key,rtp_symmetric,rewrite_contact,force_rport,media_encryption,ice_support,rtcp_mux) VALUES(${c.username},'transport-wss',${c.username},${c.username},'callsign-deny','all','opus,ulaw','no','yes','no','/etc/asterisk/tls/cert.pem','/etc/asterisk/tls/key.pem','yes','yes','yes','dtls','yes','yes') ON CONFLICT(id) DO NOTHING`;
    });return {...c,wssUrl:this.config.wssUrl,sipDomain:this.config.sipDomain,expiresAt};
  }
  async remove(attemptId:string){await this.sql.begin(async tx=>{const rows=await tx`SELECT id FROM pbx.endpoint_leases WHERE attempt_id=${attemptId} FOR UPDATE`;for(const row of rows){await tx`DELETE FROM pbx.ps_contacts WHERE endpoint=${row.id}`;for(const table of ['ps_endpoints','ps_auths','ps_aors','endpoint_leases'])await tx`DELETE FROM ${tx(`pbx.${table}`)} WHERE id=${row.id}`;}});}
  async close(){await this.sql.end({timeout:3});}
}
export function registerPbxRoutes(app:FastifyInstance,options:{authority:ServiceAuthority;actorFor(r:FastifyRequest,write?:boolean):Promise<Actor>;bridge:AsteriskBridge;endpoints:PbxEndpoints}){
  const {authority:a,actorFor,bridge,endpoints}=options, id=z.string().min(3).max(200), requestId=(r:FastifyRequest)=>z.string().min(8).max(200).parse(r.headers['idempotency-key']);
  app.addHook('onClose',()=>endpoints.close());
  app.post('/v3/pbx/endpoint',async r=>{
    const actor=await actorFor(r,true),b=z.object({attemptId:id}).strict().parse(r.body);
    const prepared=await a.idempotent(actor,requestId(r),{action:'pbx-endpoint',...b},async record=>{
      const {attempt,intent}=a.party(record,actor,b.attemptId);activeIntent(record,intent.id,actor,a.now());
      if(!['gateway','recipient'].includes(actor.role)||attempt.profile!=='asterisk-webrtc-v3'||!attempt.authorizationId||terminal(attempt.status)||a.now()>=attempt.firstConnectBy)throw new HttpError(409,'PBX_PREPARATION_FORBIDDEN');
      const role=actor.role==='gateway'?'sender':'recipient';
      if(!attempt.pbx){const prefix=`cs-${randomUUID()}`;attempt.pbx={bridgeId:`${prefix}-bridge`,senderChannelId:`${prefix}-sender`,recipientChannelId:`${prefix}-recipient`,senderEndpoint:`${prefix}-s`,recipientEndpoint:`${prefix}-r`,state:'reserved',reports:{},credentials:{}};}
      const p=attempt.pbx;const username=role==='sender'?p.senderEndpoint:p.recipientEndpoint;
      const encrypted=p.credentials[role]??=endpoints.generate(username);return {encrypted,expiresAt:attempt.callEndBy};
    });
    return endpoints.ensure(prepared.encrypted,actor.institutionId,b.attemptId,actor.userId,prepared.expiresAt);
  });
  app.post('/v3/pbx/dial',async r=>{const actor=await actorFor(r,true),b=z.object({attemptId:id}).strict().parse(r.body),record=await a.options.store.read(actor.institutionId);const {attempt,intent}=a.party(record,actor,b.attemptId);activeIntent(record,intent.id,actor,a.now());if(actor.role!=='gateway'||attempt.status!=='authorized'||a.now()>=attempt.firstConnectBy||!attempt.pbx?.credentials.recipient)throw new HttpError(409,'PBX_DIAL_FORBIDDEN');await a.credential(record,record.serviceV3!.authorizations[attempt.authorizationId!]!.payload.vcDigest);return bridge.prepare(attempt);});
  app.post('/v3/pbx/report',async r=>{
    const actor=await actorFor(r,true),b=z.object({attemptId:id,jws:z.string().max(50000)}).strict().parse(r.body);
    return a.idempotent(actor,requestId(r),{action:'pbx-report',...b},async(record,s)=>{const {attempt}=a.party(record,actor,b.attemptId);const role=actor.role==='gateway'?'sender':actor.role==='recipient'?'recipient':null;if(!role||!attempt.pbx||attempt.status!=='authorized'||a.now()>=attempt.firstConnectBy)throw new HttpError(409,'PBX_REPORT_FORBIDDEN');
      const auth=attempt.authorizationId&&s.authorizations[attempt.authorizationId];if(!auth||!attempt.recipientKey)throw new HttpError(409,'PBX_ENROLLMENT_REQUIRED');
      const proof=Object.values(s.challenges).find(c=>hashCanonical(c.payload)===auth.payload.serviceProofHash);if(!proof)throw new HttpError(409,'PBX_CHALLENGE_MISSING');
      const key=role==='sender'?serviceProofSchema.parse(proof.payload).browserPublicKey:attempt.recipientKey.publicKey;
      const report=await verifyPayload(b.jws,await importJWK(key,'EdDSA'),{type:'PbxBrowserReport',kid:hashCanonical(key),schema:pbxReportSchema});assertTemporalValidity(report,a.now());
      if(report.role!==role||report.attemptId!==attempt.id||report.sessionId!==attempt.sessionId||report.connectionGeneration!==attempt.generation||report.recipientNonce!==attempt.recipientKey.nonce||report.networkId!==a.options.networkId||report.registryAddress!==a.options.registryAddress)throw new HttpError(409,'PBX_REPORT_CONTEXT_INVALID');
      const prior=attempt.pbx.reports[role];if(prior&&prior.proof!==b.jws)throw new HttpError(409,'PBX_RENEGOTIATION_REQUIRES_NEW_ATTEMPT');
      attempt.pbx.reports[role]={callId:report.callId,sdp:report.localSdp,remoteSdp:report.remoteSdp,fingerprint:extractSingleSdpFingerprint(report.localSdp),proof:b.jws};return {reported:true};});
  });
  app.post('/v3/pbx/evidence',async r=>{const actor=await actorFor(r,true),b=z.object({attemptId:id,binding:serviceBindingSchema,state:z.enum(['prepared','bridged'])}).strict().parse(r.body);
    return a.options.store.transact(actor.institutionId,async record=>{const {attempt,intent}=a.party(record,actor,b.attemptId);if(!['gateway','recipient'].includes(actor.role))throw new HttpError(403,'CALL_ROLE_REQUIRED');activeIntent(record,intent.id,actor,a.now());
      const auth=attempt.authorizationId&&record.serviceV3!.authorizations[attempt.authorizationId];if(!auth||auth.cancelled||!attempt.recipientKey||b.binding.authorizationHash!==hashCanonical(auth.payload)||b.binding.sessionId!==attempt.sessionId||b.binding.connectionGeneration!==attempt.generation||b.binding.recipientNonce!==attempt.recipientKey.nonce||b.binding.recipientKeyHash!==hashCanonical(attempt.recipientKey.publicKey)||b.binding.callProfile!==attempt.profile||b.binding.recipientId!==intent.recipientId||b.binding.networkId!==a.options.networkId||b.binding.registryAddress!==a.options.registryAddress||terminal(attempt.status))throw new HttpError(409,'PBX_BINDING_CONTEXT_INVALID');
      if(b.state==='prepared'&&(attempt.status!=='authorized'||a.now()>=attempt.firstConnectBy))throw new HttpError(409,'PBX_START_EXPIRED');
      if(b.state==='bridged'&&hashCanonical(attempt.binding)!==hashCanonical(b.binding))throw new HttpError(409,'PBX_BINDING_CHANGED');
      const result=await bridge.evidence(record.id,attempt,b.binding,b.state,a.now());attempt.pbx!.evidence=result.jws;attempt.pbx!.state=b.state;return result;});});
  // Cleanup is idempotent and remains allowed after lease expiry or history recovery blocking.
  app.post('/v3/pbx/cleanup',async r=>{const actor=await actorFor(r,true),b=z.object({attemptId:id}).strict().parse(r.body),record=await a.options.store.read(actor.institutionId);const {attempt}=a.party(record,actor,b.attemptId);if(!terminal(attempt.status))throw new HttpError(409,'TERMINAL_OUTCOME_REQUIRED');await bridge.ari.destroy(attempt);await endpoints.remove(attempt.id);return {cleaned:true};});
}
