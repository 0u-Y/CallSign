import {expect,it} from 'vitest';
import {evaluatePerformance,type TimingSample} from '../../scripts/evaluate-performance.js';
const sample=(durationMs:number):TimingSample=>({metric:'verification',durationMs,outcome:'success',clock:'observer-monotonic',scope:'network-and-witness-inclusive'});
const input=(samples:TimingSample[])=>({provenance:'actual-observation' as const,environmentId:'test:synthetic-unit-only',runId:'unit',samples});
it('uses nearest-rank p95, reports failures, and cannot declare a target from too few samples',()=>{
 expect(evaluatePerformance(input([sample(1)])).metrics[0]!.status).toBe('BLOCKED');
 const rows=Array.from({length:100},(_,i)=>sample(i+1));const report=evaluatePerformance(input(rows));expect(report.metrics[0]!.p95).toBe(95);expect(report.metrics[0]!.p99).toBe(99);expect(report.metrics[0]!.status).toBe('PASS');expect(report.status).toBe('BLOCKED');
 expect(evaluatePerformance(input([...rows,{...sample(100),outcome:'failure'}])).metrics[0]!.status).toBe('FAIL');expect(evaluatePerformance(input(rows.map(()=>sample(501)))).metrics[0]!.status).toBe('FAIL');
});
it('rejects mixed wall clocks, excluded witness scope, invented provenance and nonfinite values',()=>{
 for(const row of [{...sample(1),clock:'server-wall-minus-browser-wall'}, {...sample(1),scope:'local-signature-only'},sample(Infinity)])expect(()=>evaluatePerformance(input([row as TimingSample]))).toThrow('MEASUREMENT_SCOPE');
 expect(()=>evaluatePerformance({...input([sample(1)]),provenance:'fixture' as 'actual-observation'})).toThrow('ACTUAL_BOUNDED');
});

it('does not mistake confirmation-observed proxy timing for the full revocation target without a boundary uncertainty source',()=>{
 const rows:TimingSample[]=Array.from({length:100},()=>({metric:'revocation',durationMs:4999,outcome:'success',clock:'observer-monotonic',scope:'confirmation-observed-to-client-ack'}));
 const unbounded=evaluatePerformance(input(rows)).metrics.find(m=>m.metric==='revocation')!;expect(unbounded.status).toBe('BLOCKED');
 const bounded=evaluatePerformance(input(rows.map(v=>({...v,boundaryUncertaintyMs:2,boundaryEvidenceSha256:'a'.repeat(64)})))).metrics.find(m=>m.metric==='revocation')!;expect(bounded.p95).toBe(5001);expect(bounded.status).toBe('FAIL');
});
