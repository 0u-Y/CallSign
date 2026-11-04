import {execFileSync} from 'node:child_process';
import {it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
it('uses interval deltas, actual elapsed time/page size and a baseline; counter reset never means swap pressure',()=>{
 execFileSync('python3',['-c',`
from scripts.validation_resources import SwapWatch

def sample(t,i,o=0,page=4096):
 return dict(monotonicNs=int(t*1e9),swapInPagesTotal=i,swapOutPagesTotal=o,pageBytes=page,memAvailableBytes=16*1024**3)
w=SwapWatch();assert w.update(sample(10,100000))['baseline']
s=w.update(sample(12,100512,256));assert s['swapInMiBPerSecond']==1 and s['swapOutMiBPerSecond']==.5
assert s['consecutive']==1 and s['stop'] is None
assert w.update(sample(15,100512,256))['consecutive']==0
w=SwapWatch();w.update(sample(10,999));s=w.update(sample(20,1));assert s['stop']['reason']=='HOST_COUNTER_RESET'
w=SwapWatch();w.update(sample(0,0,page=65536))
for n in range(1,4):s=w.update(sample(n*10,n,page=65536))
assert s['swapInMiBPerSecond']==.00625 and s['stop']['reason']=='SUSTAINED_SWAP'
mixed=SwapWatch();mixed.update(sample(0,0));mixed.update(sample(1,1));mixed.update(sample(2,1,1));assert mixed.update(sample(3,2,1))['stop']['reason']=='SUSTAINED_SWAP'
try:w.require_ready();raise AssertionError('new stage admitted after stop')
except RuntimeError as e:assert 'ENVIRONMENT_BLOCKED' in str(e)
w2=SwapWatch();assert w2.update(sample(100,999999))['stop'] is None
`],{stdio:'pipe'});
});
it('latches the first cause, cancels tests before DB cleanup and preserves earlier assertion failures',()=>{
 execFileSync('python3',['-c',`
import tempfile
from pathlib import Path
from scripts.validation_resources import RunState,stop_environment
with tempfile.TemporaryDirectory() as directory:
 state=RunState(directory,'unit-owned-run');events=[]
 def mark(name,value=None):
  def action():events.append(name);return value
  return action
 stop_environment(state,'SUSTAINED_SWAP',{'monotonicNs':123},mark('cancel'),mark('partial',{'passed':2,'failed':1}),mark('apps'),mark('database'))
 assert events==['cancel','partial','apps','database']
 record=state.read('environment-cleanup.json');assert record['partial']['failed']==1
 stop_environment(state,'DATABASE_SOCKET_MISSING',{'monotonicNs':456},mark('cancel'),mark('partial'),mark('apps'),mark('database'))
 assert state.read('environment-stop.json')['reason']=='SUSTAINED_SWAP'
 try:state.require_ready();raise AssertionError('next suite started')
 except RuntimeError as error:assert 'ENVIRONMENT_BLOCKED:SUSTAINED_SWAP' in str(error)
 try:RunState(directory,'different-run').require_ready();raise AssertionError('foreign state accepted')
 except RuntimeError as error:assert 'IDENTITY_MISMATCH' in str(error)
`],{stdio:'pipe'});
});
it('cancels a real owned child, flushes its partial assertion failure and refuses a subsequent launch',()=>{
 execFileSync('python3',['-c',`
import os,sys,tempfile,subprocess,time,json
from pathlib import Path
from scripts.validation_resources import RunState,process_start,cancel_owned,stop_environment
with tempfile.TemporaryDirectory() as directory:
 state=RunState(directory,'unit-real-child');progress=Path(directory)/'partial.json';ready=Path(directory)/'ready'
 code="import signal,sys,time,json;from pathlib import Path; signal.signal(signal.SIGINT,lambda a,b:(Path(sys.argv[1]).write_text(json.dumps({'failed':1})),sys.exit(0)));Path(sys.argv[2]).touch();time.sleep(20)"
 child=subprocess.Popen([sys.executable,'-c',code,str(progress),str(ready)],start_new_session=True)
 try:
  state.write('active-test.json',{'pid':child.pid,'processStart':process_start(child.pid),'label':'unit-child'})
  until=time.monotonic()+2
  while not ready.exists() and time.monotonic()<until:time.sleep(.01)
  assert ready.exists()
  events=[]
  stop_environment(state,'SUSTAINED_SWAP',{'monotonicNs':1},lambda:cancel_owned(state),lambda:json.loads(progress.read_text()),lambda:events.append('apps-closed'),lambda:events.append('database-stopped'))
  assert child.wait(timeout=1)==0
  assert events==['apps-closed','database-stopped']
  assert state.read('environment-cleanup.json')['partial']['failed']==1
  try:state.require_ready();raise AssertionError('next suite admitted')
  except RuntimeError:pass
 finally:
  if child.poll() is None:child.kill();child.wait()
`],{stdio:'pipe',timeout:12000});
},15000);
it('rejects invalid sample clocks and keeps database up if app cleanup fails',()=>{
 execFileSync('python3',['-c',`
import tempfile
from scripts.validation_resources import SwapWatch,RunState,stop_environment
s=dict(monotonicNs=1,swapInPagesTotal=0,swapOutPagesTotal=0,pageBytes=4096,memAvailableBytes=16*1024**3)
w=SwapWatch();w.update(s);assert w.update(s)['stop']['reason']=='OBSERVATION_IDENTITY_CHANGED'
w=SwapWatch();w.update(dict(s,bootIdHash='old'));assert w.update(dict(s,monotonicNs=2,bootIdHash='new'))['stop']['reason']=='OBSERVATION_IDENTITY_CHANGED'
with tempfile.TemporaryDirectory() as directory:
 state=RunState(directory,'unit-cleanup-failure');events=[]
 def failure():raise RuntimeError('owned process not confirmed stopped')
 stop_environment(state,'APP_MEMORY_BUDGET',s,failure,lambda:{'failed':1},lambda:None,lambda:events.append('database-stopped'))
 assert events==[]
 record=state.read('environment-cleanup.json');assert record['steps'][-1]['status']=='BLOCKED_BY_ACTIVE_PROCESS'
`],{stdio:'pipe'});
});

it('persists real Vitest partial successes and failures without storing error payloads',()=>{
 const root=mkdtempSync(join(tmpdir(),'callsign-progress-unit-')),progress=join(root,'progress.jsonl'),config=join(root,'vitest.config.mjs');
 try{
  writeFileSync(config,"export default {test:{include:['tests/fixtures/validation-progress.fixture.ts'],setupFiles:['tests/unit/offline.ts'],maxWorkers:1}};");
  let code=0;try{execFileSync(process.execPath,['node_modules/vitest/vitest.mjs','run','--config',config,'--reporter='+resolve('tests/integration/progress-reporter.mjs')],{env:{...process.env,CALLSIGN_ALLOW_EXTERNAL_EXECUTION:'integration',CALLSIGN_HTTP_PROGRESS_ROOT:root,CALLSIGN_HTTP_PROGRESS:progress},stdio:'pipe',timeout:12000});}catch(error){code=(error as {status:number}).status;}
  expect(code).toBe(1);const rows=readFileSync(progress,'utf8').trim().split('\n').map(s=>JSON.parse(s));
  expect(rows.map(r=>r.state)).toEqual(['passed','failed']);expect(rows.every(r=>typeof r.observerMonotonicNs==='string')).toBe(true);expect(rows.some(r=>'error' in r||'stack' in r)).toBe(false);
 }finally{rmSync(root,{recursive:true,force:true});}
},15000);

it('blocks the actual launcher on a latched cause before identity lookup or child startup',()=>{
 execFileSync('python3',['-c',`
import os,sys,tempfile,subprocess
from scripts.validation_resources import RunState
with tempfile.TemporaryDirectory() as directory:
 state=RunState(directory,os.path.basename(directory));state.write('environment-stop.json',{'reason':'SUSTAINED_SWAP','firstSatisfiedMonotonicNs':1})
 r=subprocess.run([sys.executable,'scripts/validation-resource-control.py','run',directory,'blocked-proof','2','node','-e','console.log("MUST_NOT_START")'],env={**os.environ,'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'integration'},capture_output=True,text=True,timeout=3)
 assert r.returncode!=0 and 'ENVIRONMENT_BLOCKED:SUSTAINED_SWAP' in r.stderr
 assert 'MUST_NOT_START' not in r.stdout and not (state.directory/'active-test.json').exists()
 denied=subprocess.run([sys.executable,'scripts/validation-resource-control.py','run',directory,'denied-proof','2','node','-e','console.log(\"MUST_NOT_START\")'],env={key:value for key,value in os.environ.items() if key!='CALLSIGN_ALLOW_EXTERNAL_EXECUTION'},capture_output=True,text=True,timeout=3)
 assert denied.returncode!=0 and 'INTEGRATION_EXECUTION_BLOCKED' in denied.stderr and 'MUST_NOT_START' not in denied.stdout
`],{stdio:'pipe',timeout:5000});
});

it('requires a monitored preparation child and passes role passwords through environment names only',()=>{
 execFileSync('python3',['-c',`
import os,sys,tempfile,runpy,subprocess
from scripts.validation_resources import RunState,process_start
sys.path.insert(0,'scripts')
prepare=runpy.run_path('scripts/validation-resource-control.py',run_name='unit_only')['database_preparation'];scope=prepare.__globals__
with tempfile.TemporaryDirectory() as directory:
 state=RunState(directory,'unit-preparation')
 try:prepare(state,'provision-logins');raise AssertionError('unguarded preparation ran')
 except RuntimeError as error:assert 'GUARDED_PREPARATION_CHILD_REQUIRED' in str(error)
 state.write('active-test.json',{'pid':os.getpid(),'processStart':process_start(os.getpid())})
 scope['identity']=lambda state:({'containerId':'unit-owned-container'},None)
 scope['db_info']=lambda data:None
 os.environ['TEST_DATABASE_URL']='postgresql://postgres:unit-protected-password@127.0.0.1/callsign_test_unit'
 calls=[];original=subprocess.run;original_output=subprocess.check_output
 try:
  subprocess.run=lambda command,**options:calls.append((command,options))
  subprocess.check_output=lambda *args,**kwargs:b'PostgreSQL init process complete; ready for start up. database system is ready to accept connections database system is ready to accept connections'
  assert prepare(state,'provision-logins')==0
  command,options=calls[-1]
  assert 'unit-protected-password' not in ' '.join(command)
  assert options['env']['PGPASSWORD']=='unit-protected-password'
  assert '--env' in command and 'ISSUER_DB_PASSWORD' in command and command[-1]=='callsign_test_unit'
  assert b'EXISTING_LOGIN_REQUIRES_EXPLICIT_REVIEW_NO_PASSWORD_RESET' in options['input']
  assert prepare(state,'wait-database')==0 and calls[-1][1]['input']==b'SELECT 1;'
  os.environ['TEST_DATABASE_URL']='postgresql://postgres:unit-protected-password@127.0.0.1/production'
  try:prepare(state,'provision-logins');raise AssertionError('non-test DB accepted')
  except RuntimeError as error:assert 'NEW_OWNED_DATABASE_REQUIRED' in str(error)
 finally:subprocess.run=original;subprocess.check_output=original_output
`],{stdio:'pipe'});
});

it('selects the explicit pressure policy without treating historical low swap activity as pressure',()=>{
 execFileSync('python3',['-c',`
import json,copy
from pathlib import Path
from scripts.validation_resources import SwapWatch,PRESSURE_POLICY,budget_reason
rows=json.loads(Path('artifacts/http-resource-preflight-20261103.json').read_text())['observations']
w=SwapWatch(PRESSURE_POLICY)
for old in [r for r in rows if r['watcher']=='10s']:
 s=dict(old,oomKillTotal=0);assert w.update(s)['stop'] is None

def sample(n,out=0,some=0,full=0,oom=3):
 return dict(monotonicNs=n*5_000_000_000,pageBytes=4096,swapInPagesTotal=n,swapOutPagesTotal=out,memAvailableBytes=16*1024**3,oomKillTotal=oom,memoryPSI={k:dict(avg10=v,avg60=0,avg300=0,total=n*100) for k,v in [('some',some),('full',full)]})
w=SwapWatch(PRESSURE_POLICY);s=sample(0);s['memAvailableBytes']=7*1024**3;assert w.update(s)['stop']['reason']=='HOST_MEMORY_RESERVE'
for field in ['some','full']:
 w=SwapWatch(PRESSURE_POLICY);w.update(sample(0))
 for n in range(1,4):r=w.update(sample(n,**{field:10 if field=='some' else 2}))
 assert r['stop']['reason']=='SUSTAINED_MEMORY_PSI' and r['psiTotalDeltaMicroseconds']=={'some':100,'full':100}
w=SwapWatch(PRESSURE_POLICY);w.update(sample(0))
for n in range(1,4):r=w.update(sample(n,out=n*6400))
assert r['swapOutMiBPerSecond']==5 and r['stop']['reason']=='SUSTAINED_SWAP_OUT'
w=SwapWatch(PRESSURE_POLICY);assert w.update(sample(0,oom=3))['stop'] is None;assert w.update(sample(1,oom=4))['stop']['reason']=='HOST_OOM_KILL'
w=SwapWatch(PRESSURE_POLICY);w.update(sample(1,out=10));assert w.update(sample(2,out=9))['stop']['reason']=='HOST_COUNTER_RESET'
w=SwapWatch(PRESSURE_POLICY);s=sample(0);s['memoryPSI']=None
try:w.update(s);raise AssertionError('missing PSI accepted')
except (TypeError,KeyError):pass
w=SwapWatch(PRESSURE_POLICY);s=sample(0);s['oomKillTotal']=float('nan')
try:w.update(s);raise AssertionError('nonfinite counter accepted')
except ValueError:pass
base=dict(ownedProcessRssBytes=0,observerRssBytes=0,temporaryTotalUpperBoundBytes=0,monotonicNs=1)
assert budget_reason(dict(base,ownedProcessRssBytes=3*1024**3+1))=='APP_MEMORY_BUDGET'
assert budget_reason(dict(base,temporaryTotalUpperBoundBytes=5*1024**3+1))=='DISK_BUDGET'
assert budget_reason(dict(base,containerOomKilled=True))=='CONTAINER_OOM'
assert budget_reason(base,deadline_ns=40_000_000_001)=='RUN_DEADLINE_CLEANUP_RESERVE'
assert budget_reason(base) is None
try:SwapWatch('from-environment');raise AssertionError('implicit unknown policy accepted')
except ValueError:pass
`],{stdio:'pipe'});
});

it('retains and reclaims owned descendants after their launcher exits',()=>{
 execFileSync('python3',['-c',`
import os,sys,time,tempfile,subprocess,json
from pathlib import Path
from scripts.validation_resources import RunState,process_start,owned_processes,cancel_owned,active_processes
with tempfile.TemporaryDirectory() as directory:
 state=RunState(directory,'unit-orphan');ready=Path(directory)/'ready';release=Path(directory)/'release'
 code="import sys,time,subprocess;from pathlib import Path;c=subprocess.Popen([sys.executable,'-c','import time;time.sleep(20)']);Path(sys.argv[1]).write_text(str(c.pid));\\nwhile not Path(sys.argv[2]).exists():time.sleep(.01)"
 parent=subprocess.Popen([sys.executable,'-c',code,str(ready),str(release)],start_new_session=True);start=process_start(parent.pid);orphan=None
 try:
  deadline=time.monotonic()+2
  while not ready.exists() and time.monotonic()<deadline:time.sleep(.01)
  assert ready.exists();orphan=int(ready.read_text());orphan_start=process_start(orphan)
  state.write('active-test.json',{'pid':parent.pid,'processStart':start,'label':'orphan','ownedProcesses':owned_processes(parent.pid,start)})
  release.touch();assert parent.wait(timeout=2)==0
  assert any(p['pid']==orphan for p in active_processes(state.read('active-test.json')))
  assert cancel_owned(state) is True
  assert process_start(orphan)!=orphan_start
  assert state.read('active-test.json')['ownedProcesses']==[]
 finally:
  if parent.poll() is None:parent.kill();parent.wait()
  if orphan and process_start(orphan)==orphan_start:os.kill(orphan,9)
`],{stdio:'pipe',timeout:8000});
},10000);

it('discovers helpers created during graceful cancellation before releasing ownership',()=>{
 execFileSync('python3',['-c',`
import os,sys,time,tempfile,subprocess
from pathlib import Path
from scripts.validation_resources import RunState,process_start,cancel_owned
with tempfile.TemporaryDirectory() as directory:
 state=RunState(directory,'unit-late-helper');ready=Path(directory)/'ready';helper=Path(directory)/'helper'
 code="import sys,time,signal,subprocess;from pathlib import Path;\\ndef stop(*args):\\n c=subprocess.Popen([sys.executable,'-c','import time;time.sleep(20)']);Path(sys.argv[2]).write_text(str(c.pid));sys.exit(0)\\nsignal.signal(signal.SIGINT,stop);Path(sys.argv[1]).touch();time.sleep(20)"
 parent=subprocess.Popen([sys.executable,'-c',code,str(ready),str(helper)],start_new_session=True);start=process_start(parent.pid)
 try:
  deadline=time.monotonic()+2
  while not ready.exists() and time.monotonic()<deadline:time.sleep(.01)
  assert ready.exists();state.write('active-test.json',{'pid':parent.pid,'processStart':start})
  cancel_owned(state);parent.wait(timeout=2)
  assert helper.exists() and process_start(int(helper.read_text())) is None
  assert state.read('active-test.json')['ownedProcesses']==[]
 finally:
  if parent.poll() is None:parent.kill();parent.wait()
  if helper.exists():
   pid=int(helper.read_text())
   if process_start(pid) and os.getsid(pid)==parent.pid:os.kill(pid,9)
  for child in state.read('active-test.json').get('ownedProcesses',[]):
   if process_start(child['pid'])==child['processStart']:os.kill(child['pid'],9)
`],{stdio:'pipe',timeout:13000});
},15000);


it('rescans an empty ownership snapshot before releasing helpers forked during cancellation',()=>{
 execFileSync('python3',['-c',`
import tempfile,signal
from unittest.mock import patch
import scripts.validation_resources as resources
with tempfile.TemporaryDirectory() as directory:
 state=resources.RunState(directory,'unit-empty-snapshot')
 state.write('active-test.json',dict(pid=900000,processStart='parent'))
 helper=dict(pid=900001,processStart='helper')
 snapshots=iter([[helper],[],[helper],[],[],[]]);sent=[]
 with patch.object(resources,'active_processes',side_effect=lambda active:next(snapshots,[])),patch.object(resources,'process_start',return_value=None),patch.object(resources.os,'kill',side_effect=lambda pid,sig:sent.append((pid,sig))):
  assert resources.cancel_owned(state) is True
 assert sent==[(helper['pid'],signal.SIGTERM)]
 assert state.read('active-test.json')['ownedProcesses']==[]
`],{stdio:'pipe',timeout:3000});
});
