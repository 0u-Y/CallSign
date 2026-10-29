// Only explicitly selected offline checks can execute. There is no heavy-command escape hatch.
import { execFileSync,spawn } from 'node:child_process';
import { readFile,writeFile,lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve,relative } from 'node:path';
import { pathToFileURL } from 'node:url';
export const offlineChecks={light:['pnpm',['light']],web:['pnpm',['--filter','@callsign/web','build']],runtime:['pnpm',['exec','tsc','-p','services/api/tsconfig.runtime.json','--noEmit']],preflight:['node',['--import','tsx','scripts/preflight.ts']],rules:['node',['--import','tsx','scripts/evaluate-risk.ts']]} as const;
export function privateEvidencePath(path:string){return path!=='.env.example'&&(/(^|\/)(keys?|secrets?|node_modules|\.git)(\/|$)|(^|\/)\.env($|\.)|\.(pem|key|p12|pfx)$/.test(path));}
export function redactOutput(value:string,secrets:string[]=[]){let result=value;for(const secret of secrets.filter(v=>v.length>=8))result=result.split(secret).join('[REDACTED]');return result.replace(/(?:postgres(?:ql)?:\/\/)[^\s"']+/gi,'[DATABASE_URL]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[JWT]').replace(/-----BEGIN[\s\S]*?-----END[^\n]*-----/g,'[PRIVATE_MATERIAL]').replace(/(?:Bearer|Basic)\s+[A-Za-z0-9+/=_-]+/gi,'[AUTHORIZATION]').replace(/\b0x[0-9a-fA-F]{64}\b/g,'[HEX_SECRET_OR_DIGEST]').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,'[EMAIL]').replace(/\b(?:\+82[- ]?|0)1[016789][- ]?\d{3,4}[- ]?\d{4}\b/g,'[PHONE]');}
const sha=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
async function run(name:keyof typeof offlineChecks){const [command,args]=offlineChecks[name];return new Promise<{status:'PASS'|'FAIL'|'BLOCKED';exitCode:number|null;durationMs:number;output:string}>(resolveRun=>{
 const start=performance.now(),child=spawn(command,[...args],{stdio:['ignore','pipe','pipe'],env:process.env});let captured='',overflow=false;
 const timer=setTimeout(()=>{child.kill('SIGTERM');},120000);const capture=(data:Buffer)=>{if(captured.length+data.length>65536){overflow=true;captured=(captured+String(data)).slice(0,65536);}else captured+=String(data);};child.stdout.on('data',capture);child.stderr.on('data',capture);
 const secretValues=Object.entries(process.env).filter(([k])=>/SECRET|PASSWORD|TOKEN|API_KEY|DATABASE_URL/.test(k)).map(([,v])=>v??'');
 child.on('error',()=>{clearTimeout(timer);resolveRun({status:'BLOCKED',exitCode:null,durationMs:performance.now()-start,output:'OFFLINE_TOOL_UNAVAILABLE'});});
 child.on('close',code=>{clearTimeout(timer);resolveRun({status:code===0?'PASS':name==='preflight'&&code===2?'BLOCKED':'FAIL',exitCode:code,durationMs:performance.now()-start,output:redactOutput(captured,secretValues)+(overflow?'\n[OUTPUT_TRUNCATED]':'')});});
 });}
export async function collectEvidence(input:{output:string;checks:Array<keyof typeof offlineChecks>;dryRun:boolean}){
 if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION)throw new Error('EXTERNAL_EXECUTION_MUST_REMAIN_BLOCKED');
 if(input.checks.some(n=>!Object.hasOwn(offlineChecks,n)))throw new Error('ONLY_NAMED_OFFLINE_CHECKS_ALLOWED');
 const root=process.cwd(),output=resolve(input.output);if(!relative(resolve(root,'artifacts'),output)||relative(resolve(root,'artifacts'),output).startsWith('..'))throw new Error('NEW_ARTIFACT_PATH_REQUIRED');
 const git=(args:string[])=>execFileSync('git',args,{encoding:'utf8',maxBuffer:8*1024*1024});
 const paths=git(['ls-files','-z','--cached','--others','--exclude-standard']).split('\0').filter(Boolean),files:Record<string,string>={};
 for(const path of paths){if(privateEvidencePath(path))continue;const info=await lstat(path);if(info.isSymbolicLink()||!info.isFile()||info.size>2*1024*1024||path===relative(root,output))continue;files[path]=sha(await readFile(path));}
 const results=[];for(const name of [...new Set(input.checks)])results.push({name,command:[offlineChecks[name][0],...offlineChecks[name][1]],...(input.dryRun?{status:'SKIPPED',reason:'DRY_RUN_NO_CHECK_EXECUTED'}:await run(name))});
 const record={version:1,recordedAt:new Date().toISOString(),head:git(['rev-parse','HEAD']).trim(),branch:git(['branch','--show-current']).trim(),worktreeDirty:!!git(['status','--porcelain']).trim(),executionScope:'offline-source-only',realEnvironmentVerified:false,dryRun:input.dryRun,files,results,deferred:['PostgreSQL','Besu/contracts/Witness','PBX/TURN/browser/media','OIDC','STT/LLM','independent-anchor/backup/restore','GCP'].map(name=>({name,status:'BLOCKED',reason:'EXPLICIT_EXECUTION_PERMISSION_AND_ENVIRONMENT_REQUIRED'})),retention:'Review redaction before sharing; retain source hashes and results, minimize raw logs under deployment retention policy.'};
 await writeFile(output,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});return record;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const [output,...args]=process.argv.slice(2);if(!output)throw new Error('Usage: collect-evidence artifacts/NEW.json [--dry-run] [light web runtime preflight rules]');const dryRun=args.includes('--dry-run'),checks=args.filter(v=>v!=='--dry-run') as Array<keyof typeof offlineChecks>;const r=await collectEvidence({output,dryRun,checks:checks.length?checks:['light','web','runtime','preflight','rules']});process.stdout.write(JSON.stringify({output,worktreeDirty:r.worktreeDirty,results:r.results.map(v=>({name:v.name,status:v.status}))})+'\n');if(r.results.some(v=>v.status==='FAIL'))process.exitCode=1;}
