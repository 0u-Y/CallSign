import { measurements } from './telemetry.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import WebSocket from 'ws';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { analysisScopes, type QuotaStore } from './quota.js';
import type { Actor } from './finals-model.js';
import { activeIntent } from './finals-model.js';
import { ServiceAuthority } from './service-authority.js';
import { SessionConnections } from './session-connections.js';
import { DeepgramStream, RevisionAnalyzer, analyzeWithAnthropic } from './transcription.js';

export function registerServiceAudio(app:FastifyInstance,options:{authority:ServiceAuthority;actorFor(r:FastifyRequest):Promise<Actor>;sessionId(r:FastifyRequest):Promise<string>;connections:SessionConnections;origin:string;quota:QuotaStore}){
  const {authority:a,actorFor,connections}=options;
  app.get('/v3/audio',{websocket:true},async(socket,request)=>{
    let stopped=false,stt:DeepgramStream|undefined,analyzer:RevisionAnalyzer|undefined,unwatch:(()=>void)|undefined,sequence=0,started=false,reservation='',providerStartedAt=0,firstAudioAt=0,firstRevisionMeasured=false;
    const send=(value:unknown)=>{if(!stopped&&socket.readyState===WebSocket.OPEN){if(socket.bufferedAmount>524288){stop();return;}socket.send(JSON.stringify(value));}};
    const stop=()=>{if(stopped)return;stopped=true;unwatch?.();stt?.stop();analyzer?.stop();socket.close(1000,'analysis stopped');if(reservation)void options.quota.settle(reservation,providerStartedAt?Math.min(300,Math.ceil((Date.now()-providerStartedAt)/1000)):0).catch(()=>{});};socket.on('close',stop);
    try{
      const actor=await actorFor(request),{attemptId}=z.object({attemptId:z.string().min(3).max(200)}).strict().parse(request.query);
      if(actor.role!=='recipient'||request.headers.origin!==options.origin)throw new Error('AUDIO_FORBIDDEN');
      const initial=await a.options.store.read(actor.institutionId),context=a.party(initial,actor,attemptId),generation=context.attempt.consent?.generation;
      const allowed=async()=>{await actorFor(request);const record=await a.options.store.read(actor.institutionId),{attempt,intent}=a.party(record,actor,attemptId);activeIntent(record,intent.id,actor,a.now());a.state(record);
        if(attempt.status!=='accepted'||!attempt.lease||a.now()>=attempt.lease.payload.expiresAt||!attempt.consent?.granted||attempt.consent.generation!==generation)throw new Error('AUDIO_SESSION_ENDED');
        if((attempt.authorityStatus==='unavailable'||(attempt.authorityUntil??0)<=a.now())&&!(attempt.lease.payload.authority==='unavailable'&&attempt.unverifiedChoice==='continue'))throw new Error('AUDIO_AUTHORITY_PAUSED');
        await a.credential(record,attempt.lease.payload.vcDigest);
      };
      await allowed();if(stopped)return;unwatch=connections.watch(await options.sessionId(request),allowed,()=>{send({type:'unavailable',code:'AUDIO_SESSION_REVOKED'});stop();});
      socket.on('message',async(raw,binary)=>{
        try{
          if(stopped)return;
          if(binary){if(!stt)throw new Error('PROVIDER_NOT_READY');if(!firstAudioAt)firstAudioAt=performance.now();stt.push(new Uint8Array(raw as Buffer),++sequence);return;}
          const command=z.object({type:z.enum(['consent','stop']),consent:z.boolean()}).strict().parse(JSON.parse(String(raw)));
          if(command.type==='stop'||!command.consent){await a.consent(actor,`withdraw-${randomUUID()}`,attemptId,false);stop();return;}
          if(started)throw new Error('STREAM_ALREADY_STARTED');started=true;await allowed();
          if(!process.env.DEEPGRAM_API_KEY||!process.env.DEEPGRAM_MODEL){send({type:'unavailable',code:'STT_NOT_CONFIGURED'});stop();return;}
          const streamId=randomUUID();reservation=`stt:${streamId}`;await options.quota.reserve(reservation,actor.institutionId,'stt-seconds',300,analysisScopes(actor.institutionId,actor.userId,attemptId,'stt-seconds',900,a.now()),a.now()+86400);if(stopped){await options.quota.settle(reservation,0);return;}
          await a.options.store.transact(actor.institutionId,async record=>{const {attempt}=a.party(record,actor,attemptId);if(!attempt.consent?.granted||attempt.consent.generation!==generation||attempt.consent.streamId)throw new Error('CONSENT_STREAM_ALREADY_USED');attempt.consent.streamId=streamId;});
          let requests=0;
          const llm=process.env.ANTHROPIC_API_KEY&&process.env.ANTHROPIC_MODEL?async(text:string,policy:typeof initial.policy,signal:AbortSignal)=>{
            await allowed();await a.idempotent(actor,`llm-${streamId}-${++requests}`,{streamId,requests},async record=>{const {attempt}=a.party(record,actor,attemptId);a.usage(record,actor,attempt,'llm-requests',1,20);a.usage(record,actor,attempt,'llm-input-bytes',Buffer.byteLength(text),100000);return {reserved:true};});
            if(signal.aborted||stopped)throw new Error('ANALYSIS_CANCELLED');
            const quotaId=`llm:${streamId}:${requests}`;await options.quota.reserve(quotaId,actor.institutionId,'llm-requests',1,analysisScopes(actor.institutionId,actor.userId,attemptId,'llm-requests',20,a.now()),a.now()+86400);
            if(signal.aborted||stopped){await options.quota.settle(quotaId,0);throw new Error('ANALYSIS_CANCELLED');}
            try{return await measurements.measure('llm',()=>analyzeWithAnthropic({apiKey:process.env.ANTHROPIC_API_KEY!,model:process.env.ANTHROPIC_MODEL!,text,policy,signal}));}finally{await options.quota.settle(quotaId,1);}
          }:undefined;
          analyzer=new RevisionAnalyzer(initial.policy,event=>send({type:'risk',event}),llm);analyzer.start(streamId);
          stt=new DeepgramStream({apiKey:process.env.DEEPGRAM_API_KEY,model:process.env.DEEPGRAM_MODEL,streamId,
            onReady:()=>{if(!providerStartedAt)providerStartedAt=Date.now();send({type:'provider-ready',engine:'deepgram',llm:llm?'anthropic':'disabled-rules-only'});},
            onRevision:revision=>{if(firstAudioAt&&!firstRevisionMeasured){measurements.observe('stt','success',performance.now()-firstAudioAt);firstRevisionMeasured=true;}send({type:'revision',revision});void analyzer!.accept(revision).catch(()=>{send({type:'unavailable',code:'ANALYSIS_LIMIT'});stop();});},
            onUnavailable:code=>{if(firstAudioAt)measurements.observe('stt','failure',performance.now()-firstAudioAt);send({type:'unavailable',code});stop();}});providerStartedAt=Date.now();stt.connect();
        }catch{send({type:'unavailable',code:'AUDIO_REJECTED_OR_BACKPRESSURE'});stop();}
      });
      send({type:'ready',source:'remote-only',persistence:'disabled',consentGeneration:generation});
    }catch{send({type:'unavailable',code:'AUDIO_UNAUTHORIZED'});stop();}
  });
}
