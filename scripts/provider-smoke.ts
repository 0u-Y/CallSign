// Never part of light/CI. These commands incur real provider usage only after separate approval.
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='media'||process.env.CALLSIGN_PROVIDER_CONFIRMATION!=='CONSENTED-SAMPLE-WITH-BUDGET')throw new Error('PAID_PROVIDER_EXECUTION_BLOCKED');
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {bankPolicy} from '../packages/protocol/src/index.js';
import {DeepgramStream,analyzeWithAnthropic} from '../services/api/src/transcription.js';
const [mode,input,output]=process.argv.slice(2);if(!['stt','llm'].includes(mode??'')||!input||!output)throw new Error('USE_STT_OR_LLM_CONSENTED_INPUT_NEW_RESULT_PATH');
const required=(name:string)=>{const value=process.env[name];if(!value)throw new Error(`MISSING_${name}`);return value;};
const size=(await stat(input)).size;if(!size||size>(mode==='stt'?1048576:4000))throw new Error('SMOKE_INPUT_BUDGET_EXCEEDED');
const sample=await readFile(input);if(!sample.length||sample.length>(mode==='stt'?1048576:4000))throw new Error('SMOKE_INPUT_BUDGET_EXCEEDED');
const started=Date.now();let observations:unknown;
if(mode==='stt'){
 if(sample.subarray(0,4).toString('hex')!=='1a45dfa3')throw new Error('CONSENTED_WEBM_SAMPLE_REQUIRED');
 let revisions=0,finals=0;
 await new Promise<void>((resolve,reject)=>{let stopped=false;const finish=(error?:Error)=>{if(stopped)return;stopped=true;stream.stop();error?reject(error):resolve();};
  const stream=new DeepgramStream({apiKey:required('DEEPGRAM_API_KEY'),model:required('DEEPGRAM_MODEL'),streamId:randomUUID(),maxBytes:1048576,maxDurationMs:30000,onReady:()=>{void(async()=>{let sequence=0;for(let i=0;i<sample.length&&!stopped;i+=32768){stream.push(sample.subarray(i,i+32768),++sequence);await new Promise(r=>setTimeout(r,250));}})().catch(()=>finish(new Error('SMOKE_STREAM_SEND_FAILED')));},onRevision:r=>{revisions++;if(r.final&&r.text.trim()){finals++;finish();}},onUnavailable:code=>finish(new Error(code))});stream.connect();
 });observations={revisions,finals,connectionBudgetSeconds:30,providerCalls:1};
}else{
 const result=await analyzeWithAnthropic({apiKey:required('ANTHROPIC_API_KEY'),model:required('ANTHROPIC_MODEL'),text:sample.toString('utf8'),policy:bankPolicy,signal:AbortSignal.timeout(5000)});observations={signals:result.signals.length,providerCalls:1};
}
await writeFile(output,JSON.stringify({mode,inputSha256:createHash('sha256').update(sample).digest('hex'),sampleBytes:sample.length,elapsedMs:Date.now()-started,observations,scope:'real-provider-contract-smoke-only-not-Korean-accuracy-or-call-e2e',audioStored:false,transcriptStored:false},null,2)+'\n',{flag:'wx',mode:0o600});
process.stdout.write('Provider smoke completed. Only counts and input hash saved; this is not an accuracy or billing claim.\n');
