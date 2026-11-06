import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {evaluateServiceAnalysis,assertProviderEvaluation,assertEvaluationCostBudget,runServiceEvaluation} from '../../scripts/evaluate-service-analysis.js';
it('separates false warnings, omissions, abstentions and unexecuted cases across tuning/evaluation data',async()=>{
 const f=JSON.parse(await readFile('tests/fixtures/service-purpose-evaluation.json','utf8'));
 const report=evaluateServiceAnalysis(f,[{id:'loan-and-otp',result:{signals:[],recommendedAction:'fixed action',limitations:'fixture',purpose:{relation:'not-detected',evidenceSpan:'',reason:'fixture'}}},{id:'missing-customer',unavailable:true,result:{signals:[],recommendedAction:'fixed action',limitations:'fixture',purpose:{relation:'undetermined',evidenceSpan:'',reason:'fixture'}}}],'synthetic-replay');
 const holdout=report.groups.find(g=>g.split==='evaluation')!;expect(holdout.observed).toBe(2);expect(holdout.signalsFalseNegative).toBe(1);expect(holdout.purposeFalseNegative).toBe(1);expect(holdout.undetermined).toBe(1);expect(holdout.unavailable).toBe(1);expect(report.scope).toContain('Synthetic');expect(evaluateServiceAnalysis(f,[],'synthetic-replay').status).toBe('NOT_RUN');
});
it('blocks paid evaluation before reading a fixture or starting a provider',async()=>{expect(()=>assertProviderEvaluation({})).toThrow('PAID_PROVIDER_EXECUTION_BLOCKED');await expect(runServiceEvaluation('/missing','/not-created',true)).rejects.toThrow('PAID_PROVIDER_EXECUTION_BLOCKED');});
it('uses observed cases as the abstention denominator and rejects family leakage',async()=>{
 const f=JSON.parse(await readFile('tests/fixtures/service-purpose-evaluation.json','utf8'));
 const result={signals:[],recommendedAction:'공식 경로',limitations:'synthetic',purpose:{relation:'undetermined' as const,evidenceSpan:'',reason:'context missing'}};
 const report=evaluateServiceAnalysis(f,[{id:'missing-customer',result}],'synthetic-replay');
 expect(report.groups.find(g=>g.split==='evaluation')!.undeterminedRate).toBe(1);
 expect(report.groups.find(g=>g.split==='development')!.undeterminedRate).toBeNull();
 expect(f.cases).toHaveLength(30);expect(f.cases.every((c:{humanReview:string})=>c.humanReview==='not-reviewed')).toBe(true);
 f.cases[0].family='same-family';f.cases.find((c:{split:string})=>c.split==='evaluation').family='same-family';
 expect(()=>evaluateServiceAnalysis(f,[],'synthetic-replay')).toThrow('FAMILY_SPLIT_LEAKAGE');
});
it('rejects more than twenty provider evaluation cases before any network request',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const directory=await mkdtemp(join(tmpdir(),'callsign-evaluation-'));const previous={...process.env};
 const f=JSON.parse(await readFile('tests/fixtures/risk-analysis-v2.json','utf8'));f.cases=Array.from({length:21},(_,n)=>({...f.cases[0],id:'budget-'+n,family:'budget-'+n,split:'evaluation'}));
 try{Object.assign(process.env,{CALLSIGN_ALLOW_EXTERNAL_EXECUTION:'media',CALLSIGN_PROVIDER_CONFIRMATION:'CONSENTED-SAMPLE-WITH-BUDGET',CALLSIGN_PURPOSE_EVALUATION_CONFIRMATION:'MAX20-SYNTHETIC-TEXT-REQUESTS',CALLSIGN_EVALUATION_SOURCE_SHA256:'a'.repeat(64),CALLSIGN_EVALUATION_IMAGE:'sha256:'+'b'.repeat(64),ANTHROPIC_API_KEY:'synthetic-unit-only',ANTHROPIC_MODEL:'synthetic-unit-model'});const input=join(directory,'fixture.json');await writeFile(input,JSON.stringify(f));await expect(runServiceEvaluation(input,join(directory,'output.json'),true)).rejects.toThrow('PROVIDER_CASE_BUDGET_EXCEEDED');}
 finally{for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);await rm(directory,{recursive:true,force:true});}
});

it('requires a numeric declared cost bound and rejects over-budget plans before calls',()=>{
 expect(()=>assertEvaluationCostBudget({},2)).toThrow('NUMERIC_EVALUATION_COST_BUDGET_REQUIRED');
 expect(()=>assertEvaluationCostBudget({CALLSIGN_EVALUATION_MAX_COST_USD:'1',CALLSIGN_EVALUATION_REQUEST_BOUND_USD:'0.6'},2)).toThrow('PLANNED_COST_EXCEEDS_BUDGET');
 const budget=assertEvaluationCostBudget({CALLSIGN_EVALUATION_MAX_COST_USD:'1',CALLSIGN_EVALUATION_REQUEST_BOUND_USD:'0.1'},5);expect(budget.plannedMaximumUsd).toBe(.5);expect(budget.scope).toContain('not independently verified');
 expect(()=>assertEvaluationCostBudget({CALLSIGN_EVALUATION_MAX_COST_USD:'Infinity',CALLSIGN_EVALUATION_REQUEST_BOUND_USD:'0.1'},1)).toThrow();
 for(const count of ['NaN','21','0'])expect(()=>assertEvaluationCostBudget({CALLSIGN_EVALUATION_MAX_COST_USD:'1',CALLSIGN_EVALUATION_REQUEST_BOUND_USD:'0.1',CALLSIGN_EVALUATION_MAX_REQUESTS:count},1)).toThrow();
 expect(()=>assertEvaluationCostBudget({CALLSIGN_EVALUATION_MAX_COST_USD:'1',CALLSIGN_EVALUATION_REQUEST_BOUND_USD:'0.1',CALLSIGN_EVALUATION_MAX_REQUESTS:'6'},7)).toThrow();
});
