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

// One durable approval scope across institutions, streams, failures and issuer restarts.
export function openAICostBudget(env:NodeJS.ProcessEnv=process.env){
 if(!env.CALLSIGN_OPENAI_COST_BUDGET)return undefined;
 try{return z.object({id:z.string().regex(/^[A-Za-z0-9_-]{3,80}$/),maxMicroUsd:z.number().int().positive().max(1000000),expiresAt:z.number().int().positive(),model:z.literal('gpt-5.4-mini-2026-03-17')}).strict().parse(JSON.parse(env.CALLSIGN_OPENAI_COST_BUDGET));}catch{throw Error('OPENAI_COST_BUDGET_INVALID');}
}
// Standard text rates verified 2026-11-06: https://developers.openai.com/api/docs/models/gpt-5.4-mini
// Reserve uncached pricing for all input; no tools, regional processing or priority tier are requested.
export function openAIMicroUsd(inputTokens:number,outputTokens:number){
 if(!Number.isSafeInteger(inputTokens)||inputTokens<0||!Number.isSafeInteger(outputTokens)||outputTokens<0)throw Error('OPENAI_USAGE_INVALID');
 return Math.ceil(inputTokens*0.75+outputTokens*4.5);
}
