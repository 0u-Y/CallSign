import {immutableImageReference,reviewDeploymentImage} from './image-reference.mjs';
// Offline release metadata: reads files and Git; never queries an image registry or starts a service.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {inspectionEnvironment} from './execution-input.js';
import {deploymentImages} from './preflight-aws.js';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {hashCanonical} from '../packages/protocol/src/index.js';
if(['--inventory','--bundle'].includes(process.argv[2]??'')){
 const bundle=process.argv[2]==='--bundle',output=process.argv[3];if(!output)throw new Error('NEW_OUTPUT_PATH_REQUIRED');
 const index=process.argv.indexOf('--env-file');if(index>=0&&!process.argv[index+1])throw new Error('ENV_FILE_PATH_REQUIRED');
 const env=await inspectionEnvironment(index>=0?process.argv[index+1]:undefined);
 const images=deploymentImages.map(key=>{const ref=env[key];if(!ref)return {key,status:'BLOCKED',reason:'IMAGE_NOT_PREPARED'};try{const info=JSON.parse(execFileSync('docker',['image','inspect',ref],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000}))[0],observed=reviewDeploymentImage('metadata',ref,info);try{return {key,status:'PASS',...reviewDeploymentImage(key,ref,info,env.VITE_SERVICE_TRUST_SHA256)};}catch(e){return {key,status:'BLOCKED',...observed,reason:e instanceof Error?e.message:'IMAGE_REVIEW_REQUIRED'};}}catch(e){return {key,status:'BLOCKED',reason:e instanceof Error&&/^[A-Z_]+$/.test(e.message)?e.message:'LOCAL_IMAGE_UNAVAILABLE_OR_INVALID'};}});
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty=!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();
 const inventory={version:1,recordedAt:new Date().toISOString(),head,worktreeDirty:dirty,images,scope:'local image metadata; no registry upload, cloud call or runtime verification',externalTransfer:'NOT_SENT',complete:images.every(i=>i.status==='PASS')};
 if(bundle){
  if(dirty)throw new Error('COMMIT_REVIEWED_SOURCES_BEFORE_TRANSFER_BUNDLE');
  await mkdir(output,{mode:0o700});const files=resolve(output,'deployment-files.tar');
  const paths=['.dockerignore','infra/deploy','infra/besu/network-config.json','scripts/deployment.sh','scripts/generate-besu.sh','scripts/image-reference.mjs','scripts/preflight-aws.ts','scripts/restricted.mjs','docs/RUNBOOK.md','docs/KNOWN-LIMITATIONS.md','artifacts/service-registry-build-20261027.json'];
  execFileSync('git',['archive','--format=tar','--output',files,head,...paths],{timeout:30000});
  await writeFile(resolve(output,'images.json'),JSON.stringify(inventory,null,2)+'\n',{flag:'wx',mode:0o600});
  const hashes=[];for(const name of ['deployment-files.tar','images.json'])hashes.push(createHash('sha256').update(await readFile(resolve(output,name))).digest('hex')+'  '+name);
  await writeFile(resolve(output,'SHA256SUMS'),hashes.join('\n')+'\n',{flag:'wx',mode:0o600});
  process.stdout.write('Public deployment files sealed. Image archives/ECR transfer and protected inputs are separate; this is not a complete service backup.\n');
 }else await writeFile(output,JSON.stringify(inventory,null,2)+'\n',{flag:'wx',mode:0o600});
 process.exit(inventory.complete?0:2);
}
const required=(key:string)=>{const v=process.env[key];if(!v)throw new Error(`MISSING_${key}`);return v;};
const output=process.argv[2];if(!output)throw new Error('NEW_RELEASE_MANIFEST_PATH_REQUIRED');
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8'}).trim();
if(git('status','--porcelain'))throw new Error('COMMIT_REVIEWED_WORKTREE_BEFORE_RELEASE_MANIFEST');
const images=Object.fromEntries(['CALLSIGN_APP_IMAGE','CALLSIGN_WEB_IMAGE','ASTERISK_IMAGE','TURN_IMAGE','BESU_IMAGE','POSTGRES_IMAGE','HTTPS_IMAGE'].map(key=>{const ref=required(key);if(!immutableImageReference(ref))throw new Error(`PIN_REVIEWED_DIGEST_${key}`);return [key,ref];}));
const deployment=JSON.parse(await readFile(required('DEPLOYMENT_PATH'),'utf8')),trust=JSON.parse(await readFile(required('TRUST_BUNDLE_PATH'),'utf8'));
if(String(deployment.networkId)!==trust.networkId||deployment.genesisHash!==trust.genesisHash||deployment.registryAddress.toLowerCase()!==trust.registryAddress.toLowerCase()||!/^0x[0-9a-f]{64}$/.test(deployment.registryCodeHash))throw new Error('RELEASE_TRUST_DEPLOYMENT_MISMATCH');
const evidenceBytes=await readFile(required('RELEASE_EVIDENCE_PATH')),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const evidence=JSON.parse(evidenceBytes.toString('utf8'));if(evidence.head!==git('rev-parse','HEAD')||evidence.worktreeDirty!==false)throw new Error('EVIDENCE_MUST_IDENTIFY_THIS_CLEAN_RELEASE');
await writeFile(output,JSON.stringify({version:1,createdAt:new Date().toISOString(),sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),images,imageIdentityKinds:Object.fromEntries(Object.entries(images).map(([k,v])=>[k,v.startsWith('sha256:')?'local-image-config-id':'registry-manifest-digest'])),trustSha256:hashCanonical(trust),deployment:{networkId:deployment.networkId,genesisHash:deployment.genesisHash,registryAddress:deployment.registryAddress,registryCodeHash:deployment.registryCodeHash,deploymentBlock:deployment.deploymentBlock},evidenceSha256:sha(evidenceBytes),evidenceScope:evidence.executionScope??'unspecified',realEnvironmentVerified:evidence.realEnvironmentVerified===true},null,2)+'\n',{flag:'wx',mode:0o600});
process.stdout.write('Release manifest written. Image provenance and actual environment results still require independent review.\n');
