import {it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {assertManagedDeployment} from '../../scripts/deployment-control.mjs';

it('separates persistent deployment resources from test identities and other projects before mutation',()=>{
 const labels={'com.docker.compose.project':'owned-project','com.docker.compose.service':'issuer','org.callsign.deployment-id':'owned-deployment','org.callsign.lifecycle':'persistent'};
 expect(()=>assertManagedDeployment([{labels}],'owned-project','owned-deployment')).not.toThrow();
 for(const service of ['anchor','anchor-db','migration-runner','browser-check'])expect(()=>assertManagedDeployment([{labels:{...labels,'com.docker.compose.service':service}}],'owned-project','owned-deployment')).not.toThrow();
 for(const change of [{'org.callsign.lifecycle':'ephemeral'},{'org.callsign.run-id':'test-collision'},{'com.docker.compose.project':'other-project'},{'org.callsign.deployment-id':'old-deployment'},{'com.docker.compose.service':'test-runner'}])expect(()=>assertManagedDeployment([{labels},{labels:{...labels,...change}}],'owned-project','owned-deployment')).toThrow('IDENTITY_MISMATCH');
});

it('retains a resource stop latch and stops apps before data without touching test resources or printing env',()=>{
 const root=mkdtempSync(join(tmpdir(),'callsign-deployment-control-')),file=join(root,'deployment.env'),calls=join(root,'calls.jsonl');
 const env={PATH:root+':'+process.env.PATH,CALLSIGN_ENV_FILE:file,CALLSIGN_ALLOW_EXTERNAL_EXECUTION:'infrastructure',UNIT_CALLS:calls};
 try{
  writeFileSync(file,`DEPLOYMENT_ID=owned-deployment\nFINALS_DATA_DIR=${root}\nPLATFORM_INTERNAL_TOKEN=unit-only-never-print-this-value\n`,{mode:0o600});
  writeFileSync(join(root,'docker'),`#!/usr/bin/env node
const fs=require('node:fs'),a=process.argv.slice(2);fs.appendFileSync(process.env.UNIT_CALLS,JSON.stringify(a)+'\\n');
if(a[0]==='ps'&&a.includes('label=com.docker.compose.project=callsign-finals'))console.log('unit-issuer\\nunit-oidc\\nunit-postgres\\nunit-oidc-db');
else if(a[0]==='inspect')for(const service of ['issuer','oidc','postgres','oidc-db'])console.log(JSON.stringify({id:'unit-'+service,state:'running',health:'healthy',labels:{'com.docker.compose.project':'callsign-finals','com.docker.compose.service':service,'org.callsign.deployment-id':'owned-deployment','org.callsign.lifecycle':process.env.UNIT_LIFECYCLE||'persistent'}}));
`,{mode:0o700});
  const run=(command:string)=>execFileSync('bash',['scripts/deployment.sh',command],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const status=run('status');expect(status).toContain('complete readiness');expect(status).not.toContain('unit-only-never');
  run('resource-stop');expect(JSON.parse(readFileSync(join(root,'resource-stop.json'),'utf8')).reason).toBe('OPERATOR_RESOURCE_STOP');
  const check=['scripts/deployment-control.mjs','check',file,'docker','compose','--env-file',file];
  expect(()=>execFileSync('node',check,{env,stdio:'pipe'})).toThrow(/RESOURCE_STOP_LATCHED/);
  run('stop');const before=readFileSync(calls,'utf8');
  expect(()=>execFileSync('bash',['scripts/deployment.sh','stop'],{env:{...env,UNIT_LIFECYCLE:'ephemeral'},stdio:'pipe'})).toThrow(/IDENTITY_MISMATCH/);
  const records=readFileSync(calls,'utf8').trim().split('\n').map(row=>JSON.parse(row)as string[]),stops=records.filter(row=>row.includes('stop'));
  expect(stops).toHaveLength(4);expect(stops[0]).toContain('unit-issuer');expect(stops[0]).not.toContain('unit-postgres');expect(stops[0]).toContain('unit-oidc');expect(stops[0]).not.toContain('unit-oidc-db');expect(stops[1]).toContain('unit-postgres');expect(stops[1]).toContain('unit-oidc-db');expect(records.every(row=>!row.some(v=>['down','rm','prune','test-runner','seed'].includes(v)))).toBe(true);
  expect(readFileSync(calls,'utf8').slice(before.length)).not.toContain('"stop"');
  expect(()=>run('start')).toThrow(/development host network preservation/);
  const original=readFileSync(join(root,'resource-stop.json'),'utf8');
  const review=['scripts/deployment-control.mjs','review',file,'docker','compose'];
  expect(()=>execFileSync('node',review,{env,stdio:'pipe'})).toThrow(/EXPLICIT_OPERATOR_RESOURCE_REVIEW_REQUIRED/);
  execFileSync('node',review,{env:{...env,CALLSIGN_RESOURCE_REVIEW_REFERENCE:'Explicit user resume after reviewed observation failure'},stdio:'pipe'});
  execFileSync('node',check,{env,stdio:'pipe'});
  expect(JSON.parse(run('status')).priorResourceStopReviewed).toBe(true);
  expect(readFileSync(join(root,'resource-stop.json'),'utf8')).toBe(original);
  expect(()=>execFileSync('node',review,{env:{...env,CALLSIGN_RESOURCE_REVIEW_REFERENCE:'Duplicate request without a new stop'},stdio:'pipe'})).toThrow(/RESOURCE_REVIEW_ALREADY_USED/);
  run('resource-stop');
  expect(()=>execFileSync('node',check,{env,stdio:'pipe'})).toThrow(/RESOURCE_STOP_LATCHED/);
  const second=readFileSync(join(root,'resource-stop.after-review.json'),'utf8');
  execFileSync('node',review,{env:{...env,CALLSIGN_RESOURCE_REVIEW_REFERENCE:'Explicit further user restart request'},stdio:'pipe'});
  execFileSync('node',check,{env,stdio:'pipe'});
  run('resource-stop');
  expect(()=>execFileSync('node',check,{env,stdio:'pipe'})).toThrow(/RESOURCE_STOP_LATCHED/);
  expect(readFileSync(join(root,'resource-stop.after-review.json'),'utf8')).toBe(second);
  expect(readFileSync(join(root,'resource-stop.json'),'utf8')).toBe(original);
 }finally{rmSync(root,{recursive:true,force:true});}
});
