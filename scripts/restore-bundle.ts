if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure')throw new Error('RESTORE_EXECUTION_BLOCKED');
import { mkdir,readFile,lstat,mkdtemp,rm,writeFile,appendFile } from 'node:fs/promises';
import { createReadStream,createWriteStream } from 'node:fs';
import { decryptBackup,hashFile,verifyBackupManifest,validateArchiveListing,backupInventory,regularBackupFile } from '../services/api/src/backup-crypto.js';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import postgres from 'postgres';
const required=(name:string)=>{const v=process.env[name];if(!v)throw new Error(`MISSING_${name}`);return v;};
if(required('RESTORE_CONFIRMATION')!=='NEW-EMPTY-DATABASE-AND-DIRECTORY')throw new Error('NEW_RESTORE_TARGET_REQUIRED');
const backup=resolve(required('RESTORE_BUNDLE')),target=resolve(required('RESTORE_DATA_DIR')),keyPath=resolve(required('BACKUP_ENCRYPTION_KEY_PATH'));await regularBackupFile(keyPath,32);const key=await readFile(keyPath);
if(key.length!==32||(await lstat(keyPath)).mode&0o077)throw new Error('PROTECTED_BACKUP_KEY_REQUIRED');
const bundleInfo=await lstat(backup);if(!bundleInfo.isDirectory()||bundleInfo.isSymbolicLink())throw new Error('BACKUP_DIRECTORY_INVALID');
await regularBackupFile(resolve(backup,'manifest.json'),1048576);
const manifest=backupInventory(verifyBackupManifest(JSON.parse(await readFile(resolve(backup,'manifest.json'),'utf8')),key));
for(const [name,expected] of Object.entries(manifest.files)){const info=await regularBackupFile(resolve(backup,name));if(info.size!==manifest.sizes[name])throw new Error('BACKUP_SIZE_MISMATCH');if(await hashFile(resolve(backup,name))!==expected)throw new Error('BACKUP_CHECKSUM_MISMATCH');}
const restoreUrl=new URL(required('RESTORE_DATABASE_URL'));if(restoreUrl.searchParams.has('password'))throw new Error('PASSWORD_QUERY_NOT_SUPPORTED');const restorePassword=decodeURIComponent(restoreUrl.password);restoreUrl.password='';
const sql=postgres(required('RESTORE_DATABASE_URL'),{max:1,prepare:false,connect_timeout:3}),temporary=await mkdtemp(resolve(tmpdir(),'callsign-restore-'));
async function decrypt(name:string){const output=resolve(temporary,name.replace('.enc',''));await decryptBackup(resolve(backup,name),key,await readFile(resolve(backup,`${name}.tag`)),output);return output;}
async function command(name:string,args:string[],env=process.env){const child=spawn(name,args,{env,stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',()=>{});child.stdout.on('data',b=>{output+=String(b);if(output.length>262144)child.kill();});return new Promise<string>((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error(`${name.toUpperCase()}_FAILED`)));});}
try{
 if((await sql`SELECT tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') LIMIT 1`).length)throw new Error('RESTORE_DATABASE_NOT_EMPTY');
 await mkdir(target,{mode:0o700});
 const dump=await decrypt('database.dump.enc'),configuration=await decrypt('configuration.tar.enc'),deploymentEnv=await decrypt('deployment.env.enc'),chain=manifest.scope==='full'?await decrypt('chain.snapshot.enc'):undefined;
 const names=await command('tar',['-tf',configuration]),types=await command('tar',['-tvf',configuration],{...process.env,LC_ALL:'C'});validateArchiveListing(names,types);
 const restoreSql=resolve(temporary,'restore.sql');await command('pg_restore',['--exit-on-error','--file',restoreSql,dump]);
 await appendFile(restoreSql,`\nDO $$ BEGIN IF (SELECT jsonb_object_agg(id,source_hash) FROM public.callsign_migrations) IS DISTINCT FROM '${JSON.stringify(manifest.migrations)}'::jsonb THEN RAISE EXCEPTION 'RESTORE_MIGRATION_IDENTITY_MISMATCH'; END IF; END $$;\nUPDATE issuer_v2.recovery_gate SET status='blocked';\nDELETE FROM public.sessions;\nTRUNCATE pbx.ps_contacts,pbx.ps_endpoints,pbx.ps_auths,pbx.ps_aors,pbx.endpoint_leases;\nUPDATE issuer_v2.institutions i SET state=jsonb_set(state,'{serviceV3}',(state->'serviceV3') || jsonb_build_object('recovery','blocked','requests','{}'::jsonb,'challenges','{}'::jsonb,'authorizations',(SELECT COALESCE(jsonb_object_agg(key,value || '{"cancelled":true}'::jsonb),'{}'::jsonb) FROM jsonb_each(state->'serviceV3'->'authorizations')),'attempts',(SELECT COALESCE(jsonb_object_agg(key,(value - 'lease' - 'renewal' - 'ownerSessions' - 'mediaReady' - 'pbx')),'{}'::jsonb) FROM jsonb_each(state->'serviceV3'->'attempts')))) WHERE state ? 'serviceV3';\nUPDATE issuer_v2.outbox SET status='pending',claim_token=NULL,lease_until=NULL,retry_at=now() WHERE status='processing';\n`);
 // The restored ready gate and sessions are never visible in a committed target database.
 await command('psql',['-X','--set','ON_ERROR_STOP=1','--single-transaction','--dbname',restoreUrl.href,'--file',restoreSql],{...process.env,PGPASSWORD:restorePassword});
 await command('tar',['-xf',configuration,'-C',target,'--no-same-owner','--no-same-permissions','--keep-old-files']);
 await pipeline(createReadStream(deploymentEnv),createWriteStream(resolve(target,'deployment.env.restored'),{flags:'wx',mode:0o600}));
 if(chain){await pipeline(createReadStream(chain),createWriteStream(resolve(target,'chain.snapshot'),{flags:'wx',mode:0o600}));}
 await writeFile(resolve(target,'restore-checkpoint.json'),JSON.stringify(manifest.checkpoint,null,2)+'\n',{flag:'wx',mode:0o600});
 process.stdout.write(`Restored ${manifest.scope} bundle into new targets with recovery gates closed. ${manifest.scope==='full'?'Restore the quiesced chain snapshot separately.':'No chain snapshot is included or verified.'} Review deployment.env.restored, verify current authority and independent anchor, then authorize startup. No services were started.\n`);
}finally{await sql.end({timeout:3});await rm(temporary,{recursive:true,force:true});}
