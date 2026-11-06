import {expect,it} from 'vitest';
import {evaluateRiskAnalysis} from '../../services/api/src/risk-evaluation.js';
import {bankPolicy} from '../../packages/protocol/src/index.js';
const fixture={version:2,provenance:'synthetic-not-human-reviewed',cases:[{id:'a',family:'a',split:'development',segments:['인증번호를 알려주세요.'],expected:{OTP:'detected',TRANSFER:'not-detected',REMOTE_CONTROL:'not-detected',SECRECY:'not-detected'}},{id:'b',family:'b',split:'evaluation',segments:['안녕하세요.'],expected:{OTP:'not-detected',TRANSFER:'not-detected',REMOTE_CONTROL:'not-detected',SECRECY:'not-detected'}}]};
it('keeps missing and failed responses in the denominator without invented metrics or human labels',()=>{
 const report=evaluateRiskAnalysis(fixture,[{id:'b',failed:true}],'synthetic-replay');expect(report.groups[0]).toMatchObject({notRun:1,attempted:0});expect(report.groups[1]).toMatchObject({attempted:1,failed:1,outputFailureRate:1});expect(report.groups[1]!.types.OTP!.precision).toBeNull();
 expect(()=>evaluateRiskAnalysis({...fixture,cases:fixture.cases.map(c=>({...c,family:'same'}))},[],'actual-provider')).toThrow('SPLIT_LEAKAGE');
});
it('reports abstention separately and does not call exact references semantic proof',()=>{
 const output={assessments:bankPolicy.forbiddenRequests.map(code=>({code,result:'undetermined',evidenceIds:[],explanation:'합성 시험에서 문맥 판단을 보류했습니다.'}))};const report=evaluateRiskAnalysis(fixture,[{id:'a',output}],'synthetic-replay');expect(report.groups[0]!.types.OTP).toMatchObject({falseNegative:1,undetermined:1,recall:0});expect(report.groups[0]!.cases[0]).toMatchObject({evidenceSemantics:'NOT_HUMAN_REVIEWED',explanationValidity:'NOT_HUMAN_REVIEWED'});
});
