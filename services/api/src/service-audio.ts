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
import { DeepgramStream } from './transcription.js';
import { ServiceRevisionAnalyzer, analyzeServiceWithAnthropic, assertAnalysisPolicy, purposeAuthorityCurrent } from './service-analysis.js';

export interface AudioProviders {
 stream(options:ConstructorParameters<typeof DeepgramStream>[0]):Pick<DeepgramStream,'connect'|'push'|'stop'>;
 analyze?:(text:string,policy:Parameters<typeof analyzeServiceWithAnthropic>[0]['policy'],signal:AbortSignal)=>ReturnType<typeof analyzeServiceWithAnthropic>;
}
export function registerServiceAudio(app:FastifyInstance,options:{authority:ServiceAuthority;actorFor(r:FastifyRequest):Promise<Actor>;sessionId(r:FastifyRequest):Promise<string>;connections:SessionConnections;origin:string;quota:QuotaStore;providers?:AudioProviders}){
  const {authority:a,actorFor,connections}=options;
  const stops=new Set<()=>void>(),pending=new Set<Promise<unknown>>();let settlementFailed=false;
  function track<T>(work:Promise<T>){pending.add(work);void work.then(()=>pending.delete(work),()=>pending.delete(work));return work;}
  function settle(id:string,amount:number){const work=track(options.quota.settle(id,amount));void work.catch(()=>{settlementFailed=true;app.log.warn({code:'AUDIO_QUOTA_SETTLEMENT_FAILED'});});return work;}
  // Fastify closes hooks in reverse order: drain audio before the caller closes its quota pool.
  app.addHook('onClose',async()=>{
    for(const stop of [...stops])stop();let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([(async()=>{while(pending.size)await Promise.allSettled([...pending]);})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('AUDIO_DRAIN_TIMEOUT')),5000);})]);if(settlementFailed)throw new Error('AUDIO_QUOTA_SETTLEMENT_FAILED');}finally{clearTimeout(timer);}
  });
  app.get('/v3/audio',{websocket:true},async(socket,request)=>{
    const revisions=new Map<string,number>();
    let processing=false;let stopped=false,stt:Pick<DeepgramStream,'connect'|'push'|'stop'>|undefined,analyzer:ServiceRevisionAnalyzer|undefined,unwatch:(()=>void)|undefined,sequence=0,started=false,reservation='',reserved=false,providerStartedAt=0,firstAudioAt=0,firstRevisionMeasured=false;
    const send=(value:unknown)=>{if(!stopped&&socket.readyState===WebSocket.OPEN){if(socket.bufferedAmount>524288){stop();return;}socket.send(JSON.stringify(value));}};
    const stop=()=>{if(stopped)return;stopped=true;stops.delete(stop);unwatch?.();stt?.stop();analyzer?.stop();socket.close(1000,'analysis stopped');if(reserved)void settle(reservation,providerStartedAt?Math.min(300,Math.ceil((Date.now()-providerStartedAt)/1000)):0).catch(()=>{});};stops.add(stop);socket.on('close',stop);
    try{
      const actor=await actorFor(request),{attemptId}=z.object({attemptId:z.string().min(3).max(200)}).strict().parse(request.query);
      if(actor.role!=='recipient'||request.headers.origin!==options.origin)throw new Error('AUDIO_FORBIDDEN');
      const initial=await a.options.store.read(actor.institutionId),context=a.party(initial,actor,attemptId),generation=context.attempt.consent?.generation,policyDigest=assertAnalysisPolicy(initial,context.attempt),session=context.attempt.sessionId,connectionGeneration=context.attempt.generation;
      const allowed=async()=>{await actorFor(request);const record=await a.options.store.read(actor.institutionId),{attempt,intent}=a.party(record,actor,attemptId);activeIntent(record,intent.id,actor,a.now());a.state(record);
        if(assertAnalysisPolicy(record,attempt)!==policyDigest||attempt.sessionId!==session||attempt.generation!==connectionGeneration)throw new Error('ANALYSIS_CONTEXT_CHANGED');
        if(attempt.status!=='accepted'||!attempt.lease||a.now()>=attempt.lease.payload.expiresAt||!attempt.consent?.granted||attempt.consent.generation!==generation)throw new Error('AUDIO_SESSION_ENDED');
        if((attempt.authorityStatus==='unavailable'||(attempt.authorityUntil??0)<=a.now())&&!(attempt.lease.payload.authority==='unavailable'&&attempt.unverifiedChoice==='continue'))throw new Error('AUDIO_AUTHORITY_PAUSED');
        await a.credential(record,attempt.lease.payload.vcDigest);return purposeAuthorityCurrent(attempt,a.now());
      };
      await allowed();if(stopped)return;unwatch=connections.watch(await options.sessionId(request),async()=>{await allowed();},()=>{send({type:'unavailable',code:'AUDIO_SESSION_REVOKED'});stop();});
      const message=async(raw:import('ws').RawData,binary:boolean)=>{
        try{
          if(stopped)return;if(!binary){const command=z.object({type:z.enum(['consent','stop']),consent:z.boolean()}).strict().parse(JSON.parse(String(raw)));if(command.type==='stop'||!command.consent){stop();await a.consent(actor,`withdraw-${randomUUID()}`,attemptId,false);return;}}if(processing)throw new Error('AUDIO_BACKPRESSURE');processing=true;
          if(binary){await allowed();if(stopped)return;if(!stt)throw new Error('PROVIDER_NOT_READY');if(!firstAudioAt)firstAudioAt=performance.now();stt.push(new Uint8Array(raw as Buffer),++sequence);return;}
          if(started)throw new Error('STREAM_ALREADY_STARTED');started=true;await allowed();
          if(!options.providers&&(!process.env.DEEPGRAM_API_KEY||!process.env.DEEPGRAM_MODEL)){send({type:'unavailable',code:'STT_NOT_CONFIGURED'});stop();return;}
          const streamId=randomUUID();reservation=`stt:${streamId}`;await options.quota.reserve(reservation,actor.institutionId,'stt-seconds',300,analysisScopes(actor.institutionId,actor.userId,attemptId,'stt-seconds',900,a.now()),a.now()+86400);reserved=true;if(stopped){await settle(reservation,0);return;}
          await a.options.store.transact(actor.institutionId,async record=>{const {attempt}=a.party(record,actor,attemptId);if(!attempt.consent?.granted||attempt.consent.generation!==generation||attempt.consent.streamId)throw new Error('CONSENT_STREAM_ALREADY_USED');attempt.consent.streamId=streamId;});
          let requests=0;
          const llm=(options.providers?.analyze||(process.env.ANTHROPIC_API_KEY&&process.env.ANTHROPIC_MODEL))?(text:string,policy:typeof initial.policy,signal:AbortSignal)=>track((async()=>{
            if(!await allowed())throw new Error('ANALYSIS_AUTHORITY_UNKNOWN');await a.idempotent(actor,`llm-${streamId}-${++requests}`,{streamId,requests},async record=>{const {attempt}=a.party(record,actor,attemptId);a.usage(record,actor,attempt,'llm-requests',1,20);a.usage(record,actor,attempt,'llm-input-bytes',Buffer.byteLength(text),100000);return {reserved:true};});
            if(signal.aborted||stopped)throw new Error('ANALYSIS_CANCELLED');
            const quotaId=`llm:${streamId}:${requests}`;await options.quota.reserve(quotaId,actor.institutionId,'llm-requests',1,analysisScopes(actor.institutionId,actor.userId,attemptId,'llm-requests',20,a.now()),a.now()+86400);
            if(signal.aborted||stopped){await settle(quotaId,0);throw new Error('ANALYSIS_CANCELLED');}
            let cancel:(()=>void)|undefined;
            try{if(!await allowed())throw new Error('ANALYSIS_AUTHORITY_UNKNOWN');if(signal.aborted||stopped)throw new Error('ANALYSIS_CANCELLED');
              const cancelled=new Promise<never>((_,reject)=>{cancel=()=>reject(new Error('ANALYSIS_CANCELLED'));signal.addEventListener('abort',cancel,{once:true});});
              return await measurements.measure('llm',()=>Promise.race([options.providers?.analyze?options.providers.analyze(text,policy,signal):analyzeServiceWithAnthropic({apiKey:process.env.ANTHROPIC_API_KEY!,model:process.env.ANTHROPIC_MODEL!,text,policy,signal}),cancelled]));
            }finally{if(cancel)signal.removeEventListener('abort',cancel);await settle(quotaId,1);}
          })()):undefined;
          analyzer=new ServiceRevisionAnalyzer(initial.policy,event=>{if(stopped||!analyzer?.isCurrent(event))return;void allowed().then(current=>{if(!stopped&&analyzer?.isCurrent(event))send({type:'risk',event:current?event:{...event,status:'unavailable',engine:'authority-unavailable',purpose:{relation:'undetermined',evidenceSpan:'',reason:'현재 권한·정책의 최신성을 확인할 수 없습니다. 기존 규칙 근거만 참고하세요.'}}});}).catch(stop);},llm);analyzer.start(streamId);
          const streamOptions:ConstructorParameters<typeof DeepgramStream>[0]={apiKey:process.env.DEEPGRAM_API_KEY??'explicit-test-provider',model:process.env.DEEPGRAM_MODEL??'explicit-test-provider',streamId,
            onReady:()=>{if(!providerStartedAt)providerStartedAt=Date.now();send({type:'provider-ready',engine:options.providers?'fixture-stream':'deepgram',llm:llm?(options.providers?'fixture-model':'anthropic'):'disabled-rules-only'});},
            onRevision:revision=>{if(stopped||revision.streamId!==streamId||revision.revision<=(revisions.get(revision.segmentId)??0))return;revisions.set(revision.segmentId,revision.revision);void allowed().then(()=>{if(stopped||revisions.get(revision.segmentId)!==revision.revision)return;if(firstAudioAt&&!firstRevisionMeasured){measurements.observe('stt','success',performance.now()-firstAudioAt);firstRevisionMeasured=true;}return analyzer!.accept(revision).then(accepted=>{if(accepted&&!stopped&&revisions.get(revision.segmentId)===revision.revision)send({type:'revision',revision,contextRevision:analyzer!.contextRevision});});}).catch(()=>{send({type:'unavailable',code:'ANALYSIS_LIMIT'});stop();});},
            onUnavailable:code=>{if(stopped)return;if(firstAudioAt)measurements.observe('stt','failure',performance.now()-firstAudioAt);send({type:'unavailable',code});stop();}};stt=options.providers?options.providers.stream(streamOptions):new DeepgramStream(streamOptions);providerStartedAt=Date.now();stt.connect();
        }catch{send({type:'unavailable',code:'AUDIO_REJECTED_OR_BACKPRESSURE'});stop();}finally{processing=false;}
      };socket.on('message',(raw,binary)=>{void track(message(raw,binary));});
      send({type:'ready',source:'remote-only',persistence:'disabled',consentGeneration:generation});
    }catch{send({type:'unavailable',code:'AUDIO_UNAUTHORIZED'});stop();}
  });
}
