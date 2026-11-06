import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {z} from 'zod';

const smokeBudgetSchema=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{3,80}$/),expiresAt:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),sttSeconds:z.number().int().min(1).max(300),connections:z.number().int().min(1).max(3),llmRequests:z.number().int().min(0).max(20)}).strict();
// Quantity ceilings share a durable approval ID; they are not a provider billing guarantee.
export function analysisSmokeBudget(env:NodeJS.ProcessEnv=process.env){
 if(!env.CALLSIGN_ANALYSIS_SMOKE_BUDGET)return undefined;
 try{if(env.CALLSIGN_ANALYSIS_SMOKE_BUDGET.length>1024)throw new Error();return smokeBudgetSchema.parse(JSON.parse(env.CALLSIGN_ANALYSIS_SMOKE_BUDGET));}catch{throw new Error('ANALYSIS_SMOKE_BUDGET_INVALID');}
}

export async function providerCredential(env:NodeJS.ProcessEnv,name:string){
 const file=env[name+'_FILE'],value=env[name];
 if(file&&value)throw new Error('PROVIDER_CREDENTIAL_SOURCE_CONFLICT');
 if(!file)return value||undefined;
 try{
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
   const info=await handle.stat(),uid=process.getuid?.();
   if(uid===undefined||!info.isFile()||info.uid!==uid||(info.mode&0o077)||info.size<1||info.size>8192)throw new Error();
   const key=(await handle.readFile('utf8')).trim();
   if(!key||/\s/.test(key)||key.length>8192)throw new Error();
   return key;
  }finally{await handle.close();}
 }catch{throw new Error('PROVIDER_CREDENTIAL_FILE_INVALID');}
}
export async function speechProviderConfiguration(env:NodeJS.ProcessEnv=process.env){
 const provider=env.CALLSIGN_ANALYSIS_PROVIDER??((env.ANTHROPIC_API_KEY||env.ANTHROPIC_API_KEY_FILE)?'anthropic':'disabled');
 if(!['openai','anthropic','disabled'].includes(provider))throw new Error('ANALYSIS_PROVIDER_INVALID');
 const keyName=provider==='openai'?'OPENAI_API_KEY':'ANTHROPIC_API_KEY',model=provider==='openai'?env.OPENAI_MODEL:env.ANTHROPIC_MODEL;
 const apiKey=provider==='disabled'?undefined:await providerCredential(env,keyName);
 if(model&&(!/^[-A-Za-z0-9_.:]{1,120}$/.test(model)||/^sk-/i.test(model)||model===apiKey))throw new Error('ANALYSIS_MODEL_INVALID');
 return {stt:{apiKey:await providerCredential(env,'DEEPGRAM_API_KEY'),model:env.DEEPGRAM_MODEL},llm:apiKey&&model&&provider!=='disabled'?{provider:provider as 'openai'|'anthropic',apiKey,model}:undefined};
}
