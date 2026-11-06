import {it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
it('retains pressure and reserve stops, counts the complete deployment and expires without a restart',()=>{
 const check=`import ast,pathlib
source=ast.parse(pathlib.Path('scripts/monitor-deployment.py').read_text());function=next(n for n in source.body if isinstance(n,ast.FunctionDef)and n.name=='resource_reason');scope={};exec(compile(ast.Module(body=[function],type_ignores=[]),'<monitor>','exec'),scope);check=scope['resource_reason'];gib=1024**3
sample={'stop':None,'memAvailableBytes':20*gib,'monotonicNs':10}
assert check(sample,16*gib,20)is None
assert check(sample,16*gib+1,20)=='DEPLOYMENT_16_GIB_BUDGET'
assert check(dict(sample,memAvailableBytes=16*gib-1),1,20)=='HOST_16_GIB_RESERVE'
assert check(dict(sample,stop={'reason':'SUSTAINED_SWAP_OUT'}),1,20)=='SUSTAINED_SWAP_OUT'
assert check(sample,1,10)=='APPROVED_PERIOD_ENDED'
`;
 expect(()=>execFileSync('python3',['-c',check],{stdio:'pipe'})).not.toThrow();
});

it('rechecks an exiting container instead of treating missing live cgroup data as zero',()=>{
 const check=`import ast,json,pathlib,subprocess
from types import SimpleNamespace
source=ast.parse(pathlib.Path('scripts/monitor-deployment.py').read_text());function=next(n for n in source.body if isinstance(n,ast.FunctionDef)and n.name=='container_memory')
running={'id':'owned','pid':123,'state':'running','oom':False,'memory':512,'swap':512,'restart':'no'}
terminal=dict(running,pid=0,state='exited')
class File:
 def __init__(self,path):self.path=path
 def __truediv__(self,part):return File(self.path+'/'+part)
 def read_text(self):
  if mode=='missing':raise FileNotFoundError()
  if mode=='permission':raise PermissionError()
  return {'/proc/123/cgroup':'0::/owned','/sys/fs/cgroup/owned/memory.current':'128','/sys/fs/cgroup/owned/memory.events':'oom 0\\noom_kill 0'}[self.path]
def inspect(*args,**kwargs):return json.dumps(next(records))
scope={'json':json,'subprocess':SimpleNamespace(check_output=inspect,PIPE=-1,CalledProcessError=subprocess.CalledProcessError,TimeoutExpired=subprocess.TimeoutExpired),'Path':File,'process_start':lambda pid:'same-start'}
exec(compile(ast.Module(body=[function],type_ignores=[]),'<monitor-memory>','exec'),scope)
measure=scope['container_memory']
mode='normal';records=iter([running]);assert measure('owned',{})==128
mode='missing';records=iter([running,terminal]);assert measure('owned',{})==0
for after in [running,dict(terminal,id='replacement'),dict(terminal,oom=True),dict(terminal,swap=1024),dict(terminal,restart='always'),dict(running,pid=456)]:
 records=iter([running,after])
 try:measure('owned',{})
 except RuntimeError:pass
 else:raise AssertionError('lost ownership, limits or live observation accepted')
mode='permission';records=iter([running])
try:measure('owned',{})
except PermissionError:pass
else:raise AssertionError('permission failure ignored')
def failed(*args,**kwargs):raise subprocess.CalledProcessError(1,['docker','inspect'],stderr='Error: No such object: owned')
scope['subprocess'].check_output=failed
try:measure('owned',{})
except RuntimeError as error:assert str(error)=='OWNED_CONTAINER_DISAPPEARED'
else:raise AssertionError('disappeared container accepted as zero')
scope['subprocess'].check_output=inspect
mode='normal';records=iter([dict(running,pid=0)])
try:measure('owned',{})
except RuntimeError:pass
else:raise AssertionError('unobserved running process counted as zero')
`;
 expect(()=>execFileSync('python3',['-c',check],{stdio:'pipe'})).not.toThrow();
});

it('allows an earlier resume deadline without granting another full operating period',()=>{
 const code=`import ast,pathlib
from types import SimpleNamespace
module=ast.parse(pathlib.Path('scripts/monitor-deployment.py').read_text());main=next(n for n in module.body if isinstance(n,ast.FunctionDef) and n.name=='main')
assignment=next(n for n in main.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='expires_ns' for t in n.targets))
condition=main.body[main.body.index(assignment)+1]
for requested,expected in [(None,100+24*3600*10**9),(150,150),(50,50),(10**20,100+24*3600*10**9)]:
 scope={'time':SimpleNamespace(monotonic_ns=lambda:100),'args':SimpleNamespace(expires_monotonic_ns=requested)}
 exec(compile(ast.Module(body=[assignment,condition],type_ignores=[]),'<deadline>','exec'),scope)
 assert scope['expires_ns']==expected
`;
 expect(()=>execFileSync('python3',['-c',code],{stdio:'pipe'})).not.toThrow();
});

it('preserves safe controller failure codes without copying sensitive stderr',()=>{
 const code=`import ast,pathlib,subprocess,re
from types import SimpleNamespace
source=ast.parse(pathlib.Path('scripts/monitor-deployment.py').read_text())
function=next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name=='control_command')
def run(*args,**kwargs):
 assert kwargs['timeout']==75
 if error:raise error
 return 'ok'
scope={'subprocess':SimpleNamespace(check_output=run,PIPE=-1,CalledProcessError=subprocess.CalledProcessError,TimeoutExpired=subprocess.TimeoutExpired),'re':re}
exec(compile(ast.Module(body=[function],type_ignores=[]),'<control>','exec'),scope)
error=None;assert scope['control_command']('control','status','protected',{})=='ok'
for error,expected in [(subprocess.CalledProcessError(78,[],stderr='DEPLOYMENT_RESOURCE_IDENTITY_MISMATCH\\n'),'DEPLOYMENT_RESOURCE_IDENTITY_MISMATCH'),(subprocess.CalledProcessError(78,[],stderr='Authorization: private-value'),'DEPLOYMENT_CONTROL_FAILED'),(subprocess.TimeoutExpired([],75),'DEPLOYMENT_CONTROL_TIMEOUT')]:
 try:scope['control_command']('control','status','protected',{})
 except RuntimeError as actual:assert str(actual)==expected
 else:raise AssertionError('failed observation accepted')
`;
 expect(()=>execFileSync('python3',['-c',code],{stdio:'pipe'})).not.toThrow();
});
