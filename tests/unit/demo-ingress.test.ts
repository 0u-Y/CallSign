import {it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
it('keeps enrollment planning offline and refuses apply before creating state without explicit guards',()=>{
 const script='scripts/prepare-demo-ingress.py',root=mkdtempSync(join(tmpdir(),'callsign-ingress-unit-')),output=join(root,'new-state');
 try{
  const plan=JSON.parse(execFileSync('python3',[script],{encoding:'utf8',env:{PATH:process.env.PATH}}));expect(plan.mode).toBe('plan');expect(plan.scope).toContain('no global service mutation');
  expect(()=>execFileSync('python3',[script,'--apply','--output',output],{env:{PATH:process.env.PATH},stdio:'pipe'})).toThrow(/ISOLATED_INGRESS_APPROVAL_REQUIRED/);expect(existsSync(output)).toBe(false);
  const check=`import ast,pathlib
source=ast.parse(pathlib.Path('scripts/prepare-demo-ingress.py').read_text());function=next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='scoped_tailscale');namespace={};exec(compile(ast.Module(body=[function],type_ignores=[]),'<scoped-command>','exec'),namespace);run=namespace['scoped_tailscale'];root=pathlib.Path('/owned/private')
assert run(root,'status','--json')==['/usr/bin/tailscale','--socket=/owned/private/daemon.sock','status','--json']
for path,args in [(pathlib.Path('relative'),('status',)),(root,('up','--socket=/var/run/tailscale/tailscaled.sock')),(root,('down',)),(root,())]:
 try:run(path,*args)
 except ValueError:pass
 else:raise AssertionError('global or unapproved command accepted')
`;
  expect(()=>execFileSync('python3',['-c',check],{stdio:'pipe'})).not.toThrow();
 }finally{rmSync(root,{recursive:true,force:true});}
});
it('persists the first low-memory sample and stops before creating any daemon or login process',()=>{
 const root=mkdtempSync(join(tmpdir(),'callsign-ingress-low-memory-')),output=join(root,'new-state');
 try{
  const check=`import types,sys,runpy,pathlib,subprocess,json,os
stub=types.ModuleType('validation_resources');stub.PRESSURE_POLICY='integration-pressure-v1';stub.host_sample=lambda:{'memAvailableBytes':20*1024**3,'observerRssBytes':1,'stop':None};stub.SwapWatch=lambda policy:types.SimpleNamespace(update=lambda sample:sample);stub.owned_rss=lambda *args:0;stub.process_start=lambda pid:0;sys.modules['validation_resources']=stub
original=pathlib.Path.is_file;pathlib.Path.is_file=lambda self:True if str(self) in ['/usr/bin/tailscale','/usr/sbin/tailscaled'] else original(self)
def forbidden(*args,**kwargs):raise AssertionError('DAEMON_MUST_NOT_START')
subprocess.Popen=forbidden;sys.argv=['prepare-demo-ingress.py','--apply','--output',sys.argv[1]]
try:runpy.run_path('scripts/prepare-demo-ingress.py',run_name='__main__')
except SystemExit as error:assert error.code==78
else:raise AssertionError('low memory reported success')
root=pathlib.Path(sys.argv[-1]);result=json.loads((root/'result.json').read_text());assert result['status']=='BLOCKED' and result['reason']=='START_24_GIB' and result['ownedProcessesStopped'];assert json.loads((root/'initial-sample.json').read_text())['memAvailableBytes']==20*1024**3;assert (root/'resource-samples.jsonl').read_text().strip()
`;
  expect(()=>execFileSync('python3',['-c',check,output],{env:{PATH:process.env.PATH,CALLSIGN_ALLOW_EXTERNAL_EXECUTION:'infrastructure',CALLSIGN_INGRESS_CONFIRMATION:'ISOLATED-USERSPACE-ONLY'},stdio:'pipe'})).not.toThrow();
 }finally{rmSync(root,{recursive:true,force:true});}
});
