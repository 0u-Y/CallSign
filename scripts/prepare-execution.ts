// Produces an ordered plan only. No service, secret generation, migration or network client is imported.
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectionEnvironment,preparationSteps} from './execution-input.js';
import {preflight} from './preflight.js';
export async function preparationPlan(env:Record<string,string|undefined>){
 if(env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION)throw new Error('PREPARATION_IS_DRY_RUN_ONLY');
 const checks=await preflight(env);
 return {version:1,mode:'dry-run',externalExecution:false,steps:preparationSteps,checks,partialFailurePolicy:'Keep the produced files and journals. Verify identity/content before resuming; never regenerate keys, reset an anchor or repeat an uncertain transaction with a new nonce.',next:'Resolve configured C inputs privately. D outputs belong to the later explicitly authorized step; no secret values are emitted.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2);if(args.some((a,i)=>a.startsWith('--')&&!['--env-file','--output','--dry-run'].includes(a)))throw new Error('PREPARATION_ARGUMENT_INVALID');const value=(key:string)=>{const n=args.indexOf(key);if(n<0)return undefined;if(!args[n+1]||args[n+1]!.startsWith('--'))throw new Error('PREPARATION_ARGUMENT_VALUE_REQUIRED');return args[n+1];};const plan=await preparationPlan(await inspectionEnvironment(value('--env-file'))),output=value('--output');if(output)await writeFile(output,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});else process.stdout.write(JSON.stringify(plan,null,2)+'\n');}
