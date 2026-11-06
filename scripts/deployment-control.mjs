import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';
import {immutableImageReference} from './image-reference.mjs';

export const deploymentServices=['platform','issuer','sender','worker','web','https','witness1','witness2','witness3','witness4','asterisk','turn','besu1','besu2','besu3','besu4','postgres','oidc','oidc-db','oidc-init','anchor','anchor-db','migration-runner','browser-check'];
export function assertManagedDeployment(records,project,deploymentId){
 if(!/^[a-z0-9][a-z0-9_-]*$/.test(project??'')||!deploymentId)throw Error('DEPLOYMENT_IDENTITY_REQUIRED');
 for(const record of records){
  const labels=record.labels??{};
  if(labels['com.docker.compose.project']!==project||labels['org.callsign.deployment-id']!==deploymentId||labels['org.callsign.lifecycle']!=='persistent'||labels['org.callsign.run-id']||!deploymentServices.includes(labels['com.docker.compose.service']))throw Error('DEPLOYMENT_RESOURCE_IDENTITY_MISMATCH');
 }
}
export function safeStopRecords(records,project,deploymentId){
 const owned=[],excluded=[];
 for(const record of records){try{assertManagedDeployment([record],project,deploymentId);owned.push(record);}catch{excluded.push(record);}}
 if(!owned.length&&excluded.length)throw Error('DEPLOYMENT_RESOURCE_IDENTITY_MISMATCH');
 return {owned,excluded};
}
export const serverStartStages=[['oidc-db','postgres','anchor-db','besu1','besu2','besu3','besu4'],['oidc','anchor'],['witness1','witness2','witness3','witness4','turn','asterisk'],['platform','issuer','sender','worker','web','https']];
export function existingServerStages(records,env,issuerImage){
 assertManagedDeployment(records,env.CALLSIGN_PROJECT,env.DEPLOYMENT_ID);
 const images={postgres:'POSTGRES_IMAGE','anchor-db':'POSTGRES_IMAGE','oidc-db':'POSTGRES_IMAGE',oidc:'KEYCLOAK_IMAGE',https:'CALLSIGN_INGRESS_IMAGE',web:'CALLSIGN_INGRESS_IMAGE',asterisk:'ASTERISK_IMAGE',turn:'TURN_IMAGE'};
 const selected=serverStartStages.map(stage=>stage.map(service=>{
  const matches=records.filter(r=>r.labels['com.docker.compose.service']===service);
  if(matches.length!==1)throw Error('EXISTING_SERVER_SERVICE_REQUIRED');const r=matches[0],key=images[service]??(service.startsWith('besu')?'BESU_IMAGE':service==='issuer'&&env.CALLSIGN_ISSUER_IMAGE?'CALLSIGN_ISSUER_IMAGE':service==='worker'&&env.CALLSIGN_WORKER_IMAGE?'CALLSIGN_WORKER_IMAGE':'CALLSIGN_APP_IMAGE');
  if(!/^[0-9a-f]{64}$/.test(r.id)||!immutableImageReference(env[key])||r.imageReference!==env[key]||!/^sha256:[0-9a-f]{64}$/.test(r.image)||(env[key].startsWith('sha256:')&&r.image!==env[key]))throw Error('EXISTING_SERVER_IMAGE_MISMATCH');
  const memoryCap=(service.startsWith('besu')?3072:service==='oidc'?1024:['anchor','https','web','turn'].includes(service)?256:512)*1024**2,cpuCap=(service.startsWith('witness')||['anchor','https','web','turn'].includes(service)?0.5:1)*1e9;
  if(r.network!=='host'||!Object.hasOwn(r,'ports')||Object.keys(r.ports??{}).length||r.privileged!==false||!Number.isSafeInteger(r.memory)||r.memory<=0||r.memory>memoryCap||!Number.isSafeInteger(r.cpu)||r.cpu<=0||r.cpu>cpuCap||r.swap!==r.memory||r.restart!=='no')throw Error('EXISTING_SERVER_ISOLATION_REQUIRED');
  if(!['created','exited','running'].includes(r.state)||r.oom)throw Error('EXISTING_SERVER_STATE_INVALID');
  const entry=[...(r.entrypoint??[]),...(r.command??[])];
  if(!entry.length||entry.some(v=>['import','--import-realm','seed','--seed','init','--init','new','--new','start-dev'].includes(v))||(service==='oidc'&&!entry.includes('start')))throw Error('EXISTING_SERVER_NORMAL_ENTRYPOINT_REQUIRED');
  return r;
 }));
 if(records.some(r=>['browser-check','migration-runner','oidc-init'].includes(r.labels['com.docker.compose.service'])&&['running','restarting','paused'].includes(r.state)))throw Error('ACTIVE_DEPLOYMENT_TRIAL_OR_INITIALIZATION');
 const issuer=selected.flat().find(r=>r.labels['com.docker.compose.service']==='issuer');if(!Array.isArray(issuer.environment))throw Error('PERSISTENT_PROVIDER_CONFIGURATION_UNOBSERVED');const issuerEnv=Object.fromEntries(issuer.environment.map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
 const mode=env.CALLSIGN_PROVIDER_CONFIG??'none';if(!['none','deepgram-openai'].includes(mode))throw Error('PROVIDER_CONFIGURATION_INVALID');
 if(mode==='none'&&['OPENAI_API_KEY','OPENAI_API_KEY_FILE','DEEPGRAM_API_KEY','DEEPGRAM_API_KEY_FILE','ANTHROPIC_API_KEY','ANTHROPIC_API_KEY_FILE'].some(k=>issuerEnv[k]))throw Error('PERSISTENT_PROVIDER_CONFIGURATION_MISMATCH');
 if(mode==='deepgram-openai'){
  let budget;try{
   const raw=env.CALLSIGN_ANALYSIS_SMOKE_BUDGET;if(typeof raw!=='string'||raw.length>1024)throw Error();budget=JSON.parse(raw);
   const fields=['id','expiresAt','sttSeconds','connections','llmRequests'];
   if(!budget||Array.isArray(budget)||typeof budget!=='object'||Object.keys(budget).length!==fields.length||Object.keys(budget).some(k=>!fields.includes(k))||typeof budget.id!=='string'||!(/^[A-Za-z0-9_-]{3,80}$/).test(budget.id)||!Number.isSafeInteger(budget.expiresAt)||budget.expiresAt<=0||!Number.isInteger(budget.sttSeconds)||budget.sttSeconds<1||budget.sttSeconds>300||!Number.isInteger(budget.connections)||budget.connections<1||budget.connections>3||!Number.isInteger(budget.llmRequests)||budget.llmRequests<0||budget.llmRequests>20)throw Error();
  }catch{throw Error('PERSISTENT_ANALYSIS_BUDGET_REQUIRED');}
  if(budget.expiresAt<=Date.now()/1000||issuerEnv.CALLSIGN_ANALYSIS_SMOKE_BUDGET!==env.CALLSIGN_ANALYSIS_SMOKE_BUDGET||issuerEnv.CALLSIGN_ANALYSIS_PROVIDER!=='openai')throw Error('PERSISTENT_ANALYSIS_BUDGET_REQUIRED');
  // Container labels can be overridden; the feature must belong to the pinned image config itself.
  if(issuerImage?.id!==issuer.image||issuerImage?.labels?.['org.callsign.analysis-smoke-budget']!=='v1')throw Error('PERSISTENT_ANALYSIS_RUNTIME_REQUIRED');
 }
 return selected;
}
export function assertLiveServerMonitor(ready,sample,observed){
 const diagnostic=observed.resourcePolicy==='persistent-observe-v1';
 if((ready.policy??'bounded-v1')!==(observed.resourcePolicy??'bounded-v1')||ready.deploymentId!==observed.deploymentId||ready.pid!==observed.pid||String(ready.processStart)!==String(observed.processStart)||sample.observerPid!==ready.pid||!Number.isFinite(observed.ageSeconds)||observed.ageSeconds<0||observed.ageSeconds>20||!Number.isFinite(observed.nowNs)||!Number.isFinite(sample.monotonicNs)||observed.nowNs-sample.monotonicNs<0||observed.nowNs-sample.monotonicNs>20e9)throw Error('LIVE_APPROVED_SERVER_MONITOR_REQUIRED');
 if(diagnostic){if(ready.expiresMonotonicNs!==null)throw Error('LIVE_APPROVED_SERVER_MONITOR_REQUIRED');return;}
 if(!Number.isFinite(ready.expiresMonotonicNs)||ready.expiresMonotonicNs<=observed.nowNs||sample.stop||!Number.isFinite(sample.memAvailableBytes)||sample.memAvailableBytes<(observed.starting?32:16)*1024**3||!Number.isFinite(sample.ownedBytes)||sample.ownedBytes<0||sample.ownedBytes>16*1024**3)throw Error('LIVE_APPROVED_SERVER_MONITOR_REQUIRED');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [command,file,...compose]=process.argv.slice(2);
  if(!['status','check','owned','latch','stop','review','server-check','server-start','server-restart'].includes(command)||!file||compose[0]!=='docker'||compose[1]!=='compose')throw Error('DEPLOYMENT_CONTROL_ARGUMENTS_INVALID');
  const env={...parseEnv(readFileSync(file,'utf8')),...process.env},project=env.CALLSIGN_PROJECT||'callsign-finals';
  const ids=execFileSync('docker',['ps','--all','--no-trunc','--quiet','--filter','label=com.docker.compose.project='+project],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim().split(/\s+/).filter(Boolean);
  const format='{"id":{{json .Id}},"labels":{{json .Config.Labels}},"state":{{json .State.Status}},"health":{{if (index .State "Health")}}{{json (index .State "Health").Status}}{{else}}null{{end}},"image":{{json .Image}},"imageReference":{{json .Config.Image}},"network":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}},"privileged":{{json .HostConfig.Privileged}},"memory":{{.HostConfig.Memory}},"cpu":{{.HostConfig.NanoCpus}},"swap":{{.HostConfig.MemorySwap}},"restart":{{json .HostConfig.RestartPolicy.Name}},"oom":{{.State.OOMKilled}},"entrypoint":{{json .Config.Entrypoint}},"command":{{json .Config.Cmd}},"environment":{{json .Config.Env}}}';
  let records=ids.length?execFileSync('docker',['inspect','--format',format,...ids],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim().split('\n').map(line=>JSON.parse(line)):[];
  let excludedCount=0;
  if(['latch','stop'].includes(command)){const selected=safeStopRecords(records,project,env.DEPLOYMENT_ID);records=selected.owned;excludedCount=selected.excluded.length;}
  else assertManagedDeployment(records,project,env.DEPLOYMENT_ID);
  if(!env.FINALS_DATA_DIR)throw Error('PERSISTENT_STATE_DIRECTORY_REQUIRED');
  let latch=resolve(env.FINALS_DATA_DIR,'resource-stop.json'),reviewPath=resolve(env.FINALS_DATA_DIR,'resource-stop.review.json');
  const protectedState=()=>{
   const parent=lstatSync(env.FINALS_DATA_DIR);
   if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==process.getuid()||(parent.mode&0o077))throw Error('OWNED_PROTECTED_STATE_DIRECTORY_REQUIRED');
  };
  const protectedBytes=(path)=>{protectedState();const info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077)||info.size>4096)throw Error('PROTECTED_RESOURCE_STOP_OR_REVIEW_REQUIRED');return readFileSync(path);};
  let reviewed=false,index=0;
  // Each explicit review binds one immutable stop; a later stop needs another operator decision.
  while(existsSync(reviewPath)){
   const review=JSON.parse(protectedBytes(reviewPath).toString('utf8'));
   if(review.deploymentId!==env.DEPLOYMENT_ID||review.stopSha256!==createHash('sha256').update(protectedBytes(latch)).digest('hex')||review.format!=='callsign-operator-stop-review-v1')throw Error('RESOURCE_REVIEW_IDENTITY_MISMATCH');
   reviewed=true;index++;
   latch=resolve(env.FINALS_DATA_DIR,index===1?'resource-stop.after-review.json':`resource-stop.after-review-${index}.json`);
   reviewPath=resolve(env.FINALS_DATA_DIR,`resource-stop.review-${index+1}.json`);
  }
  const latched=existsSync(latch);
  if(['check','server-check','server-start','server-restart'].includes(command)&&latched)throw Error('RESOURCE_STOP_LATCHED_OPERATOR_REVIEW_REQUIRED');
  if(command.startsWith('server-')){
   if(env.CALLSIGN_DEPLOYMENT_TARGET!=='server')throw Error('PERSISTENT_SERVER_TARGET_REQUIRED');
   const config=lstatSync(file);if(!config.isFile()||config.isSymbolicLink()||config.uid!==process.getuid()||(config.mode&0o077))throw Error('OWNED_PROTECTED_SERVER_CONFIGURATION_REQUIRED');protectedState();
   let issuerImage;
   if(env.CALLSIGN_PROVIDER_CONFIG==='deepgram-openai'){
    const issuer=records.find(r=>r.labels['com.docker.compose.service']==='issuer');if(!/^sha256:[0-9a-f]{64}$/.test(issuer?.image??''))throw Error('EXISTING_SERVER_IMAGE_MISMATCH');
    issuerImage=JSON.parse(execFileSync('docker',['image','inspect','--format','{"id":{{json .Id}},"labels":{{json .Config.Labels}}}',issuer.image],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}));
   }
   const stages=existingServerStages(records,env,issuerImage),monitorDir=resolve(process.env.CALLSIGN_MONITOR_DIR??env.CALLSIGN_MONITOR_DIR??'');
   const monitor=(starting=false)=>{
    const directory=lstatSync(monitorDir);if(!directory.isDirectory()||directory.isSymbolicLink()||directory.uid!==process.getuid()||(directory.mode&0o077)||existsSync(resolve(monitorDir,'stop.json')))throw Error('LIVE_APPROVED_SERVER_MONITOR_REQUIRED');
    const read=(name,max)=>{const path=resolve(monitorDir,name),info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||info.size>max)throw Error('LIVE_APPROVED_SERVER_MONITOR_REQUIRED');return {text:readFileSync(path,'utf8'),mtime:info.mtimeMs};};
    const ready=JSON.parse(read('ready.json',4096).text),log=read('resources.jsonl',11*1024**2),sample=JSON.parse(log.text.trim().split('\n').at(-1));
    if(!Number.isSafeInteger(ready.pid)||ready.pid<1||lstatSync(`/proc/${ready.pid}`).uid!==process.getuid())throw Error('LIVE_APPROVED_SERVER_MONITOR_REQUIRED');
    const stat=readFileSync(`/proc/${ready.pid}/stat`,'utf8'),processStart=stat.slice(stat.lastIndexOf(')')+2).split(' ')[19];
    const args=readFileSync(`/proc/${ready.pid}/cmdline`,'utf8').split('\0');
    if(!args.some(v=>v.endsWith('/monitor-deployment.py'))||args[args.indexOf('--env-file')+1]!==resolve(file)||args[args.indexOf('--output')+1]!==monitorDir)throw Error('LIVE_APPROVED_SERVER_MONITOR_REQUIRED');
    assertLiveServerMonitor(ready,sample,{deploymentId:env.DEPLOYMENT_ID,pid:ready.pid,processStart,ageSeconds:(Date.now()-log.mtime)/1000,starting,resourcePolicy:env.CALLSIGN_RESOURCE_POLICY,nowNs:Number(process.hrtime.bigint())});return ready;
   };
   const ready=monitor(true);
   if(command==='server-check'){console.log(JSON.stringify({deploymentId:env.DEPLOYMENT_ID,services:stages.flat().length,monitorPid:ready.pid,expiresMonotonicNs:ready.expiresMonotonicNs,scope:'Existing container and live monitor checks only; no restart or complete readiness claim'}));process.exit(0);}
   if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure')throw Error('PERSISTENT_SERVER_START_APPROVAL_REQUIRED');
   const output=resolve(env.FINALS_DATA_DIR,`server-operation-${Date.now()}-${process.pid}`);protectedState();
   const baseline={command,deploymentId:env.DEPLOYMENT_ID,configSha256:createHash('sha256').update(readFileSync(file)).digest('hex'),monitorPid:ready.pid,expiresMonotonicNs:ready.expiresMonotonicNs,ids:stages.flat().map(r=>r.id)};
   writeFileSync(output+'.json',JSON.stringify(baseline)+'\n',{flag:'wx',mode:0o600});
   const stop=()=>{let failed=false;for(const stage of [...stages].reverse()){const ids=stage.map(r=>r.id);try{if(ids.length)execFileSync('docker',['stop','--time','15',...ids],{timeout:60000,stdio:['ignore','ignore','pipe']});}catch{failed=true;}}if(failed)throw Error('SERVER_STOP_INCOMPLETE');};
   let phase='validated',started=[];
   try{
    if(command==='server-restart'){phase='stop';stop();}
    for(const stage of stages){monitor();phase=stage.map(r=>r.labels['com.docker.compose.service']).join(',');execFileSync('docker',['start',...stage.map(r=>r.id)],{timeout:30000,stdio:['ignore','ignore','pipe']});started.push(...stage.map(r=>r.id));
     const deadline=Date.now()+60000;
     while(true){monitor();const current=JSON.parse(execFileSync('docker',['inspect',...stage.map(r=>r.id)],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}));
      if(current.some(r=>!r.State.Running||r.State.OOMKilled||r.State.Health?.Status==='unhealthy'))throw Error('SERVER_START_DEPENDENCY_FAILED');
      if(current.every(r=>!r.State.Health||r.State.Health.Status==='healthy'))break;
      if(Date.now()>=deadline)throw Error('SERVER_START_READINESS_TIMEOUT');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);
     }
    }
    const result={status:'STARTED',phase,started,scope:'Existing containers started; verify application readiness and user flow separately'};writeFileSync(output+'.result.json',JSON.stringify(result)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));
   }catch(error){let stopped=false;try{stop();stopped=true;}catch{}writeFileSync(output+'.result.json',JSON.stringify({status:'FAILED',phase,started,stopped,reason:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'SERVER_START_FAILED',automaticRestart:false})+'\n',{flag:'wx',mode:0o600});throw error;}
  }
  if(command==='review'){
   const reference=process.env.CALLSIGN_RESOURCE_REVIEW_REFERENCE;
   if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure'||!reference||reference.length<8||reference.length>200||/[\r\n]/.test(reference))throw Error('EXPLICIT_OPERATOR_RESOURCE_REVIEW_REQUIRED');
   if(!latched)throw Error('RESOURCE_REVIEW_ALREADY_USED');
   const bytes=protectedBytes(latch),prior=JSON.parse(bytes.toString('utf8'));
   if(prior.deploymentId!==env.DEPLOYMENT_ID)throw Error('RESOURCE_REVIEW_IDENTITY_MISMATCH');
   writeFileSync(reviewPath,JSON.stringify({format:'callsign-operator-stop-review-v1',deploymentId:env.DEPLOYMENT_ID,stopSha256:createHash('sha256').update(bytes).digest('hex'),reference,recordedAt:new Date().toISOString(),automaticRestart:false})+'\n',{flag:'wx',mode:0o600});
  }
  if(command==='latch'&&!existsSync(latch)){
   protectedState();writeFileSync(latch,JSON.stringify({reason:'OPERATOR_RESOURCE_STOP',recordedAt:new Date().toISOString(),deploymentId:env.DEPLOYMENT_ID})+'\n',{flag:'wx',mode:0o600});
  }
  if(command==='stop'){
   const data=new Set(['postgres','besu1','besu2','besu3','besu4','oidc-db','anchor-db']);
   for(const dataStage of [false,true]){
    const selected=records.filter(r=>data.has(r.labels['com.docker.compose.service'])===dataStage).map(r=>r.id);
    // Stop the validated full IDs, so replacement containers cannot inherit permission from a name.
    if(selected.length)execFileSync('docker',['stop','--time','15',...selected],{timeout:60000,stdio:['ignore','ignore','pipe']});
   }
  }
  if(excludedCount)console.error('UNOWNED_RESOURCES_EXCLUDED_FROM_STOP');
  if(command==='status')console.log(JSON.stringify({project,deploymentId:env.DEPLOYMENT_ID,resourceStopLatched:latched,resourcePolicy:env.CALLSIGN_RESOURCE_POLICY??'bounded-v1',priorResourceStopReviewed:reviewed,services:records.map(r=>({service:r.labels['com.docker.compose.service'],id:r.id,state:r.state,health:r.health})),scope:'Owned containers only; health is not complete readiness; resource monitor availability is not established by this command.'}));
 }catch(error){console.error(error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'DEPLOYMENT_CONTROL_FAILED');process.exitCode=78;}
}
