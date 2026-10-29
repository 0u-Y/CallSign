
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {besuPeerConfiguration} from './besu-peers.js';
const directory=process.argv.slice(2).find(v=>!v.startsWith('--'));if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'dry-run',directory:directory??null,inputs:['four existing public key.pub files'],outputs:['static-nodes.json','permissions_config.toml'],next:'--apply requires infrastructure authorization; existing differing config is never overwritten.'}));process.exit(0);}
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure')throw new Error('PEER_CONFIGURATION_EXECUTION_BLOCKED');if(!directory)throw new Error('PREPARED_BESU_DIRECTORY_REQUIRED');
const keys=await Promise.all([1,2,3,4].map(n=>readFile(resolve(directory,`keys/node${n}/key.pub`),'utf8')));
const config=besuPeerConfiguration(keys);
for(const [file,content] of [['static-nodes.json',config.staticNodes],['permissions_config.toml',config.permissions]]){
 const path=resolve(directory,file!);let prior:string|undefined;try{prior=await readFile(path,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 if(prior!==undefined){if(prior!==content)throw new Error('EXISTING_PEER_CONFIGURATION_REQUIRES_REVIEW');}else await writeFile(path,content!,{flag:'wx',mode:0o600});
}
process.stdout.write('Prepared fixed peers and local node allowlist. No services started.\n');
