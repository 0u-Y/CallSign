import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';

export const deploymentServices=['platform','issuer','sender','worker','web','https','witness1','witness2','witness3','witness4','asterisk','turn','besu1','besu2','besu3','besu4','postgres','oidc','oidc-db','oidc-init','anchor','anchor-db','migration-runner'];
export function assertManagedDeployment(records,project,deploymentId){
 if(!/^[a-z0-9][a-z0-9_-]*$/.test(project??'')||!deploymentId)throw Error('DEPLOYMENT_IDENTITY_REQUIRED');
 for(const record of records){
  const labels=record.labels??{};
  if(labels['com.docker.compose.project']!==project||labels['org.callsign.deployment-id']!==deploymentId||labels['org.callsign.lifecycle']!=='persistent'||labels['org.callsign.run-id']||!deploymentServices.includes(labels['com.docker.compose.service']))throw Error('DEPLOYMENT_RESOURCE_IDENTITY_MISMATCH');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [command,file,...compose]=process.argv.slice(2);
  if(!['status','check','owned','latch','stop','review'].includes(command)||!file||compose[0]!=='docker'||compose[1]!=='compose')throw Error('DEPLOYMENT_CONTROL_ARGUMENTS_INVALID');
  const env={...parseEnv(readFileSync(file,'utf8')),...process.env},project=env.CALLSIGN_PROJECT||'callsign-finals';
  const ids=execFileSync('docker',['ps','--all','--no-trunc','--quiet','--filter','label=com.docker.compose.project='+project],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim().split(/\s+/).filter(Boolean);
  const format='{"id":{{json .Id}},"labels":{{json .Config.Labels}},"state":{{json .State.Status}},"health":{{if (index .State "Health")}}{{json (index .State "Health").Status}}{{else}}null{{end}}}';
  const records=ids.length?execFileSync('docker',['inspect','--format',format,...ids],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim().split('\n').map(line=>JSON.parse(line)):[];
  assertManagedDeployment(records,project,env.DEPLOYMENT_ID);
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
  if(command==='check'&&latched)throw Error('RESOURCE_STOP_LATCHED_OPERATOR_REVIEW_REQUIRED');
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
  if(command==='status')console.log(JSON.stringify({project,deploymentId:env.DEPLOYMENT_ID,resourceStopLatched:latched,priorResourceStopReviewed:reviewed,services:records.map(r=>({service:r.labels['com.docker.compose.service'],id:r.id,state:r.state,health:r.health})),scope:'Owned containers only; health is not complete readiness; resource monitor availability is not established by this command.'}));
 }catch(error){console.error(error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'DEPLOYMENT_CONTROL_FAILED');process.exitCode=78;}
}
