import { z } from 'zod';
import { extractSingleSdpFingerprint, hashCanonical, hashSdp, pbxEvidenceSchema, signPayload, type ServiceBinding, type SigningKeyPair } from '@callsign/protocol';
import type { ServiceAttempt } from './service-state.js';

const channelSchema=z.object({id:z.string(),state:z.string(),name:z.string()});
export class AriClient {
  constructor(readonly config:{base:URL;authorization:string;application:string;fetcher?:typeof fetch}) {
    if(config.base.protocol!=='https:' || config.base.username || config.base.password || !/^[A-Za-z0-9_-]+$/.test(config.application)) throw new Error('ARI_CONFIGURATION_INVALID');
  }
  async request(method:string,path:string,query:Record<string,string>={},body?:unknown):Promise<unknown> {
    const url=new URL(`/ari/${path}`,this.config.base);for(const [k,v] of Object.entries(query))url.searchParams.set(k,v);
    const response=await (this.config.fetcher??fetch)(url,{method,redirect:'error',signal:AbortSignal.timeout(3000),headers:{authorization:`Basic ${this.config.authorization}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(!response.ok) throw Object.assign(new Error('ARI_REQUEST_FAILED'),{status:response.status});
    const raw=await response.text();if(raw.length>131072)throw new Error('ARI_RESPONSE_TOO_LARGE');return raw?JSON.parse(raw):null;
  }
  async channel(id:string){return channelSchema.parse(await this.request('GET',`channels/${encodeURIComponent(id)}`));}
  async callId(id:string){return z.object({value:z.string().min(1).max(200)}).parse(await this.request('GET',`channels/${encodeURIComponent(id)}/variable`,{variable:'CHANNEL(pjsip,call-id)'})).value;}
  async limitLifetime(id:string,seconds:number){
    if(!Number.isInteger(seconds)||seconds<1||seconds>120)throw new Error('PBX_LIFETIME_EXPIRED');
    const path=`channels/${encodeURIComponent(id)}/variable`;await this.request('POST',path,{variable:'TIMEOUT(absolute)',value:String(seconds)});
    const raw=z.object({value:z.string()}).parse(await this.request('GET',path,{variable:'TIMEOUT(absolute)'})),remaining=Number(raw.value);
    if(!Number.isFinite(remaining)||remaining<=0||remaining>seconds+1)throw new Error('PBX_LIFETIME_UNVERIFIABLE');
  }
  async originate(channelId:string,endpoint:string,attempt:ServiceAttempt){
    if(!/^cs-[a-zA-Z0-9-]+$/.test(endpoint))throw new Error('ARI_ENDPOINT_FORBIDDEN');
    const remaining=Math.min(120,attempt.firstConnectBy-Math.floor(Date.now()/1000)-3);if(remaining<=0)throw new Error('PBX_START_WINDOW_EXPIRED');
    try {await this.request('POST',`channels/${channelId}`,{endpoint:`PJSIP/${endpoint}`,app:this.config.application,timeout:'40'},{variables:{'TIMEOUT(absolute)':String(remaining),CALLSIGN_ATTEMPT:attempt.id,CALLSIGN_SESSION:attempt.sessionId,CALLSIGN_GENERATION:attempt.generation}});}
    catch(error){if((error as {status?:number}).status!==409)throw error;const c=await this.channel(channelId);if(!c.name.startsWith(`PJSIP/${endpoint}-`))throw new Error('ARI_CHANNEL_CONFLICT');}
  }
  async mute(id:string,muted:boolean){await this.request(muted?'POST':'DELETE',`channels/${id}/mute`,{direction:'both'});}
  async destroy(attempt:ServiceAttempt){
    const p=attempt.pbx;if(!p)return;
    const results=await Promise.allSettled([`channels/${p.senderChannelId}`,`channels/${p.recipientChannelId}`,`bridges/${p.bridgeId}`].map(async path=>{try{await this.request('DELETE',path);}catch(error){if((error as {status?:number}).status!==404)throw error;}}));
    if(results.some(r=>r.status==='rejected'))throw new Error('PBX_CLEANUP_RETRY_REQUIRED');
  }
}
export class AsteriskBridge {
  constructor(readonly ari:AriClient,readonly key:Pick<SigningKeyPair,'privateKey'|'kid'>,readonly domain:{networkId:string;registryAddress:string;pbxFingerprint:string}){}
  async prepare(attempt:ServiceAttempt){const p=attempt.pbx;if(!p)throw new Error('PBX_NOT_RESERVED');await this.ari.originate(p.senderChannelId,p.senderEndpoint,attempt);await this.ari.originate(p.recipientChannelId,p.recipientEndpoint,attempt);return {status:'ringing',attemptId:attempt.id};}
  async evidence(institutionId:string,attempt:ServiceAttempt,binding:ServiceBinding,state:'prepared'|'bridged',now:number){
    const started=performance.now();
    // Deduct the ARI request timeout, so another response or poll cannot extend the signed deadline.
    const remaining=(until:number)=>Math.floor(until-now-(performance.now()-started)/1000)-3;
    const p=attempt.pbx;if(!p || !attempt.authorizationId)throw new Error('PBX_NOT_RESERVED');
    if(!/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(this.domain.pbxFingerprint))throw new Error('PBX_CERTIFICATE_PIN_REQUIRED');
    const sender=p.reports.sender,recipient=p.reports.recipient;if(!sender||!recipient)throw new Error('PBX_REPORTS_REQUIRED');
    const [sc,rc,si,ri]=await Promise.all([this.ari.channel(p.senderChannelId),this.ari.channel(p.recipientChannelId),this.ari.callId(p.senderChannelId),this.ari.callId(p.recipientChannelId)]);
    if(sc.state!=='Up'||rc.state!=='Up'||si!==sender.callId||ri!==recipient.callId||!sc.name.startsWith(`PJSIP/${p.senderEndpoint}-`)||!rc.name.startsWith(`PJSIP/${p.recipientEndpoint}-`))throw new Error('PBX_CHANNEL_CONTEXT_INVALID');
    if(binding.senderSdpHash!==hashSdp(sender.sdp)||binding.recipientSdpHash!==hashSdp(recipient.sdp)||binding.senderFingerprint!==extractSingleSdpFingerprint(sender.sdp)||binding.recipientFingerprint!==extractSingleSdpFingerprint(recipient.sdp))throw new Error('PBX_SDP_CONTEXT_INVALID');
    if(extractSingleSdpFingerprint(sender.remoteSdp)!==this.domain.pbxFingerprint||extractSingleSdpFingerprint(recipient.remoteSdp)!==this.domain.pbxFingerprint)throw new Error('PBX_CERTIFICATE_CONTEXT_INVALID');
    if(state==='prepared') {await this.ari.limitLifetime(p.senderChannelId,remaining(attempt.firstConnectBy));await this.ari.limitLifetime(p.recipientChannelId,remaining(attempt.firstConnectBy));await this.ari.mute(p.senderChannelId,true);await this.ari.mute(p.recipientChannelId,true);}
    else {
      if(!attempt.mediaReady?.sender||!attempt.mediaReady?.recipient||attempt.status!=='accepted'||!attempt.lease||attempt.lease.payload.expiresAt<=now||(attempt.lease.payload.authority!=='current'&&attempt.unverifiedChoice!=='continue'))throw new Error('PBX_ACCEPTANCE_REQUIRED');
      try{await this.ari.request('POST',`bridges/${p.bridgeId}`,{type:'mixing,proxy_media',name:attempt.sessionId});}catch(error){if((error as {status?:number}).status!==409)throw error;}
      await this.ari.request('POST',`bridges/${p.bridgeId}/addChannel`,{channel:`${p.senderChannelId},${p.recipientChannelId}`});
      const bridge=z.object({channels:z.array(z.string())}).parse(await this.ari.request('GET',`bridges/${p.bridgeId}`));
      if(bridge.channels.length!==2||!bridge.channels.includes(p.senderChannelId)||!bridge.channels.includes(p.recipientChannelId))throw new Error('PBX_BRIDGE_MEMBERSHIP_INVALID');
      try{await this.ari.limitLifetime(p.senderChannelId,remaining(attempt.lease.payload.expiresAt));await this.ari.limitLifetime(p.recipientChannelId,remaining(attempt.lease.payload.expiresAt));await this.ari.mute(p.senderChannelId,false);await this.ari.mute(p.recipientChannelId,false);}catch(error){await this.ari.destroy(attempt);throw error;}
    }
    const payload=pbxEvidenceSchema.parse({protocol:'callsign',version:3,networkId:this.domain.networkId,registryAddress:this.domain.registryAddress,type:'AsteriskSessionEvidence',pbxFingerprintSource:'configured-certificate',institutionId,authorizationId:attempt.authorizationId,attemptId:attempt.id,sessionId:attempt.sessionId,bindingHash:hashCanonical(binding),connectionGeneration:attempt.generation,bridgeId:p.bridgeId,senderChannelId:p.senderChannelId,recipientChannelId:p.recipientChannelId,senderCallId:si,recipientCallId:ri,senderEndpoint:p.senderEndpoint,recipientEndpoint:p.recipientEndpoint,senderSdpHash:binding.senderSdpHash,recipientSdpHash:binding.recipientSdpHash,senderFingerprint:binding.senderFingerprint,recipientFingerprint:binding.recipientFingerprint,recipientNonce:binding.recipientNonce,senderPbxFingerprint:this.domain.pbxFingerprint,recipientPbxFingerprint:this.domain.pbxFingerprint,evidenceSequence:attempt.revision,state,issuedAt:now,expiresAt:now+8});
    return {payload,jws:await signPayload(payload,this.key)};
  }
}
