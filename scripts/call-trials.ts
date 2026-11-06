import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isIP} from 'node:net';
import {aggregateCallTrials,callTrySchema,trialPlanSchema,type CallTry} from './evaluate-performance.js';
import {execute} from './validation-runner.js';
export function assertCallTrialExecution(env:NodeJS.ProcessEnv){if(env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='media'||env.CALLSIGN_TRIAL_CONFIRMATION!=='BOUNDED-SYNTHETIC-CALLS')throw new Error('CALL_TRIAL_EXECUTION_BLOCKED');}
export function assertCallTrialTarget(target:{deploymentId:string;trustPin:string},env:NodeJS.ProcessEnv){
 if(target.deploymentId!==env.CALLSIGN_VALIDATION_DEPLOYMENT_ID||target.trustPin!==env.CALLSIGN_VALIDATION_TRUST_PIN)throw new Error('CALL_TRIAL_TARGET_MISMATCH');
 if(env.CALLSIGN_MEDIA_PERSISTENT_DEMO_CONFIRMATION==='OWNED_PUBLIC_DEMO'){
  if(!target.deploymentId.startsWith('callsign-live-'))throw new Error('OWNED_PERSISTENT_DEMO_REQUIRED');
 }else if(!target.deploymentId.startsWith('test:'))throw new Error('ISOLATED_TEST_OR_EXPLICIT_PERSISTENT_DEMO_REQUIRED');
}
export function callTrialBrowserArgs(env:NodeJS.ProcessEnv){
 const ip=env.CALLSIGN_MEDIA_PUBLIC_DNS_IPV4;if(!ip)return [];
 if(env.CALLSIGN_MEDIA_PERSISTENT_DEMO_CONFIRMATION!=='OWNED_PUBLIC_DEMO'||isIP(ip)!==4)throw new Error('EXPLICIT_PUBLIC_DEMO_DNS_REQUIRED');
 const origin=new URL(env.CALLSIGN_MEDIA_SIGNALING_ORIGIN??'');
 if(origin.protocol!=='https:'||origin.origin!==env.CALLSIGN_MEDIA_SIGNALING_ORIGIN||origin.username||origin.password)throw new Error('FIXED_PUBLIC_SIGNALING_ORIGIN_REQUIRED');
 // Restrict this server-hosted public check to its default interface, excluding unrelated host NICs.
 return ['--webrtc-ip-handling-policy=default_public_interface_only',`--host-resolver-rules=MAP ${origin.hostname} ${ip}`];
}
export async function callTrials(planPath:string,output:string,run=false){
 if(run)assertCallTrialExecution(process.env);
 const bytes=await readFile(planPath);if(bytes.length>32768)throw new Error('TRIAL_PLAN_TOO_LARGE');const plan=trialPlanSchema.parse(JSON.parse(bytes.toString()));
 if(!run){await writeFile(output,JSON.stringify({...aggregateCallTrials(plan,[],'actual-observation'),execution:'NOT_RUN'},null,2)+'\n',{flag:'wx',mode:0o600});return;}
 for(const key of ['CALLSIGN_MEDIA_ORIGIN','CALLSIGN_MEDIA_GATEWAY_STORAGE','CALLSIGN_MEDIA_RECIPIENT_STORAGE','CALLSIGN_MEDIA_INTENT_ID','CALLSIGN_MEDIA_CREDENTIAL_DIGEST','CALLSIGN_VALIDATION_DEPLOYMENT_ID','CALLSIGN_VALIDATION_TRUST_PIN','CALLSIGN_MEDIA_SENDER_WAV','CALLSIGN_MEDIA_RECIPIENT_WAV'])if(!process.env[key])throw new Error('MISSING_'+key);
 if(!plan.fixtures.includes('synthetic-audio'))throw new Error('SYNTHETIC_AUDIO_SCOPE_REQUIRED');
 if(plan.analysis==='fixture'&&(!plan.fixtures.includes('analysis-adapter')||!process.env.CALLSIGN_MEDIA_ANALYSIS_CONTROL_URL||!process.env.CALLSIGN_MEDIA_ANALYSIS_TOKEN_FILE))throw new Error('EXPLICIT_ANALYSIS_FIXTURE_REQUIRED');
 if(plan.environmentId!==process.env.CALLSIGN_VALIDATION_DEPLOYMENT_ID)throw new Error('TRIAL_ENVIRONMENT_MISMATCH');
 try{await lstat(output);throw new Error('OUTPUT_ALREADY_EXISTS');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const root=resolve(output+'.files');await mkdir(root,{mode:0o700});const rows:Array<{id:string;tries:CallTry[]}>=[],started=performance.now();
 try{trials:for(let n=0;n<plan.normalAttempts;n++){
  const row={id:'logical-'+n,tries:[] as CallTry[]};rows.push(row);
  for(let retry=0;retry<=plan.maxRetries;retry++){
   const left=plan.totalTimeoutMs-(performance.now()-started);if(left<=0)break;
   const path=join(root,`trial-${n}-${retry}.json`),env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined));
   env.CALLSIGN_MEDIA_ANALYSIS_MODE=plan.analysis;env.CALLSIGN_TRIAL_MODE='normal-end';env.CALLSIGN_CALL_OBSERVATION_PATH=path;env.CALLSIGN_VALIDATION_OUTPUT=join(root,`output-${n}-${retry}`);env.CALLSIGN_EXPECT_TRANSPORT=plan.transport;
   const result=await execute(['pnpm','exec','playwright','test','--config','playwright.finals.config.ts','tests/media/service-pbx.spec.ts','--timeout',String(Math.min(left,plan.perTryTimeoutMs))],Math.min(left,plan.perTryTimeoutMs),env);
   let observed:CallTry;try{observed=callTrySchema.parse(JSON.parse(await readFile(path,'utf8')));}catch{observed={observer:'controller',outcome:result.output.startsWith('STEP_TIMEOUT')?'timeout':'failure',finishedMs:Math.min(result.durationMs,600000),events:[]};}
   if(result.output.startsWith('STEP_TIMEOUT'))observed.outcome='timeout';else if(result.status!=='PASS'&&observed.outcome==='success')observed.outcome='failure';row.tries.push(observed);
   if(!observed.events.some(e=>e.phase==='resources-reclaimed'))break trials;
   if(observed.outcome==='success')break;
  }
 }}finally{await writeFile(output,JSON.stringify(aggregateCallTrials(plan,rows,'actual-observation'),null,2)+'\n',{flag:'wx',mode:0o600});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const [plan,output,...flags]=process.argv.slice(2);if(!plan||!output||flags.some(x=>x!=='--run'))throw new Error('USE_PLAN_NEW_OUTPUT_OPTIONAL_RUN');await callTrials(plan,output,flags.includes('--run'));}
