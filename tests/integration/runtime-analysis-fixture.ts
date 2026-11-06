// Observer-only entrypoint; never imported by the production server or selected by its environment.
import {readFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import type {AudioProviders} from '../../services/api/src/service-audio.js';
import type {RiskUnit} from '../../services/api/src/risk-assessment.js';
export const fixtureSpeech='OTP를 알려주세요. 대출 상품을 안내하겠습니다.';
export function analysisFixture(){
 const streams:Array<{options:Parameters<AudioProviders['stream']>[0];frames:number;stopped:boolean}>=[],calls:Array<{units:RiskUnit[];policy:import('../../packages/protocol/src/index.js').PurposePolicy;signal:AbortSignal;done:boolean;resolve:(v:any)=>void;reject:(e:Error)=>void}>=[];
 const providers:AudioProviders={stream(options){const s={options,frames:0,stopped:false};streams.push(s);return {connect(){options.onReady?.();},push(){if(s.stopped)throw new Error('FIXTURE_FRAME_AFTER_STOP');s.frames++;},stop(){s.stopped=true;}};},analyze(units,policy,signal){return new Promise((resolve,reject)=>{calls.push({units,policy,signal,done:false,resolve,reject});});}};
 function control(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('FIXTURE_COMMAND_INVALID');
  const b=value as Record<string,unknown>,op=b.op;
  if(op==='reset'&&Object.keys(b).length===1){if(streams.some(s=>!s.stopped)||calls.some(c=>!c.done))throw new Error('FIXTURE_NOT_DRAINED');streams.length=0;calls.length=0;return {reset:true};}
  if(op==='state'&&Object.keys(b).length===1)return {fixture:true,streams:streams.map(s=>({frames:s.frames,stopped:s.stopped})),requests:calls.map(c=>({aborted:c.signal.aborted,done:c.done}))};
  if(op==='emit'&&Object.keys(b).sort().join(',')==='op,revision,stream'&&Number.isInteger(b.stream)&&Number(b.stream)>=0&&Number.isInteger(b.revision)&&Number(b.revision)>0&&Number(b.revision)<=10){const s=streams[Number(b.stream)];if(!s||s.stopped)throw new Error('FIXTURE_STREAM_NOT_ACTIVE');s.options.onRevision({streamId:s.options.streamId,segmentId:'purpose',revision:Number(b.revision),final:true,text:fixtureSpeech,source:'remote'});return {injected:true};}
  if(op==='resolve'&&Object.keys(b).sort().join(',')==='mode,op,request'&&Number.isInteger(b.request)&&Number(b.request)>=0&&['suspected','not-detected','failure'].includes(String(b.mode))){const c=calls[Number(b.request)];if(!c||c.done)throw new Error('FIXTURE_REQUEST_NOT_PENDING');c.done=true;if(b.mode==='failure')c.reject(new Error('SYNTHETIC_PROVIDER_FAILURE'));else c.resolve({assessments:c.policy.forbiddenRequests.map(code=>({code,result:code==='OTP'?'detected':'undetermined',evidenceIds:code==='OTP'?[c.units[0]!.id]:[],explanation:'합성 제공자 응답 · 모델 품질 평가 아님'}))});return {resolved:true};}
  throw new Error('FIXTURE_COMMAND_INVALID');
 }
 return {providers,control};
}
export function assertAnalysisFixtureEntry(env:NodeJS.ProcessEnv,args:string[]){
 if(!args.includes('--owned-analysis-fixture')||env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration'||env.CALLSIGN_RUNTIME_IMAGE_CONFIRMATION!=='OWNED_FINAL_IMAGE'||!env.DEPLOYMENT_ID?.startsWith('test:')||!env.CALLSIGN_MEDIA_FIXTURE_RUN_ID?.startsWith('media-')||env.SERVICE_ROLE!=='issuer'||env.DEEPGRAM_API_KEY||env.ANTHROPIC_API_KEY||env.OPENAI_API_KEY||env.DEEPGRAM_API_KEY_FILE||env.ANTHROPIC_API_KEY_FILE||env.OPENAI_API_KEY_FILE)throw new Error('OWNED_ANALYSIS_FIXTURE_REQUIRED');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 assertAnalysisFixtureEntry(process.env,process.argv.slice(2));
 const tokenPath=process.env.CALLSIGN_MEDIA_FIXTURE_TOKEN_FILE!;const info=await lstat(tokenPath);if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077))throw new Error('PRIVATE_FIXTURE_TOKEN_REQUIRED');
 const token=(await readFile(tokenPath,'utf8')).trim();if(token.length<40||token.length>200)throw new Error('FIXTURE_TOKEN_INVALID');
 const owner=JSON.parse(await readFile(process.env.CALLSIGN_MEDIA_FIXTURE_OWNERSHIP!,'utf8'));if(owner.runId!==process.env.CALLSIGN_MEDIA_FIXTURE_RUN_ID)throw new Error('FIXTURE_OWNER_MISMATCH');
 const {buildFinalsServer}=await import('../../services/api/src/finals-server.js'),{finalsEnvironment}=await import('../../services/api/src/finals-config.js');
 const fixture=analysisFixture(),env=finalsEnvironment(process.env),app=await buildFinalsServer(env,{audioProviders:fixture.providers});
 app.post('/__fixture/analysis',{bodyLimit:4096},async(request,reply)=>{const actual=Buffer.from(String(request.headers.authorization??'')),expected=Buffer.from('Bearer '+token);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return reply.code(401).send({error:'FIXTURE_AUTH_REQUIRED'});try{return fixture.control(request.body);}catch{return reply.code(400).send({error:'FIXTURE_COMMAND_INVALID'});}});
 for(const sig of ['SIGINT','SIGTERM'] as const)process.once(sig,()=>{void app.close();});
 await app.listen({host:'127.0.0.1',port:env.PORT});
}
