if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure')throw new Error('RESTORE_EXECUTION_BLOCKED');
import { mkdir,readFile,lstat,mkdtemp,rm,writeFile } from 'node:fs/promises';
import { createReadStream,createWriteStream } from 'node:fs';
import { decryptBackup,hashFile,verifyBackupManifest,validateArchiveListing } from '../services/api/src/backup-crypto.js';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import postgres from 'postgres';
const required=(name:string)=>{const v=process.env[name];if(!v)throw new Error(`MISSING_${name}`);return v;};
if(required('RESTORE_CONFIRMATION')!=='NEW-EMPTY-DATABASE-AND-DIRECTORY')throw new Error('NEW_RESTORE_TARGET_REQUIRED');
const backup=resolve(required('RESTORE_BUNDLE')),target=resolve(required('RESTORE_DATA_DIR')),keyPath=resolve(required('BACKUP_ENCRYPTION_KEY_PATH')),key=await readFile(keyPath);
if(key.length!==32||(await lstat(keyPath)).mode&0o077)throw new Error('PROTECTED_BACKUP_KEY_REQUIRED');
const manifest=verifyBackupManifest(JSON.parse(await readFile(resolve(backup,'manifest.json'),'utf8')),key) as {format:number;files:Record<string,string>;checkpoint:unknown};if(manifest.format!==1)throw new Error('BACKUP_FORMAT_UNSUPPORTED');
for(const [name,expected] of Object.entries(manifest.files)){if(!/^[a-z.]+(?:\.enc|\.tag)$/.test(name))throw new Error('BACKUP_PATH_INVALID');if(await hashFile(resolve(backup,name))!==expected)throw new Error('BACKUP_CHECKSUM_MISMATCH');}
const restoreUrl=new URL(required('RESTORE_DATABASE_URL'));if(restoreUrl.searchParams.has('password'))throw new Error('PASSWORD_QUERY_NOT_SUPPORTED');const restorePassword=decodeURIComponent(restoreUrl.password);restoreUrl.password='';
const sql=postgres(required('RESTORE_DATABASE_URL'),{max:1,prepare:false,connect_timeout:3}),temporary=await mkdtemp(resolve(tmpdir(),'callsign-restore-'));
async function decrypt(name:string){const output=resolve(temporary,name.replace('.enc',''));await decryptBackup(resolve(backup,name),key,await readFile(resolve(backup,`${name}.tag`)),output);return output;}
async function command(name:string,args:string[],env=process.env){const child=spawn(name,args,{env,stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',()=>{});child.stdout.on('data',b=>{output+=String(b);if(output.length>262144)child.kill();});return new Promise<string>((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error(`${name.toUpperCase()}_FAILED`)));});}
try{
 if((await sql`SELECT tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') LIMIT 1`).length)throw new Error('RESTORE_DATABASE_NOT_EMPTY');
 await mkdir(target,{mode:0o700});
 const dump=await decrypt('database.dump.enc'),configuration=await decrypt('configuration.tar.enc');
 const names=await command('tar',['-tf',configuration]),types=await command('tar',['-tvf',configuration],{...process.env,LC_ALL:'C'});validateArchiveListing(names,types);
 await command('pg_restore',['--exit-on-error','--single-transaction','--dbname',restoreUrl.href,dump],{...process.env,PGPASSWORD:restorePassword});
 // No restored service can issue new authorizations until it checks the independent live anchor on startup.
 await sql`UPDATE issuer_v2.recovery_gate SET status='blocked'`;
 await sql`DELETE FROM public.sessions`; // A database backup must never restore a logged-out browser session.
 await command('tar',['-xf',configuration,'-C',target,'--no-same-owner','--no-same-permissions','--keep-old-files']);
 const deploymentEnv=await decrypt('deployment.env.enc');await pipeline(createReadStream(deploymentEnv),createWriteStream(resolve(target,'deployment.env.restored'),{flags:'wx',mode:0o600}));
 const chain=await decrypt('chain.snapshot.enc');await pipeline(createReadStream(chain),createWriteStream(resolve(target,'chain.snapshot'),{flags:'wx',mode:0o600}));
 await writeFile(resolve(target,'restore-checkpoint.json'),JSON.stringify(manifest.checkpoint,null,2)+'\n',{flag:'wx',mode:0o600});
 process.stdout.write('Restored into new targets with recovery gates closed. Restore the quiesced chain snapshot separately, review deployment.env.restored for the new host, verify current chain and independent anchor, then authorize startup. No services were started.\n');
}finally{await sql.end({timeout:3});await rm(temporary,{recursive:true,force:true});}
