import {execFileSync} from 'node:child_process';
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
  if(!['status','check','owned','latch','stop'].includes(command)||!file||compose[0]!=='docker'||compose[1]!=='compose')throw Error('DEPLOYMENT_CONTROL_ARGUMENTS_INVALID');
  const env={...parseEnv(readFileSync(file,'utf8')),...process.env},project=env.CALLSIGN_PROJECT||'callsign-finals';
  const ids=execFileSync('docker',['ps','--all','--no-trunc','--quiet','--filter','label=com.docker.compose.project='+project],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim().split(/\s+/).filter(Boolean);
  const format='{"id":{{json .Id}},"labels":{{json .Config.Labels}},"state":{{json .State.Status}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}';
  const records=ids.length?execFileSync('docker',['inspect','--format',format,...ids],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim().split('\n').map(line=>JSON.parse(line)):[];
  assertManagedDeployment(records,project,env.DEPLOYMENT_ID);
  if(!env.FINALS_DATA_DIR)throw Error('PERSISTENT_STATE_DIRECTORY_REQUIRED');
  const latch=resolve(env.FINALS_DATA_DIR,'resource-stop.json');
  if(command==='check'&&existsSync(latch))throw Error('RESOURCE_STOP_LATCHED_OPERATOR_REVIEW_REQUIRED');
  if(command==='latch'&&!existsSync(latch)){
   const parent=lstatSync(env.FINALS_DATA_DIR);
   if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==process.getuid()||(parent.mode&0o077))throw Error('OWNED_PROTECTED_STATE_DIRECTORY_REQUIRED');
   writeFileSync(latch,JSON.stringify({reason:'OPERATOR_RESOURCE_STOP',recordedAt:new Date().toISOString(),deploymentId:env.DEPLOYMENT_ID})+'\n',{flag:'wx',mode:0o600});
  }
  if(command==='stop'){
   const data=new Set(['postgres','besu1','besu2','besu3','besu4','oidc-db']);
   for(const dataStage of [false,true]){
    const selected=records.filter(r=>data.has(r.labels['com.docker.compose.service'])===dataStage).map(r=>r.id);
    // Stop the validated full IDs, so replacement containers cannot inherit permission from a name.
    if(selected.length)execFileSync('docker',['stop','--time','15',...selected],{timeout:60000,stdio:['ignore','ignore','pipe']});
   }
  }
  if(command==='status')console.log(JSON.stringify({project,deploymentId:env.DEPLOYMENT_ID,resourceStopLatched:existsSync(latch),services:records.map(r=>({service:r.labels['com.docker.compose.service'],id:r.id,state:r.state,health:r.health})),scope:'Owned containers only; health is not complete readiness; resource monitor availability is not established by this command.'}));
 }catch(error){console.error(error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'DEPLOYMENT_CONTROL_FAILED');process.exitCode=78;}
}
