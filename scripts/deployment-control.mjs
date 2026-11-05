import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';

export const deploymentServices=['platform','issuer','sender','worker','web','https','witness1','witness2','witness3','witness4','asterisk','turn','besu1','besu2','besu3','besu4','postgres','oidc','oidc-db','oidc-init'];
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
  const original=resolve(env.FINALS_DATA_DIR,'resource-stop.json'),reviewPath=resolve(env.FINALS_DATA_DIR,'resource-stop.review.json'),followup=resolve(env.FINALS_DATA_DIR,'resource-stop.after-review.json');
  const protectedState=()=>{
   const parent=lstatSync(env.FINALS_DATA_DIR);
   if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==process.getuid()||(parent.mode&0o077))throw Error('OWNED_PROTECTED_STATE_DIRECTORY_REQUIRED');
  };
  const stoppedBytes=()=>{protectedState();const info=lstatSync(original);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077)||info.size>4096)throw Error('PROTECTED_RESOURCE_STOP_REQUIRED');return readFileSync(original);};
  let reviewed=false;
  if(['status','check','latch','review'].includes(command)&&existsSync(reviewPath)){
   protectedState();const info=lstatSync(reviewPath);
   if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077)||info.size>4096)throw Error('PROTECTED_RESOURCE_REVIEW_REQUIRED');
   const review=JSON.parse(readFileSync(reviewPath,'utf8'));
   if(review.deploymentId!==env.DEPLOYMENT_ID||review.stopSha256!==createHash('sha256').update(stoppedBytes()).digest('hex')||review.format!=='callsign-operator-stop-review-v1')throw Error('RESOURCE_REVIEW_IDENTITY_MISMATCH');
   reviewed=true;
  }
  const latched=existsSync(followup)||(existsSync(original)&&!reviewed);
  if(command==='check'&&latched)throw Error('RESOURCE_STOP_LATCHED_OPERATOR_REVIEW_REQUIRED');
  if(command==='review'){
   const reference=process.env.CALLSIGN_RESOURCE_REVIEW_REFERENCE;
   if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure'||!reference||reference.length<8||reference.length>200||/[\r\n]/.test(reference))throw Error('EXPLICIT_OPERATOR_RESOURCE_REVIEW_REQUIRED');
   if(reviewed||existsSync(followup))throw Error('RESOURCE_REVIEW_ALREADY_USED');
   const bytes=stoppedBytes(),prior=JSON.parse(bytes.toString('utf8'));
   if(prior.deploymentId!==env.DEPLOYMENT_ID)throw Error('RESOURCE_REVIEW_IDENTITY_MISMATCH');
   writeFileSync(reviewPath,JSON.stringify({format:'callsign-operator-stop-review-v1',deploymentId:env.DEPLOYMENT_ID,stopSha256:createHash('sha256').update(bytes).digest('hex'),reference,recordedAt:new Date().toISOString(),automaticRestart:false})+'\n',{flag:'wx',mode:0o600});
  }
  const latch=reviewed?followup:original;
  if(command==='latch'&&!existsSync(latch)){
   protectedState();writeFileSync(latch,JSON.stringify({reason:'OPERATOR_RESOURCE_STOP',recordedAt:new Date().toISOString(),deploymentId:env.DEPLOYMENT_ID})+'\n',{flag:'wx',mode:0o600});
  }
  if(command==='stop'){
   const data=new Set(['postgres','besu1','besu2','besu3','besu4','oidc-db']);
   for(const dataStage of [false,true]){
    const selected=records.filter(r=>data.has(r.labels['com.docker.compose.service'])===dataStage).map(r=>r.id);
    // Stop the validated full IDs, so replacement containers cannot inherit permission from a name.
    if(selected.length)execFileSync('docker',['stop','--time','15',...selected],{timeout:60000,stdio:['ignore','ignore','pipe']});
   }
  }
  if(command==='status')console.log(JSON.stringify({project,deploymentId:env.DEPLOYMENT_ID,resourceStopLatched:latched,priorResourceStopReviewed:reviewed,services:records.map(r=>({service:r.labels['com.docker.compose.service'],id:r.id,state:r.state,health:r.health})),scope:'Owned containers only; health is not complete readiness; resource monitor availability is not established by this command.'}));
 }catch(error){console.error(error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'DEPLOYMENT_CONTROL_FAILED');process.exitCode=78;}
}
