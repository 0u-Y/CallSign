
import {isIP} from 'node:net';
import { mkdir,readFile,readdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const apply=process.argv.includes('--apply');const destination=process.argv.slice(2).find(a=>!a.startsWith('--'));if(!destination)throw new Error('NEW_ASTERISK_CONFIG_DIRECTORY_REQUIRED');
if(!apply){process.stdout.write(JSON.stringify({mode:'dry-run',destination,templates:'infra/deploy/asterisk/*.example',required:['WEB_ORIGIN','PBX_PUBLIC_HOST','PBX_PUBLIC_ADDRESS','PBX_PRIVATE_ADDRESS','ARI_PASSWORD','PBX_DB_USER','PBX_DB_PASSWORD'],next:'Review inputs; --apply requires infrastructure authorization. Never regenerate existing config.'})+'\n');process.exit(0);}
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure')throw new Error('PBX_PROVISIONING_EXECUTION_BLOCKED');
const values:Record<string,string>={};for(const key of ['WEB_ORIGIN','PBX_PUBLIC_HOST','PBX_PUBLIC_ADDRESS','PBX_PRIVATE_ADDRESS','ARI_PASSWORD','PBX_DB_USER','PBX_DB_PASSWORD']){const value=process.env[key];if(!value||/[\r\n;#@]/.test(value))throw new Error(`INVALID_${key}`);values[key]=value;}
if(isIP(values.PBX_PRIVATE_ADDRESS!)!==4||isIP(values.PBX_PUBLIC_ADDRESS!)!==4)throw new Error('EXPLICIT_IPV4_MEDIA_MAPPING_REQUIRED');
await mkdir(resolve(destination),{mode:0o700});const completed:string[]=[];await writeFile(resolve(destination,'preparation-state.json'),JSON.stringify({status:'in-progress',completed})+'\n',{flag:'wx',mode:0o600});
for(const file of await readdir(new URL('../infra/deploy/asterisk/',import.meta.url))){if(!file.endsWith('.example'))continue;const source=await readFile(new URL(`../infra/deploy/asterisk/${file}`,import.meta.url),'utf8');const result=source.replace(/@([A-Z_]+)@/g,(_,key:string)=>{if(!values[key])throw new Error(`MISSING_${key}`);return values[key];});await writeFile(resolve(destination,file.replace('.example','')),result,{flag:'wx',mode:0o600});completed.push(file.replace('.example',''));await writeFile(resolve(destination,'preparation-state.json'),JSON.stringify({status:'in-progress',completed,recovery:'Preserve partial output; compare templates and inputs before any manual recovery. Existing directory is not reusable.'})+'\n',{mode:0o600});}
await writeFile(resolve(destination,'preparation-state.json'),JSON.stringify({status:'complete',completed})+'\n',{mode:0o600});
process.stdout.write('Prepared config only. Install reviewed Asterisk 22 with res_pjsip/res_http_websocket/res_ari/res_odbc/res_config_odbc and PostgreSQL Unicode ODBC driver; provision TLS separately.\n');
