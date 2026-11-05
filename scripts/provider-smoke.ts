// Never part of light/CI. These commands incur real provider usage only after separate approval.
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='media'||process.env.CALLSIGN_PROVIDER_CONFIRMATION!=='CONSENTED-SAMPLE-WITH-BUDGET')throw new Error('PAID_PROVIDER_EXECUTION_BLOCKED');
import {readFile,writeFile,stat,lstat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {bankPolicy} from '../packages/protocol/src/index.js';
import {speechProviderConfiguration} from '../services/api/src/provider-configuration.js';
import {analyzeServiceWithProvider} from '../services/api/src/service-analysis.js';
import {assertEvaluationCostBudget} from './evaluate-service-analysis.js';
import {execFileSync} from 'node:child_process';
import {DeepgramStream} from '../services/api/src/transcription.js';
const [mode,input,output]=process.argv.slice(2);if(!['stt','llm'].includes(mode??'')||!input||!output)throw new Error('USE_STT_OR_LLM_CONSENTED_INPUT_NEW_RESULT_PATH');
const required=(name:string)=>{const value=process.env[name];if(!value)throw new Error(`MISSING_${name}`);return value;};
try{await lstat(output);throw new Error('OUTPUT_ALREADY_EXISTS');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
assertEvaluationCostBudget(process.env,1);const configuration=await speechProviderConfiguration();
const size=(await stat(input)).size;if(!size||size>(mode==='stt'?1048576:4000))throw new Error('SMOKE_INPUT_BUDGET_EXCEEDED');
const sample=await readFile(input);if(!sample.length||sample.length>(mode==='stt'?1048576:4000))throw new Error('SMOKE_INPUT_BUDGET_EXCEEDED');
const started=Date.now();let observations:unknown;
if(mode==='stt'){
 let audioSeconds:number;try{const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',input],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}));audioSeconds=Number(probe.format?.duration);if(!Number.isFinite(audioSeconds)||audioSeconds<=0||audioSeconds>30||!Array.isArray(probe.streams)||probe.streams.length!==1||probe.streams.some((s:{codec_type:string})=>s.codec_type!=='audio'))throw new Error();}catch{throw new Error('CONSENTED_AUDIO_DURATION_REQUIRED_MAX30_SECONDS');}
 if(sample.subarray(0,4).toString('hex')!=='1a45dfa3')throw new Error('CONSENTED_WEBM_SAMPLE_REQUIRED');
 let revisions=0,finals=0;
 await new Promise<void>((resolve,reject)=>{let stopped=false;const finish=(error?:Error)=>{if(stopped)return;stopped=true;stream.stop();error?reject(error):resolve();};
  const stream=new DeepgramStream({apiKey:configuration.stt.apiKey??required('DEEPGRAM_API_KEY'),model:configuration.stt.model??required('DEEPGRAM_MODEL'),streamId:randomUUID(),maxBytes:1048576,maxDurationMs:30000,onReady:()=>{void(async()=>{let sequence=0;for(let i=0;i<sample.length&&!stopped;i+=32768){stream.push(sample.subarray(i,i+32768),++sequence);await new Promise(r=>setTimeout(r,250));}})().catch(()=>finish(new Error('SMOKE_STREAM_SEND_FAILED')));},onRevision:r=>{revisions++;if(r.final&&r.text.trim()){finals++;finish();}},onUnavailable:code=>finish(new Error(code))});stream.connect();
 });observations={revisions,finals,audioSeconds,connectionBudgetSeconds:30,providerCalls:1};
}else{
 if(!configuration.llm)throw new Error('LLM_NOT_CONFIGURED');const result=await analyzeServiceWithProvider(configuration.llm,{text:sample.toString('utf8'),policy:bankPolicy,signal:AbortSignal.timeout(4000)});observations={signals:result.signals.length,providerCalls:1};
}
await writeFile(output,JSON.stringify({mode,inputSha256:createHash('sha256').update(sample).digest('hex'),sampleBytes:sample.length,elapsedMs:Date.now()-started,observations,scope:'real-provider-contract-smoke-only-not-Korean-accuracy-or-call-e2e',audioStored:false,transcriptStored:false},null,2)+'\n',{flag:'wx',mode:0o600});
process.stdout.write('Provider smoke completed. Only counts and input hash saved; this is not an accuracy or billing claim.\n');
