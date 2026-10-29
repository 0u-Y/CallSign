// Offline release metadata: reads files and Git; never queries an image registry or starts a service.
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {hashCanonical} from '../packages/protocol/src/index.js';
const required=(key:string)=>{const v=process.env[key];if(!v)throw new Error(`MISSING_${key}`);return v;};
const output=process.argv[2];if(!output)throw new Error('NEW_RELEASE_MANIFEST_PATH_REQUIRED');
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8'}).trim();
if(git('status','--porcelain'))throw new Error('COMMIT_REVIEWED_WORKTREE_BEFORE_RELEASE_MANIFEST');
const images=Object.fromEntries(['CALLSIGN_APP_IMAGE','CALLSIGN_WEB_IMAGE','ASTERISK_IMAGE','TURN_IMAGE','BESU_IMAGE','POSTGRES_IMAGE','HTTPS_IMAGE'].map(key=>{const ref=required(key);if(!/^[A-Za-z0-9._:/-]+@sha256:[0-9a-f]{64}$/.test(ref)||ref.includes('@sha256:0000000000000000000000000000000000000000000000000000000000000000'))throw new Error(`PIN_REVIEWED_DIGEST_${key}`);return [key,ref];}));
const deployment=JSON.parse(await readFile(required('DEPLOYMENT_PATH'),'utf8')),trust=JSON.parse(await readFile(required('TRUST_BUNDLE_PATH'),'utf8'));
if(String(deployment.networkId)!==trust.networkId||deployment.genesisHash!==trust.genesisHash||deployment.registryAddress.toLowerCase()!==trust.registryAddress.toLowerCase()||!/^0x[0-9a-f]{64}$/.test(deployment.registryCodeHash))throw new Error('RELEASE_TRUST_DEPLOYMENT_MISMATCH');
const evidenceBytes=await readFile(required('RELEASE_EVIDENCE_PATH')),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const evidence=JSON.parse(evidenceBytes.toString('utf8'));if(evidence.head!==git('rev-parse','HEAD')||evidence.worktreeDirty!==false)throw new Error('EVIDENCE_MUST_IDENTIFY_THIS_CLEAN_RELEASE');
await writeFile(output,JSON.stringify({version:1,createdAt:new Date().toISOString(),sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),images,trustSha256:hashCanonical(trust),deployment:{networkId:deployment.networkId,genesisHash:deployment.genesisHash,registryAddress:deployment.registryAddress,registryCodeHash:deployment.registryCodeHash,deploymentBlock:deployment.deploymentBlock},evidenceSha256:sha(evidenceBytes),evidenceScope:evidence.executionScope??'unspecified',realEnvironmentVerified:evidence.realEnvironmentVerified===true},null,2)+'\n',{flag:'wx',mode:0o600});
process.stdout.write('Release manifest written. Image provenance and actual environment results still require independent review.\n');
