import {z} from 'zod';
import {bankPolicy,riskCodeSchema,riskClassificationSchema,policyHash} from '@callsign/protocol';
import {riskSnapshot,validateRiskOutput,RISK_PROMPT_VERSION} from './risk-assessment.js';
export const riskEvaluationFixtureSchema=z.object({version:z.literal(2),provenance:z.literal('synthetic-not-human-reviewed'),cases:z.array(z.object({id:z.string().min(1),family:z.string().min(1),split:z.enum(['development','evaluation']),segments:z.array(z.string().max(4000)).min(1).max(6),expected:z.record(riskCodeSchema,riskClassificationSchema)}).strict()).max(100)}).strict();
export type RiskEvaluationObservation={id:string;output?:unknown;failed?:boolean;elapsedMs?:number;inputTokens?:number;outputTokens?:number};
export function evaluateRiskAnalysis(value:unknown,observations:RiskEvaluationObservation[],provenance:'synthetic-replay'|'actual-provider'){
 const fixture=riskEvaluationFixtureSchema.parse(value),families=new Map<string,string>();
 for(const c of fixture.cases){riskSnapshot(c.segments.map((text,i)=>({segmentId:String(i),revision:1,text})));if(families.has(c.family)&&families.get(c.family)!==c.split)throw Error('EVALUATION_FAMILY_SPLIT_LEAKAGE');families.set(c.family,c.split);}
 if(new Set(fixture.cases.map(c=>c.id)).size!==fixture.cases.length||new Set(observations.map(o=>o.id)).size!==observations.length||observations.some(o=>!fixture.cases.some(c=>c.id===o.id)))throw Error('EVALUATION_CASE_ID_MISMATCH');
 const groups=(['development','evaluation'] as const).map(split=>{
  const counts=Object.fromEntries(bankPolicy.forbiddenRequests.map(code=>[code,{truePositive:0,falsePositive:0,falseNegative:0,undetermined:0,precision:null as number|null,recall:null as number|null}]));let failed=0,notRun=0;
  const cases=fixture.cases.filter(c=>c.split===split).map(c=>{const o=observations.find(o=>o.id===c.id);if(!o){notRun++;return {id:c.id,status:'NOT_RUN'};}
   try{if(o.failed)throw Error('PROVIDER_FAILED');const rows=validateRiskOutput(o.output,riskSnapshot(c.segments.map((text,i)=>({segmentId:String(i),revision:1,text}))),bankPolicy);
    for(const r of rows){const count=counts[r.code]!;if(r.result==='undetermined')count.undetermined++;if(r.result==='detected'){if(c.expected[r.code]==='detected')count.truePositive++;else count.falsePositive++;}else if(c.expected[r.code]==='detected')count.falseNegative++;}
    return {id:c.id,status:'OBSERVED',elapsedMs:o.elapsedMs??null,inputTokens:o.inputTokens??null,outputTokens:o.outputTokens??null,evidenceSemantics:'NOT_HUMAN_REVIEWED',explanationValidity:'NOT_HUMAN_REVIEWED'};
   }catch{failed++;return {id:c.id,status:'FAILED'};}});
  for(const count of Object.values(counts)){count.precision=count.truePositive+count.falsePositive?count.truePositive/(count.truePositive+count.falsePositive):null;count.recall=count.truePositive+count.falseNegative?count.truePositive/(count.truePositive+count.falseNegative):null;}
  return {split,planned:cases.length,attempted:cases.length-notRun,failed,notRun,outputFailureRate:cases.length-notRun?failed/(cases.length-notRun):null,types:counts,cases};
 });
 return {version:2,promptVersion:RISK_PROMPT_VERSION,policyHash:policyHash(bankPolicy),provenance,fixtureProvenance:fixture.provenance,status:observations.length?(provenance==='actual-provider'?'MEASURED':'SYNTHETIC'):'NOT_RUN',groups,scope:'Text only. Classification metrics are conditional on valid outputs; failures remain in attempted denominator and are reported separately. Synthetic expectations are not independent human labels. Exact evidence references do not establish semantic correctness. No audio, overall safety or model-quality guarantee.'};
}
