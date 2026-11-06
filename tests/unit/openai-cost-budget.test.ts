import {expect,it,vi} from 'vitest';
import {bankPolicy} from '../../packages/protocol/src/index.js';
import {requestOpenAI} from '../../services/api/src/openai-analysis.js';
import {openAICostBudget,openAIMicroUsd} from '../../services/api/src/provider-configuration.js';
const input={apiKey:'synthetic',model:'gpt-5.4-mini-2026-03-17',text:'합성 시험',policy:bankPolicy,signal:new AbortController().signal};
it('reserves before fetch and refuses an over-budget request without a provider call',async()=>{
 const fetcher=vi.fn();await expect(requestOpenAI({...input,fetcher,billing:{reserve:async()=>{throw Error('QUOTA_EXHAUSTED');}}},'test')).rejects.toThrow('QUOTA_EXHAUSTED');expect(fetcher).not.toHaveBeenCalled();
});
it('settles valid usage even for an incomplete response but leaves lost usage reserved',async()=>{
 for(const kind of ['complete','incomplete','timeout','no-usage']){
  const settled=vi.fn(async()=>{});let reserved=0;
  const work=requestOpenAI({...input,billing:{reserve:async(i,o)=>{expect(i).toBeGreaterThan(input.text.length);expect(o).toBe(700);reserved=openAIMicroUsd(i,o);return settled;}},fetcher:async()=>{expect(reserved).toBeGreaterThan(0);if(kind==='timeout')throw Error('TIMEOUT');return Response.json({status:kind==='incomplete'?'incomplete':'completed',...(kind==='no-usage'?{}:{usage:{input_tokens:100,output_tokens:50}}),output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{}'}]}]});}},'test');
  if(kind==='incomplete'||kind==='timeout')await expect(work).rejects.toThrow();else await expect(work).resolves.toBe('{}');
  expect(settled).toHaveBeenCalledTimes(kind==='complete'||kind==='incomplete'?1:0);
 }
});
it('validates the fixed approval scope and standard rate without resetting it per stream',()=>{
 const config={id:'public-risk-20261106-usd1',maxMicroUsd:1000000,expiresAt:1800000000,model:input.model};expect(openAICostBudget({CALLSIGN_OPENAI_COST_BUDGET:JSON.stringify(config)})).toEqual(config);
 expect(openAIMicroUsd(1000,700)).toBe(3900);expect(()=>openAICostBudget({CALLSIGN_OPENAI_COST_BUDGET:JSON.stringify({...config,maxMicroUsd:1000001})})).toThrow();expect(()=>openAIMicroUsd(-1,4)).toThrow();
});
