import {expect,it} from 'vitest';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analysisSmokeBudget} from '../../services/api/src/provider-configuration.js';
import {assertLiveServerMonitor,existingServerStages,serverStartStages} from '../../scripts/deployment-control.mjs';
function fixture(){
 const env={CALLSIGN_PROJECT:'owned-project',DEPLOYMENT_ID:'owned-deployment',CALLSIGN_APP_IMAGE:'sha256:'+'a'.repeat(64),POSTGRES_IMAGE:'sha256:'+'b'.repeat(64),KEYCLOAK_IMAGE:'sha256:'+'c'.repeat(64),CALLSIGN_INGRESS_IMAGE:'sha256:'+'d'.repeat(64),ASTERISK_IMAGE:'sha256:'+'e'.repeat(64),TURN_IMAGE:'sha256:'+'f'.repeat(64),BESU_IMAGE:'sha256:'+'1'.repeat(64)};
 const images:Record<string,string>={'postgres':env.POSTGRES_IMAGE,'anchor-db':env.POSTGRES_IMAGE,'oidc-db':env.POSTGRES_IMAGE,oidc:env.KEYCLOAK_IMAGE,https:env.CALLSIGN_INGRESS_IMAGE,web:env.CALLSIGN_INGRESS_IMAGE,asterisk:env.ASTERISK_IMAGE,turn:env.TURN_IMAGE};
 const records=serverStartStages.flat().map((service:string,i:number)=>({id:(i+1).toString(16).padStart(64,'0'),labels:{'com.docker.compose.project':env.CALLSIGN_PROJECT,'com.docker.compose.service':service,'org.callsign.deployment-id':env.DEPLOYMENT_ID,'org.callsign.lifecycle':'persistent'},state:'exited',imageReference:images[service]??(service.startsWith('besu')?env.BESU_IMAGE:env.CALLSIGN_APP_IMAGE),image:images[service]??(service.startsWith('besu')?env.BESU_IMAGE:env.CALLSIGN_APP_IMAGE),network:'host',ports:{},privileged:false,memory:256*1024**2,swap:256*1024**2,cpu:250000000,restart:'no',oom:false,command:service==='oidc'?['start']:['normal-service'],environment:[] as string[]}));
 return {env,records};
}
it('reuses all existing long-lived server containers in dependency order and excludes initialization/test helpers',()=>{
 const {env,records}=fixture();const helper={...records[0]!,id:'9'.repeat(64),labels:{...records[0]!.labels,'com.docker.compose.service':'oidc-init'},command:['import']};
 expect(existingServerStages([...records,helper],env).flat()).toHaveLength(21);
 expect(serverStartStages[0]).toContain('postgres');expect(serverStartStages.at(-1)).toContain('issuer');
 for(const state of ['running','paused'])expect(()=>existingServerStages([...records,{...helper,state}],env)).toThrow('ACTIVE_DEPLOYMENT_TRIAL_OR_INITIALIZATION');
 expect(()=>existingServerStages(records.slice(1),env)).toThrow('EXISTING_SERVER_SERVICE_REQUIRED');
 expect(()=>existingServerStages([...records,records[0]!],env)).toThrow('EXISTING_SERVER_SERVICE_REQUIRED');
});
it('refuses other ownership, changed images, host network mutations, missing caps, OOM and an import entrypoint',()=>{
 const {env,records}=fixture();
 for(const change of [{network:'bridge'},{ports:{'443/tcp':[]}},{privileged:true},{memory:0},{memory:4*1024**3,swap:4*1024**3},{cpu:0},{cpu:2e9},{swap:-1},{restart:'always'},{oom:true},{imageReference:'mutable:latest'},{command:['seed']}])expect(()=>existingServerStages([{...records[0]!,...change},...records.slice(1)],env)).toThrow();
 expect(()=>existingServerStages([{...records[0]!,labels:{...records[0]!.labels,'org.callsign.lifecycle':'ephemeral'}},...records.slice(1)],env)).toThrow('IDENTITY_MISMATCH');
 const oidc=records.find(r=>r.labels['com.docker.compose.service']==='oidc')!;oidc.command=['start','--import-realm'];expect(()=>existingServerStages(records,env)).toThrow('NORMAL_ENTRYPOINT');
});
it('keeps real providers disabled by default and binds an explicitly finite budget to the existing issuer configuration',()=>{
 const {env,records}=fixture(),issuer=records.find(r=>r.labels['com.docker.compose.service']==='issuer')!;
 issuer.environment=['OPENAI_API_KEY_FILE=/protected/key'];expect(()=>existingServerStages(records,env)).toThrow('PROVIDER_CONFIGURATION_MISMATCH');
 const budget=JSON.stringify({id:'approved-smoke',expiresAt:Math.floor(Date.now()/1000)+600,sttSeconds:30,connections:1,llmRequests:4});
 const enabled={...env,CALLSIGN_PROVIDER_CONFIG:'deepgram-openai',CALLSIGN_ANALYSIS_SMOKE_BUDGET:budget};
 expect(()=>existingServerStages(records,enabled)).toThrow('ANALYSIS_BUDGET');
 issuer.environment.push('CALLSIGN_ANALYSIS_PROVIDER=openai','CALLSIGN_ANALYSIS_SMOKE_BUDGET='+budget);
 const image={id:issuer.image,labels:{'org.callsign.analysis-smoke-budget':'v1'}};
 expect(()=>existingServerStages(records,enabled,image)).not.toThrow();
 expect(()=>existingServerStages(records,enabled)).toThrow('PERSISTENT_ANALYSIS_RUNTIME_REQUIRED');
 Object.assign(issuer.labels,{'org.callsign.analysis-smoke-budget':'v1'});
 expect(()=>existingServerStages(records,enabled,{id:issuer.image,labels:{}})).toThrow('PERSISTENT_ANALYSIS_RUNTIME_REQUIRED');
 expect(()=>existingServerStages(records,enabled,{...image,id:'sha256:'+'9'.repeat(64)})).toThrow('PERSISTENT_ANALYSIS_RUNTIME_REQUIRED');
 expect(readFileSync('infra/deploy/prepared-runtime.Dockerfile','utf8')).toContain('LABEL org.callsign.analysis-smoke-budget=v1');
 const expired=JSON.stringify({...JSON.parse(budget),expiresAt:1});issuer.environment=['CALLSIGN_ANALYSIS_PROVIDER=openai','CALLSIGN_ANALYSIS_SMOKE_BUDGET='+expired];expect(analysisSmokeBudget({...enabled,CALLSIGN_ANALYSIS_SMOKE_BUDGET:expired})).toMatchObject({expiresAt:1});expect(()=>existingServerStages(records,{...enabled,CALLSIGN_ANALYSIS_SMOKE_BUDGET:expired},image)).toThrow('ANALYSIS_BUDGET');
});
it('matches the application finite budget schema and rejects missing, extra, invalid or oversized approval fields',()=>{
 const valid={id:'approved-smoke',expiresAt:Math.floor(Date.now()/1000)+600,sttSeconds:30,connections:1,llmRequests:4};
 const {env,records}=fixture(),issuer=records.find(r=>r.labels['com.docker.compose.service']==='issuer')!,image={id:issuer.image,labels:{'org.callsign.analysis-smoke-budget':'v1'}};
 const invalid:unknown[]=[{},null,[],{expiresAt:valid.expiresAt},{...valid,id:'x'},{...valid,id:'bad id'},{...valid,id:'x'.repeat(81)},{...valid,id:123},{...valid,extra:true},{...valid,expiresAt:0},{...valid,expiresAt:Number.MAX_SAFE_INTEGER+1},{...valid,sttSeconds:0},{...valid,sttSeconds:301},{...valid,sttSeconds:1.5},{...valid,connections:0},{...valid,connections:4},{...valid,connections:'1'},{...valid,llmRequests:-1},{...valid,llmRequests:21},{...valid,llmRequests:true}];
 for(const value of invalid){const raw=JSON.stringify(value),enabled={...env,CALLSIGN_PROVIDER_CONFIG:'deepgram-openai',CALLSIGN_ANALYSIS_SMOKE_BUDGET:raw};issuer.environment=['CALLSIGN_ANALYSIS_PROVIDER=openai','CALLSIGN_ANALYSIS_SMOKE_BUDGET='+raw];expect(()=>analysisSmokeBudget(enabled)).toThrow('ANALYSIS_SMOKE_BUDGET_INVALID');expect(()=>existingServerStages(records,enabled,image)).toThrow('PERSISTENT_ANALYSIS_BUDGET_REQUIRED');}
 for(const raw of ['{',' '.repeat(1025)+JSON.stringify(valid)]){const enabled={...env,CALLSIGN_PROVIDER_CONFIG:'deepgram-openai',CALLSIGN_ANALYSIS_SMOKE_BUDGET:raw};issuer.environment=['CALLSIGN_ANALYSIS_PROVIDER=openai','CALLSIGN_ANALYSIS_SMOKE_BUDGET='+raw];expect(()=>analysisSmokeBudget(enabled)).toThrow('ANALYSIS_SMOKE_BUDGET_INVALID');expect(()=>existingServerStages(records,enabled,image)).toThrow('PERSISTENT_ANALYSIS_BUDGET_REQUIRED');}
 const raw=JSON.stringify({...valid,sttSeconds:300,connections:3,llmRequests:0}),enabled={...env,CALLSIGN_PROVIDER_CONFIG:'deepgram-openai',CALLSIGN_ANALYSIS_SMOKE_BUDGET:raw};issuer.environment=['CALLSIGN_ANALYSIS_PROVIDER=openai','CALLSIGN_ANALYSIS_SMOKE_BUDGET='+raw];expect(analysisSmokeBudget(enabled)).toMatchObject({sttSeconds:300,connections:3,llmRequests:0});expect(()=>existingServerStages(records,enabled,image)).not.toThrow();
});
it('requires a live matching fresh monitor and new-start32GiB without resetting its expiry or running16GiB reserve',()=>{
 const ready={pid:123,processStart:'456',deploymentId:'owned',expiresMonotonicNs:1100e9};
 const sample={observerPid:123,monotonicNs:1000e9,memAvailableBytes:33*1024**3,ownedBytes:5*1024**3,stop:null};
 const observed={deploymentId:'owned',pid:123,processStart:'456',ageSeconds:1,nowNs:1001e9,starting:true};
 expect(()=>assertLiveServerMonitor(ready,sample,observed)).not.toThrow();
 for(const change of [{ageSeconds:21},{ageSeconds:NaN},{pid:321},{processStart:'789'},{nowNs:1100e9},{deploymentId:'other'}])expect(()=>assertLiveServerMonitor(ready,sample,{...observed,...change})).toThrow('LIVE_APPROVED_SERVER_MONITOR_REQUIRED');
 for(const change of [{observerPid:321},{memAvailableBytes:31*1024**3},{memAvailableBytes:undefined},{ownedBytes:17*1024**3},{ownedBytes:-1},{stop:{reason:'RESOURCE_STOP'}}])expect(()=>assertLiveServerMonitor(ready,{...sample,...change},observed)).toThrow();
 expect(()=>assertLiveServerMonitor(ready,{...sample,memAvailableBytes:20*1024**3},{...observed,starting:false})).not.toThrow();
 expect(ready.expiresMonotonicNs).toBe(1100e9);
});

it('starts no initialization helpers and stops the whole owned profile on a partial start failure (synthetic Docker)',async()=>{
 const root=mkdtempSync(join(tmpdir(),'callsign-server-restart-')),file=join(root,'deployment.env'),monitor=join(root,'monitor'),calls=join(root,'docker-calls.jsonl'),{env:images,records}=fixture();
 writeFileSync(file,Object.entries({...images,FINALS_DATA_DIR:root}).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
 writeFileSync(join(root,'docker'),`#!/usr/bin/env node
const fs=require('node:fs'),a=process.argv.slice(2),records=${JSON.stringify(records)};if(process.env.UNIT_ANALYSIS_BUDGET){const issuer=records.find(r=>r.labels['com.docker.compose.service']==='issuer');issuer.environment=['CALLSIGN_ANALYSIS_PROVIDER=openai','CALLSIGN_ANALYSIS_SMOKE_BUDGET='+process.env.UNIT_ANALYSIS_BUDGET];issuer.labels['org.callsign.analysis-smoke-budget']='v1';}fs.appendFileSync(process.env.UNIT_CALLS,JSON.stringify(a)+'\\n');
if(a[0]==='image'&&a[1]==='inspect')console.log(JSON.stringify({id:records.find(r=>r.labels['com.docker.compose.service']==='issuer').image,labels:{}}));
else if(a[0]==='ps')console.log(records.map(r=>r.id).join('\\n'));
else if(a[0]==='inspect'&&a[1]==='--format')for(const r of records)console.log(JSON.stringify(r));
else if(a[0]==='inspect')console.log(JSON.stringify(a.slice(1).map(id=>{const r=records.find(v=>v.id===id);return {Id:id,State:{Running:!(process.env.UNIT_FAIL_HEALTH&&r.labels['com.docker.compose.service']==='oidc'),OOMKilled:false,Health:{Status:'healthy'}}};})));
`,{mode:0o700});
 writeFileSync(join(root,'monitor-deployment.py'),`const fs=require('node:fs'),p=process.argv[5],now=Number(process.hrtime.bigint());fs.mkdirSync(p,{mode:0o700});fs.writeFileSync(p+'/ready.json',JSON.stringify({pid:process.pid,processStart:fs.readFileSync('/proc/'+process.pid+'/stat','utf8').split(' ')[21],deploymentId:'owned-deployment',expiresMonotonicNs:now+100e9}));fs.writeFileSync(p+'/resources.jsonl',JSON.stringify({observerPid:process.pid,monotonicNs:now,memAvailableBytes:64*1024**3,ownedBytes:0,stop:null})+'\\n');setInterval(()=>{},1000);`);
 const child=spawn(process.execPath,[join(root,'monitor-deployment.py'),'--env-file',file,'--output',monitor],{stdio:'ignore'});
 try{
  for(let i=0;i<40&&!existsSync(join(monitor,'ready.json'));i++)await new Promise(r=>setTimeout(r,25));
  const env={...process.env,...images,PATH:root+':'+process.env.PATH,CALLSIGN_ENV_FILE:file,CALLSIGN_MONITOR_DIR:monitor,CALLSIGN_DEPLOYMENT_TARGET:'server',CALLSIGN_ALLOW_EXTERNAL_EXECUTION:'infrastructure',UNIT_CALLS:calls};
  const budget=JSON.stringify({id:'approval-old-image-check',expiresAt:Math.floor(Date.now()/1000)+600,sttSeconds:30,connections:1,llmRequests:4});
  expect(()=>execFileSync('bash',['scripts/deployment.sh','start'],{env:{...env,CALLSIGN_PROVIDER_CONFIG:'deepgram-openai',CALLSIGN_ANALYSIS_SMOKE_BUDGET:budget,UNIT_ANALYSIS_BUDGET:budget},stdio:'pipe'})).toThrow(/PERSISTENT_ANALYSIS_RUNTIME_REQUIRED/);
  expect(readFileSync(calls,'utf8')).toContain('"image","inspect"');expect(readFileSync(calls,'utf8')).not.toContain('"start"');
  const success=execFileSync('bash',['scripts/deployment.sh','start'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});expect(JSON.parse(success).status).toBe('STARTED');
  const before=readFileSync(calls,'utf8');expect(before).not.toMatch(/"(?:up|pull|build|rm|prune|seed|import)"/);expect(before).not.toContain('"stop"');
  expect(()=>execFileSync('bash',['scripts/deployment.sh','start'],{env:{...env,UNIT_FAIL_HEALTH:'1'},stdio:'pipe'})).toThrow(/SERVER_START_DEPENDENCY_FAILED/);
  const failedCalls=readFileSync(calls,'utf8').slice(before.length).trim().split('\n').map(l=>JSON.parse(l)as string[]);
  expect(failedCalls.filter(a=>a[0]==='start')).toHaveLength(2);expect(failedCalls.filter(a=>a[0]==='stop')).toHaveLength(4);
  const results=readdirSync(root).filter(f=>f.endsWith('.result.json')).map(f=>JSON.parse(readFileSync(join(root,f),'utf8')));
  expect(results.find(r=>r.status==='FAILED')).toMatchObject({stopped:true,automaticRestart:false,reason:'SERVER_START_DEPENDENCY_FAILED'});
 }finally{child.kill('SIGTERM');await new Promise<void>(resolve=>{if(child.exitCode!==null||child.signalCode!==null)resolve();else child.once('exit',()=>resolve());});rmSync(root,{recursive:true,force:true});}
});
it('pins an independently updated issuer without accepting changes to other app images',()=>{
 const {env,records}=fixture(),image='sha256:'+'2'.repeat(64),issuer=records.find(r=>r.labels['com.docker.compose.service']==='issuer')!;
 issuer.image=image;issuer.imageReference=image;
 expect(()=>existingServerStages(records,env)).toThrow('EXISTING_SERVER_IMAGE_MISMATCH');
 expect(existingServerStages(records,{...env,CALLSIGN_ISSUER_IMAGE:image}).flat()).toHaveLength(21);
 const platform=records.find(r=>r.labels['com.docker.compose.service']==='platform')!;platform.image=image;platform.imageReference=image;
 expect(()=>existingServerStages(records,{...env,CALLSIGN_ISSUER_IMAGE:image})).toThrow('EXISTING_SERVER_IMAGE_MISMATCH');
});

it('accepts explicit diagnostic-only operation without weakening monitor identity or freshness',()=>{
 const ready={deploymentId:'demo',pid:123,processStart:'456',policy:'persistent-observe-v1',expiresMonotonicNs:null};
 const sample={observerPid:123,monotonicNs:100e9,stop:{reason:'SUSTAINED_SWAP_OUT'},memAvailableBytes:null,ownedBytes:null};
 const observed={deploymentId:'demo',pid:123,processStart:'456',ageSeconds:1,nowNs:101e9,starting:true,resourcePolicy:'persistent-observe-v1'};
 expect(()=>assertLiveServerMonitor(ready,sample,observed)).not.toThrow();
 for(const change of [{resourcePolicy:'bounded-v1'},{pid:999},{ageSeconds:21}])expect(()=>assertLiveServerMonitor(ready,sample,{...observed,...change})).toThrow();
 expect(()=>assertLiveServerMonitor({...ready,policy:'bounded-v1'},sample,observed)).toThrow();
});
