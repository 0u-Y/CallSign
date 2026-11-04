"""Existing owned media launcher: fixed policy, evidence preservation and ordered cleanup. No automatic retry."""
import argparse,os,sys,json,time,subprocess,signal,re,shutil,math
from pathlib import Path

def capture_baseline(directory, phase):
    for name,args in [('interfaces',['ip','-j','addr']),('routes',['ip','-j','route','show','table','all']),('container-ids',['docker','ps','-aq','--no-trunc']),('network-ids',['docker','network','ls','-q'])]:
        output=subprocess.check_output(args,timeout=10)
        (directory/(phase+'-'+name+'.raw')).write_bytes(output)
        (directory/(phase+'-'+name+'.raw')).chmod(0o600)

def compare_baselines(directory):
    result={}
    for name in ['interfaces','routes','container-ids','network-ids']:
        before=directory/('before-'+name+'.raw');after=directory/('after-'+name+'.raw')
        if not before.exists() or not after.exists():result[name]='UNKNOWN_MISSING_SNAPSHOT';continue
        if name=='container-ids':
            old=before.read_text().split();new=after.read_text().split()
            result[name]=compare_container_ids(old,new)
        elif name=='interfaces':
            def configuration(value):
                if isinstance(value,dict):return {k:configuration(v) for k,v in value.items() if k not in ['valid_life_time','preferred_life_time']}
                if isinstance(value,list):return [configuration(v) for v in value]
                return value
            result[name]='EQUAL_CONFIGURATION' if configuration(json.loads(before.read_bytes()))==configuration(json.loads(after.read_bytes())) else 'DIFFERENT_UNATTRIBUTED'
        else:result[name]='EQUAL' if before.read_bytes()==after.read_bytes() else 'DIFFERENT_UNATTRIBUTED'
    return result

def compare_container_ids(before,after):
    if any(not re.fullmatch(r'[a-f0-9]{64}',x) for x in before+after):return 'UNKNOWN_ID_FORMAT'
    return 'PRESERVED' if set(before)<=set(after) else 'MISSING_UNATTRIBUTED'

def cleanup_priority(entry):
    name=entry['name']
    return 0 if any(x in name for x in ['controller','issuer','sender','platform','worker','web','https']) else 2 if name.endswith('-net') else 1

def preserve_evidence(root, directory, reason, steps):
    # Whitelist outputs; never copy env, keys, sessions, account files or DB/chain data.
    directory.mkdir(exist_ok=True,mode=0o700)
    copied=[]
    for location in [root,*root.glob('phase-*')]:
        if location.is_symlink():raise RuntimeError('EVIDENCE_SYMLINK_FORBIDDEN')
        outputs=['ownership.json','interfaces-before.json','routes-before.json','docker-containers-before.json','docker-networks-before.json','chain-observation.json','foundation-complete.json','database-stage-complete.json','delivery-web-build.json','runtime-media-results.json']
        outputs += [p.name for pattern in ['normal-entrypoint-*.json','call-trial-*.json','decoded-audio-*.json','*.log'] for p in location.glob(pattern)]
        for name in outputs:
            source=location/name
            if source.is_symlink():raise RuntimeError('EVIDENCE_SYMLINK_FORBIDDEN')
            if source.is_file():
                target=directory/source.relative_to(root)
                target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                if target.exists():raise RuntimeError('EVIDENCE_ALREADY_PRESERVED')
                shutil.copyfile(source,target);target.chmod(0o600);copied.append(str(source.relative_to(root)))
    (directory/'partial-stop.json').write_text(json.dumps({'reason':reason,'steps':steps})+'\n')
    (directory/'partial-stop.json').chmod(0o600)
    return {'copied':copied,'firstCause':reason,'scope':'private evidence only; no public secret-absence claim'}

def read_cgroup(path):
    pressure={line.split()[0]:dict((k,float(v)) for k,v in (x.split('=') for x in line.split()[1:])) for line in (path/'memory.pressure').read_text().splitlines()}
    values=[pressure[kind][key] for kind in ['some','full'] for key in ['avg10','avg60','avg300','total']]
    current=int((path/'memory.current').read_text());swap=int((path/'memory.swap.current').read_text());maximum=(path/'memory.swap.max').read_text().strip()
    events=dict((k,int(v)) for k,v in (line.split() for line in (path/'memory.events').read_text().splitlines()))
    if current<0 or swap<0 or maximum!='0' or any(not math.isfinite(v) or v<0 for v in values) or any(events[k]<0 for k in ['oom','oom_kill']):raise ValueError('INVALID_CGROUP_OBSERVATION_OR_SWAP_LIMIT')
    return {'memoryCurrentBytes':current,'swapCurrentBytes':swap,'swapMax':maximum,'memoryEvents':events,'memoryPressure':pressure}

def main():
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    from validation_resources import host_sample,SwapWatch,PRESSURE_POLICY,owned_rss,process_start
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--work-dir',type=Path,required=True);parser.add_argument('--policy',choices=[PRESSURE_POLICY],required=True);parser.add_argument('--browser-cache',type=Path,required=True);parser.add_argument('--apply',action='store_true');options=parser.parse_args()
    if not options.apply or os.environ.get('CALLSIGN_ALLOW_EXTERNAL_EXECUTION')!='integration':raise SystemExit('EXPLICIT_INTEGRATION_EXECUTION_REQUIRED')
    r=options.work_dir.resolve()
    if not r.is_relative_to(Path.cwd().resolve()/'.local') or r.stat().st_uid!=os.getuid() or r.stat().st_mode&0o077:raise SystemExit('OWNED_PRIVATE_WORK_DIRECTORY_REQUIRED')
    root=Path((r/'full-root-path').read_text().strip());
    if not root.is_relative_to(r/'observer/.local') or not root.name.startswith('media-delivery-'):raise SystemExit('OWNED_MEDIA_ROOT_REQUIRED')
    observer=root.parent.parent;run=root.name;plan=json.loads((r/'plan.json').read_text());watch=SwapWatch(PRESSURE_POLICY);child=None;start=None;stop=None;stage='preflight';steps=[];builder_ids=set();env={**os.environ,'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'integration','DOCKER_CONFIG':str(r/'docker-auth-empty'),'COREPACK_ENABLE_NETWORK':'0'}
    if not time.monotonic_ns()<plan['deadlineMonotonicNs']<=time.monotonic_ns()+90*60*10**9:raise SystemExit('BOUNDED_DEADLINE_REQUIRED')
    evidence=r/'evidence-private';evidence.mkdir(mode=0o700)
    log=(r/'full-resources.jsonl').open('x')
    def inspect(ids):
     if not ids:return []
     p=subprocess.run(['docker','inspect',*ids],capture_output=True,text=True,timeout=8)
     return json.loads(p.stdout or '[]')
    def memory(info):
     try:
      group=next(v.split(':',2)[2] for v in Path(f"/proc/{info['State']['Pid']}/cgroup").read_text().splitlines() if v.startswith('0::'));cg=Path('/sys/fs/cgroup')/group.lstrip('/');info['_cgroup']=read_cgroup(cg);return info['_cgroup']['memoryCurrentBytes']
     except FileNotFoundError:
      # A completed preparation tool may be removed by bootstrap between the two snapshots.
      current=inspect([info['Id']])
      if not current:
       if '-tool-' not in info.get('Name','') and info['Id'] not in builder_ids:raise RuntimeError('CONTAINER_IDENTITY_UNAVAILABLE')
       info['State']={**info['State'],'Running':False,'Status':'removed-after-snapshot'};return 0
      latest=current[0]
      if latest['Id']!=info['Id'] or latest['Image']!=info['Image']:raise RuntimeError('CONTAINER_IDENTITY_CHANGED')
      if latest['State']['Running']:raise
      info.update(latest);return 0
    def sample_inner():
     nonlocal stop
     raw=host_sample();row=watch.update(raw);host=raw['observerRssBytes']+(owned_rss(child.pid,start) if child and child.poll() is None else 0);containers=[];ids=subprocess.check_output(['docker','ps','-aq','--no-trunc','--filter','label=org.callsign.run-id='+run],text=True,timeout=5).split();total=0
     for info in inspect(ids):
      assert info['Config']['Labels'].get('org.callsign.run-id')==run and not info['HostConfig']['PortBindings'] and (info['HostConfig']['NetworkMode']=='none' or info['HostConfig']['NetworkMode'].startswith('container:'))
      if info['HostConfig']['MemorySwap']!=info['HostConfig']['Memory']:raise RuntimeError('OWNED_SWAP_LIMIT_MISMATCH')
      if info['State']['OOMKilled']:stop=stop or 'OWNED_CONTAINER_OOM'
      used=memory(info) if info['State']['Running'] else 0
      if info['State'].get('OOMKilled'):stop=stop or 'OWNED_CONTAINER_OOM'
      if not info['State']['Running'] and info['State'].get('Status')!='created' and '-tool-' not in info['Name'] and 'issuer-entrypoint-probe' not in info['Name']:stop=stop or 'OWNED_SERVICE_EXIT'
      total+=used;containers.append({'id':info['Id'],'bytes':used,'limit':info['HostConfig']['Memory'],'running':info['State']['Running'],'role':info.get('Name','').removeprefix('/'+run+'-'),'swapLimit':info['HostConfig']['MemorySwap'],'cgroup':info.get('_cgroup')})
     current=root/'runtime-media-test.log'
     if current.exists():
      for cid in re.findall(r'Running in ([0-9a-f]{12,64})',current.read_text(errors='replace')):
       for info in inspect([cid]):
        if not info['State']['Running']:continue
        assert info['HostConfig']['NetworkMode']=='none' and info['HostConfig']['Memory']==2*1024**3 and info['HostConfig']['CpuQuota']==100000
        assert (info['Config'].get('Labels') or {}).get('org.callsign.source-commit')==plan['source']
        builder_ids.add(info['Id']);used=memory(info)
        if any(c['id']==info['Id'] for c in containers):continue
        total+=used;containers.append({'id':info['Id'],'webBuilder':True,'bytes':used,'limit':info['HostConfig']['Memory'],'swapLimit':info['HostConfig']['MemorySwap'],'cgroup':info.get('_cgroup')})
        if info['State']['OOMKilled']:stop=stop or 'WEB_BUILDER_OOM'
     row.update(stage=stage,hostOwnedBytes=host,containerCurrentBytes=total,observedTotalBytes=host+total,containers=containers)
     stop=stop or (row['stop'] or {}).get('reason') or ('HOST_1_GIB_BUDGET' if host>1024**3 else 'TOTAL_24_GIB_BUDGET' if total+host>24*1024**3 else 'HOST_16_GIB_RESERVE' if raw['memAvailableBytes']<16*1024**3 else 'DEADLINE_CLEANUP_RESERVE' if raw['monotonicNs']>=plan['deadlineMonotonicNs']-600_000_000_000 else None)
     row['fullStop']=stop;log.write(json.dumps(row)+'\n');log.flush()
     if stop:raise RuntimeError(stop)
    def sample():
     nonlocal stop
     try:sample_inner()
     except BaseException as error:
      stop=stop or 'OBSERVATION_ERROR'
      path=r/'first-stop.json'
      if not path.exists():path.write_text(json.dumps({'reason':stop,'stage':stage,'monotonicNs':time.monotonic_ns(),'errorType':type(error).__name__})+'\n')
      raise
    def action(label,args,seconds,cwd=observer,extra=None):
     nonlocal child,start,stage,stop
     if time.monotonic_ns()>=plan['deadlineMonotonicNs']-(seconds+600)*1000000000:stop=stop or 'INSUFFICIENT_TIME_WITH_CLEANUP';raise RuntimeError(stop)
     stage=label;path=r/('full-'+label+'.log');began=time.monotonic()
     with path.open('x') as output:
      child=subprocess.Popen(args,cwd=cwd,env={**env,**(extra or {})},stdout=output,stderr=subprocess.STDOUT,start_new_session=True);start=process_start(child.pid)
      while child.poll() is None:
       sample()
       if time.monotonic()-began>seconds:stop=stop or 'STEP_TIMEOUT:'+label;raise RuntimeError(stop)
       time.sleep(5)
      code=child.returncode;steps.append({'label':label,'exitCode':code,'seconds':time.monotonic()-began});child=None
      if code:raise RuntimeError('STEP_FAILED:'+label)
    def cleanup():
     if child and child.poll() is None:
      os.killpg(child.pid,signal.SIGTERM)
      try:child.wait(timeout=5)
      except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait(timeout=5)
     owned=json.loads((root/'ownership.json').read_text()) if (root/'ownership.json').exists() else {'containers':[],'volumes':[]};removed=[];errors=[]
     # Application/browser/controller before the data and ledger services.
     try:preservation=preserve_evidence(root,evidence,stop,steps)
     except Exception as error:preservation={'status':'FAIL','errorType':type(error).__name__};errors.append('EVIDENCE_PRESERVATION_FAILED')
     items=sorted(owned['containers'],key=cleanup_priority)
     for entry in items:
      if time.monotonic_ns()>plan['deadlineMonotonicNs']-30_000_000_000:errors.append('CLEANUP_DEADLINE_REMAINING_RESOURCES');break
      for info in inspect([entry['id']]):
       if info['Id']!=entry['id'] or (info['Config'].get('Labels') or {}).get('org.callsign.run-id')!=run:errors.append('OWNERSHIP_MISMATCH');continue
       try:
        if info['State']['Running']:subprocess.run(['docker','stop','-t','3',info['Id']],check=True,stdout=subprocess.DEVNULL,timeout=12)
        subprocess.run(['docker','rm',info['Id']],check=True,stdout=subprocess.DEVNULL,timeout=10);removed.append(info['Id'])
       except Exception as e:errors.append(type(e).__name__)
     for name in owned['volumes']:
      if time.monotonic_ns()>plan['deadlineMonotonicNs']-30_000_000_000:errors.append('CLEANUP_DEADLINE_REMAINING_VOLUMES');break
      info=json.loads(subprocess.check_output(['docker','volume','inspect',name],text=True,timeout=5))[0]
      if info.get('Labels',{}).get('org.callsign.run-id')!=run:errors.append('VOLUME_OWNERSHIP_MISMATCH');continue
      try:subprocess.run(['docker','volume','rm',name],check=True,stdout=subprocess.DEVNULL,timeout=10)
      except Exception as e:errors.append(type(e).__name__)
     try:capture_baseline(evidence,'after')
     except Exception as error:errors.append('AFTER_BASELINE_'+type(error).__name__)
     comparison=compare_baselines(evidence)
     if any(v.startswith(('UNKNOWN','MISSING','DIFFERENT')) for v in comparison.values()):errors.append('BASELINE_COMPARISON_UNRESOLVED')
     return {'evidencePreservation':preservation,'baselineComparison':comparison,'removedContainers':len(removed),'volumeCount':len(owned['volumes']),'errors':errors,'appsBeforeData':True}
    result={}
    try:
     first=host_sample();(r/'first-sample.json').write_text(json.dumps(first)+'\n')
     if first['memAvailableBytes']<40*1024**3:stop='START_40_GIB_REQUIRED';raise RuntimeError(stop)
     try:capture_baseline(evidence,'before')
     except Exception:stop='BASELINE_OBSERVATION_ERROR';raise
     began=time.monotonic()
     while True:
      sample()
      if time.monotonic()-began>=60:break
      time.sleep(5)
     action('bootstrap',[sys.executable,'tests/integration/runtime-delivery-bootstrap.py','--delivery',str(r/'delivery-final'),'--root',str(root),'--browser-cache',str(options.browser_cache.resolve()),'--apply'],600)
     image=json.loads((root/'images-loaded.json').read_text())['CALLSIGN_APP_IMAGE'];extra={'CALLSIGN_RUNTIME_TEST_ROOT':str(root),'CALLSIGN_EXPECTED_RUNTIME_IMAGE':image}
     for label,case in [('normal-smoke-1','normal-end'),('normal-smoke-2','normal-end'),('normal-repeat-1','normal-end'),('normal-repeat-2','normal-end'),('work-cancel','work-cancel'),('emergency-stop','emergency-stop')]:
      action(label,[sys.executable,'tests/integration/runtime-media-driver.py','--delivery-files',str(root/'public'),'--analysis-fixture','--case',case],600,extra=extra)
      if label!='emergency-stop':action('archive-'+label,[sys.executable,'tests/integration/runtime-media-driver.py','--archive-phase',label],90,extra=extra)
     result={'status':'PASS','steps':steps,'resourceStop':None}
    except BaseException as error:
     result={'status':'BLOCKED' if stop else 'FAIL','reason':str(error),'steps':steps,'resourceStop':stop};print('Full phase stopped:',str(error))
    finally:
     try:result['cleanup']=cleanup()
     except BaseException as error:result['cleanup']={'uncertain':True,'error':type(error).__name__}
     if result.get('cleanup',{}).get('errors') or result.get('cleanup',{}).get('uncertain'):
      if result.get('status')=='PASS':result['status']='BLOCKED';result['reason']='CLEANUP_INCOMPLETE'
     (r/'full-phase-result.json').write_text(json.dumps(result,indent=2)+'\n');log.close()
    print(json.dumps(result));sys.exit(0 if result['status']=='PASS' else 2)

if __name__=="__main__":main()
