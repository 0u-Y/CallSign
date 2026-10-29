import {expect,it,vi,afterEach} from 'vitest';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {readFile,unlink,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
vi.mock('node:child_process',async original=>({...await original<typeof import('node:child_process')>(),spawn:vi.fn()}));
import {spawn} from 'node:child_process';
import {runValidation,childEnvironment,validationIdentity,sameValidationIdentity,prerequisiteValid,assessment,combinedAssessment} from '../../scripts/validation-runner.js';
import {stageNames} from '../../scripts/validation-stages.js';
import {inspectionEnvironment,preparationSteps} from '../../scripts/execution-input.js';
import {preparationPlan} from '../../scripts/prepare-execution.js';
const environment={version:1 as const,environmentId:'offline:unit',kind:'offline' as const};
const created:string[]=[];const output=()=>{const path=`artifacts/.validation-unit-${randomUUID()}.json`;created.push(path);return path;};
afterEach(async()=>{for(const base of created.splice(0))for(const path of [base,`${base}.progress.json`])try{await unlink(path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}vi.mocked(spawn).mockReset();});
it('dry-runs every fixed stage without starting a child or changing an execution guard',async()=>{
 for(const stage of stageNames){const result=await runValidation({stage,environment,env:{},output:output()});expect(result.status).toBe('SKIPPED');expect(result.results.every(v=>v.status==='SKIPPED')).toBe(true);expect(result.realEnvironmentVerified).toBe(false);}
 expect(spawn).not.toHaveBeenCalled();expect(()=>childEnvironment('database',{},environment)).toThrow('EXPLICIT_DISPOSABLE');
});
it('refuses unknown stages, overwritten evidence, secrets as attachments, and any unapproved external execution',async()=>{
 await expect(runValidation({stage:'all' as 'offline',environment,env:{},output:output()})).rejects.toThrow('UNKNOWN_VALIDATION_STAGE');
 const path=output();await runValidation({stage:'offline',environment,env:{},output:path});await expect(runValidation({stage:'offline',environment,env:{},output:path})).rejects.toThrow('EVIDENCE_ALREADY_EXISTS');
 const blocked=await runValidation({stage:'database',environment:{version:1,kind:'disposable-test',environmentId:'test:unit',deploymentId:'test:unit'},env:{DEPLOYMENT_ID:'test:unit'},output:output(),execute:true});expect(blocked.status).toBe('BLOCKED');expect(spawn).not.toHaveBeenCalled();
 await expect(runValidation({stage:'offline',environment,env:{},output:output(),attachments:['keys/issuer.json']})).rejects.toThrow('SECRET_OR_PRIVATE');
});
it('fences test DB identity, strips provider access, and gives children an explicit network allowlist',()=>{
 const env={DEPLOYMENT_ID:'test:unit',CALLSIGN_ALLOW_EXTERNAL_EXECUTION:'integration',TEST_DATABASE_URL:'postgres://owner:secret@db/callsign_test_unit',TEST_AUTH_DATABASE_URL:'postgres://auth:secret@db/callsign_test_unit',DEEPGRAM_API_KEY:'must-not-inherit'};
 const target={version:1 as const,kind:'disposable-test' as const,environmentId:'test:unit',deploymentId:'test:unit'};
 const child=childEnvironment('database',env,target);expect(child.MIGRATOR_DATABASE_URL).toBe(env.TEST_DATABASE_URL);expect(child.AUTH_DATABASE_URL).toBe(env.TEST_AUTH_DATABASE_URL);expect(child.DEEPGRAM_API_KEY).toBeUndefined();expect(child.CALLSIGN_VALIDATION_NETWORK).toBe('[{"host":"db","port":5432}]');expect(child.CALLSIGN_ALLOW_EXTERNAL_EXECUTION).toBe('integration');expect(child.pnpm_config_verify_deps_before_run).toBe('error');
 expect(()=>childEnvironment('database',{...env,ISSUER_DATABASE_URL:env.TEST_DATABASE_URL},target)).toThrow('TEST_DATABASE_MUST_DIFFER');
 expect(()=>childEnvironment('database',{...env,TEST_DATABASE_URL:'postgres://owner:secret@db/live'},target)).toThrow('DISPOSABLE_TEST_DATABASE');
});
it('records a failed assertion, redacts credentials and stops all later executable steps',async()=>{
 vi.mocked(spawn).mockImplementation((()=>{const child=new EventEmitter() as EventEmitter&{stdout:EventEmitter;stderr:EventEmitter};child.stdout=new EventEmitter();child.stderr=new EventEmitter();queueMicrotask(()=>{child.stdout.emit('data',Buffer.from('Bearer abcdefg postgres://owner:password@db/live jane@example.invalid'));child.emit('close',1);});return child;}) as unknown as typeof spawn);
 const r=await runValidation({stage:'offline',environment,env:{PATH:process.env.PATH},output:output(),execute:true});expect(r.status).toBe('FAIL');expect(spawn).toHaveBeenCalledTimes(1);expect(r.results[0]!.output).not.toContain('password');expect(r.results[0]!.output).not.toContain('jane@');expect(r.results.slice(1).every(v=>v.status==='BLOCKED')).toBe(true);
});
it('invalidates resume on source/config/trust/environment changes and never turns dry-run into a prerequisite',async()=>{
 const r=await runValidation({stage:'offline',environment,env:{},output:output()}),identity=await validationIdentity({},environment);expect(sameValidationIdentity(identity,{...identity,sourceHash:'changed'})).toBe(false);expect(sameValidationIdentity(identity,{...identity,configurationHash:'changed'})).toBe(false);expect(sameValidationIdentity(identity,{...identity,environmentId:'test:other'})).toBe(false);
 const changedSettings=await validationIdentity({SENDER_INTERNAL_TOKEN:'changed-test-only',DEPLOYMENT_ID:'test:changed'},environment);expect(changedSettings.configurationHash).not.toBe(identity.configurationHash);
 expect(await prerequisiteValid(r,'offline',identity)).toBe(false);
 const p=output();await writeFile(p,JSON.stringify({...r,identity:{...identity,sourceHash:'old'}}));const next=await runValidation({stage:'offline',environment,env:{},output:output(),resume:p});expect(next.invalidatedResume).toContain('CHANGED');expect(next.results.every(v=>v.status==='SKIPPED')).toBe(true);
 expect(await prerequisiteValid({...r,dryRun:false,status:'PASS',results:[]},'offline',identity)).toBe(false);
});
it('parses protected env files as data, rejects execution injection, and reports an ordered preparation plan without secret values',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'callsign-settings-'));try{const path=join(dir,'settings');await writeFile(path,'WEB_ORIGIN=https://example.invalid\nPLATFORM_INTERNAL_TOKEN=private-test-secret-value\n');const env=await inspectionEnvironment(path,{});expect(env.PLATFORM_INTERNAL_TOKEN).toBe('private-test-secret-value');const plan=await preparationPlan(env);expect(JSON.stringify(plan)).not.toContain('private-test-secret-value');const done=new Set<string>();for(const step of preparationSteps){expect(step.after.every(id=>done.has(id))).toBe(true);done.add(step.id);}
 await writeFile(path,'NODE_OPTIONS=--require evil.js');await expect(inspectionEnvironment(path,{})).rejects.toThrow('EXECUTION_PERMISSION');
 await writeFile(path,'CALLSIGN_ALLOW_EXTERNAL_EXECUTION=media');await expect(inspectionEnvironment(path,{})).rejects.toThrow('EXECUTION_PERMISSION');
 }finally{await rm(dir,{recursive:true});}
});

it('the actual child preload blocks forbidden network/listen without even reaching a sentinel implementation',async()=>{
 const {execFileSync}=await import('node:child_process');
 const source=`import net from 'node:net';import dgram from 'node:dgram';import tls from 'node:tls';let leaked=0;const sentinel=()=>{leaked++;throw Error('SENTINEL_NO_NETWORK_IMPLEMENTATION');};net.Socket.prototype.connect=sentinel;net.Server.prototype.listen=sentinel;dgram.Socket.prototype.send=sentinel;dgram.Socket.prototype.bind=sentinel;tls.connect=sentinel;globalThis.fetch=sentinel;await import('./scripts/validation-network-guard.mjs?sentinel-fresh-module');for(const fn of [()=>fetch('https://forbidden.invalid'),()=>new net.Socket().connect(1,'forbidden.invalid'),()=>net.createServer().listen(0),()=>tls.connect(443,'forbidden.invalid')]){let blocked=false;try{fn();}catch(e){blocked=e.message==='VALIDATION_NETWORK_NOT_AUTHORIZED';}if(!blocked)throw Error('GUARD_MISSING');}if(leaked)throw Error('GUARD_LEAKED');console.log('CONTAINED');`;
 // Before the guard loads, every possible transport is a throwing in-process sentinel, never a real socket.
 expect(execFileSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',env:{...process.env,CALLSIGN_VALIDATION_NETWORK:'[]'},timeout:5000})).toContain('CONTAINED');
});

it('does not create a configuration cycle by requiring later measurements before database/media validation',async()=>{
 const before=await validationIdentity({},environment,'offline'),later=await validationIdentity({VALIDATION_MEASUREMENTS_PATH:'/nonexistent/callsign-future-measurements.json'},environment,'offline');expect(sameValidationIdentity(before,later)).toBe(true);
 const performance=await validationIdentity({VALIDATION_MEASUREMENTS_PATH:'/nonexistent/callsign-future-measurements.json'},environment,'performance');expect(performance.stageInputs.VALIDATION_MEASUREMENTS_PATH).toBe('MISSING');
});

it('keeps MANUAL separate from PASS and requires identity-bound observation reports plus intact source hashes',async()=>{
 const {createHash}=await import('node:crypto'),{stages}=await import('../../scripts/validation-stages.js');const identity=await validationIdentity({},environment,'cloud');const source=output(),observation=output();await writeFile(source,'Synthetic unit evidence only; no cloud execution');const sourceSha=createHash('sha256').update(await readFile(source)).digest('hex');
 const now=new Date().toISOString(),identityHash='f'.repeat(64);await writeFile(observation,JSON.stringify({stage:'cloud',step:'gcp-same-release',identityHash,checkedAt:now,verdict:'PASS',checks:{'OPS-003':true,'OPS-005':true,'OPS-007':true},sources:[{path:source,sha256:sourceSha}]}));const obsSha=createHash('sha256').update(await readFile(observation)).digest('hex');
 const record={version:1 as const,runId:'unit',stage:'cloud' as const,startedAt:now,finishedAt:now,identity,identityHash,dryRun:false,results:stages.cloud.steps.map(s=>({id:s.id,status:'MANUAL' as const,requirements:s.requirements,expectation:s.expectation})),status:'MANUAL' as const,automaticExecutionScope:'unit-metadata-only',attachments:[],realEnvironmentVerified:false as const,manualReview:{reviewer:'test:operator',observations:[{id:'gcp-same-release',artifact:observation,sha256:obsSha}]}};
 expect(await prerequisiteValid(record,'cloud',identity)).toBe(false);
 const raw=output();await writeFile(raw,JSON.stringify(record));const reviewed=await runValidation({stage:'cloud',environment,env:{},output:output(),reviewEvidence:raw,manualReview:record.manualReview});expect(reviewed.assessment?.verdict).toBe('PASS');expect(await prerequisiteValid(reviewed,'cloud',identity)).toBe(true);expect(record.status).toBe('MANUAL');const failedObservation=output();await writeFile(failedObservation,JSON.stringify({stage:'cloud',step:'gcp-same-release',identityHash,checkedAt:now,verdict:'FAIL',checks:{'OPS-003':true,'OPS-005':false,'OPS-007':true},sources:[{path:source,sha256:sourceSha}]}));const failedHash=createHash('sha256').update(await readFile(failedObservation)).digest('hex');const failed=await runValidation({stage:'cloud',environment,env:{},output:output(),reviewEvidence:raw,manualReview:{reviewer:'test:operator',observations:[{id:'gcp-same-release',artifact:failedObservation,sha256:failedHash}]}});expect(failed.assessment?.verdict).toBe('FAIL');expect(await prerequisiteValid(failed,'cloud',identity)).toBe(false);await writeFile(source,'changed');expect(await prerequisiteValid(record,'cloud',identity)).toBe(false);
});

it('separates execution, verdict and review and accepts source checks without unrelated service setup',async()=>{expect(assessment('MANUAL',true)).toEqual({method:'manual',execution:'not-run',verdict:'unjudged',review:'required'});expect(combinedAssessment([{status:'SKIPPED'}]).verdict).toBe('unjudged');const {stages}=await import('../../scripts/validation-stages.js'),identity=await validationIdentity({},environment);const evidence={version:1 as const,runId:'source-test',stage:'offline' as const,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),identity,identityHash:'unit',dryRun:false,results:stages.offline.steps.map(s=>({id:s.id,status:s.id==='preflight'?'BLOCKED' as const:'PASS' as const,expectation:s.expectation,requirements:s.requirements})),status:'BLOCKED' as const,automaticExecutionScope:'source',attachments:[],realEnvironmentVerified:false as const};expect(await prerequisiteValid(evidence,'offline',{...identity,configurationHash:'DB-settings-added'})).toBe(true);expect(await prerequisiteValid(evidence,'offline',{...identity,sourceHash:'changed'})).toBe(false);await expect(runValidation({stage:'offline',environment,env:{},output:output(),manualReview:{reviewer:'test:operator',observations:[]}})).rejects.toThrow('MANUAL_REVIEW_REQUIRES_METADATA');});
