import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {evaluateServiceAnalysis,assertProviderEvaluation,runServiceEvaluation} from '../../scripts/evaluate-service-analysis.js';
it('separates false warnings, omissions, abstentions and unexecuted cases across tuning/evaluation data',async()=>{
 const f=JSON.parse(await readFile('tests/fixtures/service-purpose-evaluation.json','utf8'));
 const report=evaluateServiceAnalysis(f,[{id:'loan-and-otp',result:{signals:[],recommendedAction:'fixed action',limitations:'fixture',purpose:{relation:'not-detected',evidenceSpan:'',reason:'fixture'}}},{id:'missing-customer',unavailable:true,result:{signals:[],recommendedAction:'fixed action',limitations:'fixture',purpose:{relation:'undetermined',evidenceSpan:'',reason:'fixture'}}}],'synthetic-replay');
 const holdout=report.groups.find(g=>g.split==='evaluation')!;expect(holdout.observed).toBe(2);expect(holdout.signalsFalseNegative).toBe(1);expect(holdout.purposeFalseNegative).toBe(1);expect(holdout.undetermined).toBe(1);expect(holdout.unavailable).toBe(1);expect(report.scope).toContain('Synthetic');expect(evaluateServiceAnalysis(f,[],'synthetic-replay').status).toBe('NOT_RUN');
});
it('blocks paid evaluation before reading a fixture or starting a provider',async()=>{expect(()=>assertProviderEvaluation({})).toThrow('PAID_PROVIDER_EXECUTION_BLOCKED');await expect(runServiceEvaluation('/missing','/not-created',true)).rejects.toThrow('PAID_PROVIDER_EXECUTION_BLOCKED');});
