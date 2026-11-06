import {it,expect} from 'vitest';
import {mkdtemp,writeFile,chmod,symlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {bankPolicy} from '../../packages/protocol/src/index.js';
import {analyzeServiceWithOpenAI,ServiceRevisionAnalyzer} from '../../services/api/src/service-analysis.js';
import {providerCredential,speechProviderConfiguration} from '../../services/api/src/provider-configuration.js';

const text='OTP를 알려주세요. 대출 상품을 안내하겠습니다.';
const analysis={signals:[{category:'인증번호 요구',evidenceSpan:'OTP를 알려주세요.',explanation:'민감한 정보 요구'}],purpose:{relation:'suspected',evidenceSpan:'대출 상품을 안내하겠습니다.',reason:'승인 목적 밖의 권유'},recommendedAction:'https://untrusted.example',limitations:'provider-controlled advice'};
const response=(value:unknown=analysis)=>Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const input={apiKey:'unit-only-not-an-operating-key',model:'gpt-5.4-mini-2026-03-17',policy:bankPolicy,text,signal:new AbortController().signal};

it('loads an explicit owned private key file and rejects public permissions, symlinks and ambiguous sources',async()=>{
 const root=await mkdtemp(join(tmpdir(),'callsign-provider-key-')),file=join(root,'key');
 try{
  await writeFile(file,'unit-only-not-an-operating-key\n',{mode:0o600});expect(await providerCredential({OPENAI_API_KEY_FILE:file},'OPENAI_API_KEY')).toBe(input.apiKey);
  await expect(providerCredential({OPENAI_API_KEY_FILE:file,OPENAI_API_KEY:'other'},'OPENAI_API_KEY')).rejects.toThrow('SOURCE_CONFLICT');
  await chmod(file,0o644);await expect(providerCredential({OPENAI_API_KEY_FILE:file},'OPENAI_API_KEY')).rejects.toThrow('FILE_INVALID');await chmod(file,0o600);
  await symlink(file,join(root,'link'));await expect(providerCredential({OPENAI_API_KEY_FILE:join(root,'link')},'OPENAI_API_KEY')).rejects.toThrow('FILE_INVALID');
 }finally{await rm(root,{recursive:true,force:true});}
});
it('selects OpenAI explicitly without using an Anthropic key as fallback',async()=>{
 const selected=await speechProviderConfiguration({CALLSIGN_ANALYSIS_PROVIDER:'openai',OPENAI_MODEL:input.model,OPENAI_API_KEY:input.apiKey,ANTHROPIC_API_KEY:'other-provider',ANTHROPIC_MODEL:'other-model'});
 expect(selected.llm).toMatchObject({provider:'openai',model:input.model});
 expect((await speechProviderConfiguration({CALLSIGN_ANALYSIS_PROVIDER:'openai',ANTHROPIC_API_KEY:'other-provider',ANTHROPIC_MODEL:'other-model'})).llm).toBeUndefined();
 await expect(speechProviderConfiguration({CALLSIGN_ANALYSIS_PROVIDER:'fixture'})).rejects.toThrow('PROVIDER_INVALID');
});
it('uses bounded non-stored Responses JSON output and validates quoted evidence independently of the provider',async()=>{
 let calls=0;
 const fetcher:typeof fetch=async(url,init)=>{calls++;expect(url).toBe('https://api.openai.com/v1/responses');expect(new Headers(init?.headers).get('authorization')).toBe('Bearer '+input.apiKey);expect(init?.redirect).toBe('error');const body=JSON.parse(init!.body as string);expect(body).toMatchObject({model:input.model,store:false,max_output_tokens:700,reasoning:{effort:'none'},text:{format:{type:'json_schema',strict:true}}});expect(body.text.format.schema.required).toContain('purpose');expect(JSON.parse(body.input[0].content).untrustedTranscript).toBe(text);expect(body.instructions).toContain(JSON.stringify(bankPolicy));expect(body.tools).toBeUndefined();return response();};
 const result=await analyzeServiceWithOpenAI({...input,fetcher});expect(result.purpose?.relation).toBe('suspected');expect(result.signals).toHaveLength(1);expect(result.recommendedAction).not.toContain('untrusted');expect(calls).toBe(1);
 await expect(analyzeServiceWithOpenAI({...input,fetcher:async()=>response({...analysis,purpose:{...analysis.purpose,evidenceSpan:'invented quote'}})})).rejects.toThrow('LLM_EVIDENCE_INVALID');
});
it('rejects refusal, incomplete responses and provider errors instead of producing a safe result',async()=>{
 for(const value of [Response.json({status:'incomplete',output:[]}),Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'cannot assess'}]}]}),new Response('provider failure',{status:503}),new Response('x'.repeat(32769))])await expect(analyzeServiceWithOpenAI({...input,fetcher:async()=>value})).rejects.toThrow();
 const events:any[]=[];const analyzer=new ServiceRevisionAnalyzer(bankPolicy,e=>events.push(e),(_text,policy,signal)=>analyzeServiceWithOpenAI({...input,policy,signal,fetcher:async()=>new Response('',{status:429})}));
 try{analyzer.start('remote');await analyzer.accept({streamId:'remote',segmentId:'one',revision:1,final:true,text,source:'remote'});await analyzer.flush();expect(events.at(-1)).toMatchObject({status:'unavailable',purpose:{relation:'undetermined'},signals:[{category:'인증번호 요구'}]});}finally{analyzer.stop();}
});
it('does not send after pre-call cancellation and discards output from a provider ignoring cancellation',async()=>{
 let called=false;const controller=new AbortController();controller.abort();await expect(analyzeServiceWithOpenAI({...input,signal:controller.signal,fetcher:async()=>{called=true;return response();}})).rejects.toThrow('LLM_UNAVAILABLE');expect(called).toBe(false);
 const later=new AbortController();let complete!:(r:Response)=>void;const pending=analyzeServiceWithOpenAI({...input,signal:later.signal,fetcher:async()=>new Promise(r=>{complete=r;})});later.abort();complete(response());await expect(pending).rejects.toThrow('LLM_CANCELLED');
});

it('refuses an existing paid smoke result before input or credential loading',async()=>{
 const root=await mkdtemp(join(tmpdir(),'callsign-provider-result-')),output=join(root,'existing.json');
 try{await writeFile(output,'preserved');expect(()=>execFileSync(process.execPath,['--import','tsx','scripts/provider-smoke.ts','llm','/missing-input',output],{env:{PATH:process.env.PATH,CALLSIGN_ALLOW_EXTERNAL_EXECUTION:'media',CALLSIGN_PROVIDER_CONFIRMATION:'CONSENTED-SAMPLE-WITH-BUDGET',OPENAI_API_KEY_FILE:'/missing-key'},stdio:'pipe'})).toThrow(/OUTPUT_ALREADY_EXISTS/);}finally{await rm(root,{recursive:true,force:true});}
});

it('rejects a model converting negation or quoted examples into a current request without erasing a real request',async()=>{
 for(const text of ['인증번호는 말씀하지 마세요.','“인증번호를 알려주세요”라는 요구에는 응하지 마세요.'])await expect(analyzeServiceWithOpenAI({...input,text,fetcher:async()=>response({...analysis,signals:[{category:'인증번호 요구',evidenceSpan:text,explanation:'incorrect synthetic model interpretation'}],purpose:{relation:'undetermined',evidenceSpan:'',reason:'no context'}})})).rejects.toThrow('LLM_EVIDENCE_INVALID');
 const text='인증번호는 말씀하지 마세요. 지금은 OTP를 알려주세요.';const result=await analyzeServiceWithOpenAI({...input,text,fetcher:async()=>response({...analysis,signals:[{category:'인증번호 요구',evidenceSpan:'OTP를 알려주세요.',explanation:'current explicit demand'}],purpose:{relation:'undetermined',evidenceSpan:'',reason:'no context'}})});expect(result.signals).toHaveLength(1);
});

it('reports provider HTTP status without exposing its response body',async()=>{
 await expect(analyzeServiceWithOpenAI({...input,fetcher:async()=>new Response('private provider diagnostic',{status:429})})).rejects.toThrow(/^LLM_PROVIDER_HTTP_429$/);
});


it('distinguishes invalid provider envelopes from invalid analysis JSON without exposing either body',async()=>{
 await expect(analyzeServiceWithOpenAI({...input,fetcher:async()=>new Response('private invalid envelope')})).rejects.toThrow(/^LLM_RESPONSE_JSON_INVALID$/);
 await expect(analyzeServiceWithOpenAI({...input,fetcher:async()=>Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'private invalid analysis'}]}]})})).rejects.toThrow(/^LLM_ANALYSIS_JSON_INVALID$/);
});
