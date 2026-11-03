import {expect,it} from 'vitest';
import {aggregateCallTrials,type CallTry} from '../../scripts/evaluate-performance.js';
import {assertCallTrialExecution,callTrials} from '../../scripts/call-trials.js';
const plan={environmentId:'test:offline-fixture',environment:'local',transport:'turn',sourceSha256:'a'.repeat(64),images:['sha256:'+'b'.repeat(64)],fixtures:['synthetic-audio'],normalAttempts:5,maxRetries:1,perTryTimeoutMs:1000,totalTimeoutMs:10000};
const trial=(outcome:CallTry['outcome'],success=false):CallTry=>({observer:'observer',outcome,finishedMs:900,events:success?[{id:'a',observer:'observer',phase:'verification-visible',atMs:200},{id:'b',observer:'observer',phase:'remote-decoded-both',atMs:300},{id:'cleanup',observer:'observer',phase:'resources-reclaimed',atMs:800}]:[]});
it('keeps failure, timeout and unfinished logical attempts in the denominator while counting retries separately',()=>{
 const r=aggregateCallTrials(plan,[{id:'one',tries:[trial('success',true)]},{id:'two',tries:[trial('failure'),trial('success',true)]},{id:'three',tries:[trial('failure')]},{id:'four',tries:[trial('timeout')]}],'synthetic');
 expect(r.summary).toMatchObject({denominator:5,totalTries:5,firstSuccess:1,retrySuccess:1,failure:1,timeout:1,incomplete:1,authorityAndRemoteAudioRate:.4,authorityVerifiedRate:.4});expect(r.status).toBe('SYNTHETIC');expect(r.attempts).toHaveLength(5);
});
it('deduplicates exact events, sorts reverse delivery and measures only a single observer clock',()=>{
 const t=trial('success',true);t.events.push({...t.events[0]!},{id:'start',observer:'observer',phase:'authorization-request',atMs:100},{id:'u',observer:'observer',phase:'unavailable-start',atMs:400,cause:'witness-stale',interval:'one'});t.events.reverse();
 const result=aggregateCallTrials({...plan,normalAttempts:1},[{id:'one',tries:[t]}],'synthetic').attempts[0]!.tries[0]!;expect(result.latencyMs.authorizationToVerification).toBe(100);expect(result.unavailable).toEqual([{cause:'witness-stale',durationMs:500}]);
 t.events.push({id:'cross',observer:'another-process',phase:'server-applied',atMs:500});expect(()=>aggregateCallTrials(plan,[{id:'one',tries:[t]}],'synthetic')).toThrow('CROSS_CLOCK');
});
it('rejects conflicting event IDs, late success and missing decoded media rather than trusting process exit',()=>{
 const t=trial('success',true);t.finishedMs=1100;expect(aggregateCallTrials(plan,[{id:'one',tries:[t]}],'synthetic').summary.timeout).toBe(1);
 const fake=trial('success');expect(aggregateCallTrials(plan,[{id:'one',tries:[fake]}],'synthetic').summary.failure).toBe(1);
 t.events.push({...t.events[0]!,atMs:201});expect(()=>aggregateCallTrials(plan,[{id:'one',tries:[t]}],'synthetic')).toThrow('CONFLICTING_EVENT');
});
it('leaves unexecuted plans NOT_RUN and blocks the runner before reading files or starting commands',async()=>{
 expect(aggregateCallTrials(plan,[],'actual-observation').status).toBe('NOT_RUN');expect(()=>assertCallTrialExecution({})).toThrow('CALL_TRIAL_EXECUTION_BLOCKED');await expect(callTrials('/missing-plan','/must-not-be-created',true)).rejects.toThrow('CALL_TRIAL_EXECUTION_BLOCKED');
});
it('does not count a repeated unavailable-start event twice and includes unfinished outages',()=>{
 const t=trial('failure');t.events=[{id:'one',observer:'observer',phase:'unavailable-start',atMs:100,interval:'outage',cause:'network'},{id:'duplicate-start',observer:'observer',phase:'unavailable-start',atMs:150,interval:'outage',cause:'network'}];const report=aggregateCallTrials(plan,[{id:'one',tries:[t]}],'synthetic');expect(report.summary.unavailableAttempts).toBe(1);expect(report.attempts[0]?.tries[0]?.unavailable).toEqual([{cause:'network',durationMs:800}]);
});
it('rejects incomplete test identity and credential-bearing or placeholder image metadata before it can enter a performance report',()=>{for(const invalid of [{...plan,environmentId:'test:'},{...plan,images:['https://user:password@host/image@sha256:'+'a'.repeat(64)]},{...plan,images:['sha256:'+'0'.repeat(64)]}])expect(()=>aggregateCallTrials(invalid,[],'synthetic')).toThrow();});
it('reports verified remote audio independently when cleanup fails, without counting the whole trial as successful',()=>{const t=trial('success',true);t.events=t.events.filter(e=>e.phase!=='resources-reclaimed');const report=aggregateCallTrials({...plan,normalAttempts:1},[{id:'one',tries:[t]}],'synthetic');expect(report.summary.firstSuccess).toBe(0);expect(report.summary.failure).toBe(1);expect(report.summary.authorityAndRemoteAudioRate).toBe(1);});

it('requires real analysis-path observations when the plan explicitly selects the synthetic provider',()=>{const t=trial('success',true),p={...plan,analysis:'fixture',normalAttempts:1,fixtures:['synthetic-audio','analysis-adapter']};expect(aggregateCallTrials(p,[{id:'one',tries:[t]}],'synthetic').summary.failure).toBe(1);for(const phase of ['ai-input','transcript','analysis','warning-visible'] as const)t.events.push({id:phase,observer:'observer',phase,atMs:400});expect(aggregateCallTrials(p,[{id:'one',tries:[t]}],'synthetic').summary.firstSuccess).toBe(1);t.events.find(e=>e.phase==='transcript')!.atMs=399;expect(aggregateCallTrials(p,[{id:'one',tries:[t]}],'synthetic').summary.failure).toBe(1);});
