if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure')throw new Error('BACKUP_EXECUTION_BLOCKED');
import { mkdir,readFile,writeFile,readdir,lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { encryptBackup,hashFile,backupManifestMac } from '../services/api/src/backup-crypto.js';
import { spawn } from 'node:child_process';
import { resolve,relative } from 'node:path';
import postgres from 'postgres';
import { httpConsumptionAnchor,assertAnchorMatches } from '../services/api/src/consumption-anchor.js';
const required=(name:string)=>{const v=process.env[name];if(!v)throw new Error(`MISSING_${name}`);return v;};
if(required('BACKUP_CONFIRMATION')!=='MAINTENANCE-WITH-QUIESCED-CHAIN')throw new Error('CONSISTENT_CHAIN_SNAPSHOT_REQUIRED');
const directory=resolve(required('BACKUP_DIR')),source=resolve(required('FINALS_DATA_DIR')),keyPath=resolve(required('BACKUP_ENCRYPTION_KEY_PATH')),snapshot=resolve(required('CHAIN_SNAPSHOT_ARCHIVE'));
if(!relative(directory,keyPath).startsWith('..')||!relative(source,keyPath).startsWith('..'))throw new Error('BACKUP_KEY_MUST_BE_OUTSIDE_BACKUP');
const deploymentEnv=resolve(required('BACKUP_DEPLOYMENT_ENV_PATH'));if((await lstat(deploymentEnv)).isSymbolicLink()||(await lstat(deploymentEnv)).mode&0o077)throw new Error('PROTECTED_DEPLOYMENT_ENV_REQUIRED');
const key=await readFile(keyPath);if(key.length!==32||(await lstat(keyPath)).mode&0o077)throw new Error('PROTECTED_32_BYTE_BACKUP_KEY_REQUIRED');
const safeTree=async(path:string):Promise<void>=>{const s=await lstat(path);if(s.isSymbolicLink())throw new Error('CONFIG_SYMLINK_NOT_ALLOWED');if(s.isDirectory())for(const entry of await readdir(path))await safeTree(resolve(path,entry));};
const entries=['issuer','sender','pbx','witness-keys','admin','operator','trust','asterisk','deployment.json','public-manifest.json'];for(const entry of entries)await safeTree(resolve(source,entry));
await mkdir(directory,{mode:0o700});
async function encrypt(input:NodeJS.ReadableStream,name:string){const tag=await encryptBackup(input,key,resolve(directory,name));await writeFile(resolve(directory,`${name}.tag`),tag,{flag:'wx',mode:0o600});}
async function command(command:string,args:string[],name:string,env=process.env){const child=spawn(command,args,{env,stdio:['ignore','pipe','pipe']});let detail='';child.stderr.on('data',b=>{if(detail.length<4096)detail+=String(b);});const done=new Promise<void>((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${command.toUpperCase()}_FAILED`)));});await Promise.all([encrypt(child.stdout,name),done]);}
const sql=postgres(required('MIGRATOR_DATABASE_URL'),{max:1,prepare:false,connect_timeout:3});
let checkpoint:unknown;
try{await sql.begin('isolation level repeatable read',async tx=>{
  // Share locks permit pg_dump reads but stop API/worker mutations during the exported snapshot.
  const tables=await tx`SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','issuer_v2','pbx') ORDER BY schemaname,tablename`;
  for(const t of tables)await tx`LOCK TABLE ${tx(`${t.schemaname}.${t.tablename}`)} IN SHARE MODE`;
  const id=required('INSTITUTION_ID'),rows=await tx`SELECT state FROM issuer_v2.institutions WHERE id=${id}`,state=rows[0]?.state;
  if(!state||Object.values(state.serviceV3?.attempts??{}).some((t:any)=>!['ended','declined','cancelled','failed','no-answer'].includes(t.status)))throw new Error('END_ACTIVE_CALLS_BEFORE_BACKUP');
  const manifest=JSON.parse(await readFile(resolve(source,'public-manifest.json'),'utf8')),approval=manifest.publicKeys?.[`issuer/approval-v${state.approvalKeyVersion}`];
  if(!approval||approval.kid!==state.approvalKid||approval.publicJwk?.x!==state.approvalPublicKey?.x)throw new Error('BACKUP_CONFIG_KEY_VERSION_MISMATCH');
  if((await tx`SELECT status FROM issuer_v2.recovery_gate WHERE institution_id=${id}`)[0]?.status!=='ready')throw new Error('RECOVERY_GATE_MUST_BE_VERIFIED_BEFORE_BACKUP');
  if((await tx`SELECT id FROM issuer_v2.outbox WHERE status='processing' LIMIT 1`).length)throw new Error('QUIESCE_WORKER_BEFORE_BACKUP');
  const journal=await tx`SELECT sequence,entry_hash FROM issuer_v2.consumption_journal WHERE institution_id=${id} ORDER BY sequence DESC LIMIT 1`;
  const anchor={deployment:required('DEPLOYMENT_ID'),institutionId:id,sequence:String(journal[0]?.sequence??0),hash:String(journal[0]?.entry_hash??'0'.repeat(64)),epoch:String(state.epoch)};
  assertAnchorMatches(anchor,await httpConsumptionAnchor({url:required('CONSUMPTION_ANCHOR_URL'),token:required('CONSUMPTION_ANCHOR_TOKEN'),deployment:anchor.deployment}).read(id));
  const exported=await tx`SELECT pg_export_snapshot() AS snapshot`;
  await command('pg_dump',['--format=custom',`--snapshot=${exported[0]!.snapshot}`],'database.dump.enc',{...process.env,PGDATABASE:required('MIGRATOR_DATABASE_URL')});
  await command('tar',['-C',source,'-cf','-',...entries],'configuration.tar.enc');
  checkpoint={anchor,chainCheckpoints:state.serviceV3?.checkpoints??{},warning:'Chain archive consistency requires the separately quiesced chain snapshot; filesystem copying of a live Besu database is not accepted.'};
 });
 await encrypt(createReadStream(snapshot),'chain.snapshot.enc');
 await encrypt(createReadStream(deploymentEnv),'deployment.env.enc');
 const files:Record<string,string>={};for(const name of await readdir(directory)){files[name]=await hashFile(resolve(directory,name));}
 const authenticatedManifest={format:1,createdAt:new Date().toISOString(),checkpoint,files};
 await writeFile(resolve(directory,'manifest.json'),JSON.stringify({...authenticatedManifest,authentication:backupManifestMac(authenticatedManifest,key)},null,2)+'\n',{flag:'wx',mode:0o600});
 process.stdout.write('Encrypted backup bundle created. Independent anchor is not included. No service or chain was started or stopped.\n');
}finally{await sql.end({timeout:3});}
