#!/usr/bin/env python3
"""Existing local watchdog/step launcher, sharing a latched cause and owned process cleanup."""
import sys,os,json,time,signal,subprocess,hashlib
from pathlib import Path
from validation_resources import RunState,SwapWatch,host_sample,owned_rss,owned_processes,process_start,cancel_owned,stop_environment,LEGACY_POLICY,PRESSURE_POLICY,budget_reason

def identity(state):
    data=state.read('identity.json')
    if not data or data['runId']!=state.run_id:raise RuntimeError('OWNED_RUN_IDENTITY_REQUIRED')
    root=Path(data['root']).resolve();info=root.stat()
    if data.get('bootIdHash')!=hashlib.sha256(Path('/proc/sys/kernel/random/boot_id').read_bytes()).hexdigest():raise RuntimeError('HOST_BOOT_IDENTITY_CHANGED')
    if root.name!=data['runId'] or info.st_uid!=os.getuid() or info.st_mode&0o077:raise RuntimeError('OWNED_TEST_ROOT_REQUIRED')
    return data,root

def db_info(data):
    info=json.loads(subprocess.check_output(['docker','inspect',data['containerId']],timeout=3,stderr=subprocess.DEVNULL))[0]
    if info['Id']!=data['containerId'] or info['Config']['Labels'].get('callsign.test')!=data['runId'] or info['HostConfig']['NetworkMode']!='none' or info['HostConfig']['PortBindings']:raise RuntimeError('OWNED_NONE_DATABASE_REQUIRED')
    if not 0<info['HostConfig']['Memory']<=512*1024**2 or not 0<info['HostConfig']['NanoCpus']<=1_000_000_000 or not 0<info['HostConfig']['MemorySwap']<=512*1024**2:raise RuntimeError('DATABASE_BUDGET_NOT_ENFORCED')
    return info

def partial(state):
    active=state.read('active-test.json');counts={'passed':0,'failed':0,'skipped':0,'pending':0}
    if not active:return dict(available=False,counts=counts)
    path=state.directory/(active['label']+'.progress.jsonl')
    if not path.exists():return dict(available=False,counts=counts)
    if path.stat().st_size>1048576:raise RuntimeError('PROGRESS_SIZE_LIMIT')
    for row in path.read_text().splitlines():
        result=json.loads(row);counts[result['state']]=counts.get(result['state'],0)+1
    return dict(available=True,counts=counts,complete=False)

def stop(state,reason,observation,data=None):
    def database():
        if data:
            current=db_info(data)
            if current['State']['Running']:subprocess.run(['docker','stop','--time','10',data['containerId']],check=True,timeout=15,stdout=subprocess.DEVNULL)
    return stop_environment(state,reason,observation,lambda:cancel_owned(state),lambda:partial(state),lambda:cancel_owned(state),database)

def sample(state,data=None):
    result=host_sample();active=state.read('active-test.json')
    result['ownedProcessRssBytes']=owned_rss(active.get('launcherPid',active['pid']),active.get('launcherStart',active['processStart'])) if active else 0
    if active:
        children=owned_processes(active['pid'],active['processStart'])
        if children:
            with state.locked():
                current=state.read('active-test.json')
                if current and current['pid']==active['pid'] and current['processStart']==active['processStart']:state.write('active-test.json',dict(current,ownedProcesses=children))
    result['containerMemoryBytes']=None;result['containerOomKilled']=None
    if data:
        info=db_info(data);result['containerOomKilled']=info['State']['OOMKilled']
        if info['State']['Running']:
            try:
                group=next(line.split(':',2)[2] for line in Path(f"/proc/{info['State']['Pid']}/cgroup").read_text().splitlines() if line.startswith('0::'))
                result['containerMemoryBytes']=int((Path('/sys/fs/cgroup')/group.lstrip('/')/'memory.current').read_text())
            except (OSError,StopIteration):pass
        elif info['State']['Status']!='created':result['databaseUnexpectedlyStopped']=True
    return result

def observe(state,preflight,data=None,policy=LEGACY_POLICY):
    fast,slow=SwapWatch(policy),SwapWatch();started=time.monotonic();slow_at=started;next_at=started
    interval,seconds=(5,60) if policy==PRESSURE_POLICY else (1,31)
    if not preflight:
        saved=state.read('resource-watches.json');state.require_ready()
        if not saved or saved.get('policy',LEGACY_POLICY)!=policy or not 0<=time.monotonic_ns()-saved['fast']['previous']['monotonicNs']<=(interval+2)*1_000_000_000:raise RuntimeError('OBSERVATION_HANDOFF_STALE')
        for watch,name in [(fast,'fast'),(slow,'slow')]:
            for key in ['previous','consecutive','pressure_consecutive','out_consecutive']:
                if key in saved[name]:setattr(watch,key,saved[name][key])
        slow_at=slow.previous['monotonicNs']/1e9 if slow.previous else started
        if policy==PRESSURE_POLICY:
            state.write('resource-watches.json',dict(saved,observerPid=os.getpid(),observerStart=process_start(os.getpid())))
            next_at=fast.previous['monotonicNs']/1e9+interval
            time.sleep(max(0,next_at-time.monotonic()))
    with (state.directory/'resource-samples.jsonl').open('a') as output:
        os.chmod(output.name,0o600)
        while True:
            if state.read('finished.json'):return 0
            if state.read('environment-stop.json'):return 2
            try:
                raw=sample(state,data)
                if policy==PRESSURE_POLICY and data and raw.get('containerMemoryBytes') is None and db_info(data)['State']['Running']:raise RuntimeError('CONTAINER_MEMORY_UNAVAILABLE')
                records=[dict(fast.update(raw),watcher=str(interval)+'s')]
                if policy==LEGACY_POLICY and (slow.previous is None or time.monotonic()-slow_at>=10):
                    slow_at=time.monotonic();records.append(dict(slow.update(raw),watcher='10s'))
                roots=[Path(data['root'])] if data else []
                if data and not state.directory.is_relative_to(roots[0]):roots.append(state.directory)
                raw['databaseDataBudgetBytes']=512*1024**2 if data else 0;raw['temporaryFilesObservedBytes']=0
                for root in roots:
                    for path in root.rglob('*'):
                        try:
                            if path.is_file():raw['temporaryFilesObservedBytes']+=path.stat().st_size
                        except FileNotFoundError:pass
                raw['temporaryTotalUpperBoundBytes']=raw['temporaryFilesObservedBytes']+raw['databaseDataBudgetBytes']
                reason=next((v['stop']['reason'] for v in records if v['stop']),None) or budget_reason(raw,data['deadlineMonotonicNs'] if data else None)
            except Exception as error:
                stop(state,'RESOURCE_OBSERVATION_UNAVAILABLE',{'monotonicNs':time.monotonic_ns(),'errorType':type(error).__name__,'policy':policy},data);return 2
            for record in records:
                record.update({k:v for k,v in raw.items() if k.startswith('temporary') or k=='databaseDataBudgetBytes'});record['runId']=state.run_id
                output.write(json.dumps(record)+'\n')
            output.flush()
            def saved_watch(watch):return {key:getattr(watch,key) for key in ['previous','consecutive','pressure_consecutive','out_consecutive']}
            state.write('resource-watches.json',{'policy':policy,'fast':saved_watch(fast),'slow':saved_watch(slow),'observerPid':os.getpid(),'observerStart':process_start(os.getpid())})
            if reason:
                stop(state,reason,next((v for v in records if v['stop']),records[0]),data);return 2
            if preflight and time.monotonic()-started>=seconds:
                state.write('preflight-ready.json',{'policy':policy,'observedSeconds':time.monotonic()-started,'status':'PASS','servicesStarted':False});return 0
            next_at+=interval;time.sleep(max(0,next_at-time.monotonic()))

def run(state,label,seconds,command,policy=LEGACY_POLICY):
    if not label.replace('-','').isalnum() or not 1<=seconds<=300 or not command or Path(command[0]).name not in ['node','pnpm','python3','docker']:raise RuntimeError('BOUNDED_COMMAND_REQUIRED')
    data,root=identity(state);env=json.loads((root/'environment.json').read_text())
    if env.get('CALLSIGN_ALLOW_EXTERNAL_EXECUTION')!='integration':raise RuntimeError('INTEGRATION_EXECUTION_BLOCKED')
    if Path(command[0]).name=='docker' and command[1:]!=['start',data['containerId']]:raise RuntimeError('ONLY_OWNED_DATABASE_START_ALLOWED')
    if Path(command[0]).name=='docker':db_info(data)
    env.update(CALLSIGN_HTTP_PROGRESS=str(state.directory/(label+'.progress.jsonl')),CALLSIGN_HTTP_PROGRESS_ROOT=str(state.directory))
    is_vitest=any('vitest' in part for part in command)
    if is_vitest:command=command+['--reporter=default','--reporter='+str(Path('tests/integration/progress-reporter.mjs').resolve())]
    log=state.directory/(label+'.log');start=time.monotonic();result=None
    with log.open('xb') as output:
        os.chmod(output.name,0o600)
        with state.locked():
            state.require_ready();watch=state.read('resource-watches.json')
            if not watch or process_start(watch['observerPid'])!=watch['observerStart'] or watch.get('policy',LEGACY_POLICY)!=policy or not 0<=time.monotonic_ns()-watch['fast']['previous']['monotonicNs']<=(7 if policy==PRESSURE_POLICY else 2)*1_000_000_000:raise RuntimeError('LIVE_RESOURCE_OBSERVER_REQUIRED')
            if time.monotonic_ns()>=data['deadlineMonotonicNs']-40_000_000_000:raise RuntimeError('RUN_DEADLINE_CLEANUP_RESERVE')
            if state.read('active-test.json'):raise RuntimeError('ONE_TEST_WORKER_ONLY')
            try:child=subprocess.Popen(command,env=env,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
            except OSError as error:
                state.write(label+'.result.json',dict(status='BLOCKED',reason='TOOL_UNAVAILABLE',errorType=type(error).__name__,executedTests=0));return 2
            state.write('active-test.json',{'pid':child.pid,'processStart':process_start(child.pid),'label':label,'launcherPid':os.getpid(),'launcherStart':process_start(os.getpid())})
        try:
            while child.poll() is None:
                if state.read('environment-stop.json'):break
                if time.monotonic()-start>seconds:
                    stop(state,'STEP_TIMEOUT',sample(state,data),data);break
                time.sleep(.1)
            if child.poll() is None:cancel_owned(state)
            code=child.wait(timeout=2)
            if not state.read('environment-stop.json'):
                tail=log.read_bytes()[-65536:]
                if b'heap out of memory' in tail or b'Reached heap limit' in tail:stop(state,'NODE_HEAP_OOM',sample(state,data),data)
                elif code==-signal.SIGKILL:stop(state,'PROCESS_SIGKILL_UNCLASSIFIED',sample(state,data),data)
            with state.locked():
                cause=state.read('environment-stop.json');product=partial(state)
                zero_tests=is_vitest and sum(product['counts'][k] for k in ['passed','failed'])==0
                result=dict(policy=policy,status='BLOCKED' if cause or zero_tests and code==0 else 'PASS' if code==0 else 'FAIL',reason=cause['reason'] if cause else 'ZERO_EXECUTED_TESTS' if zero_tests and code==0 else None,exitCode=code,environmentCause=cause,partial=product,durationSeconds=time.monotonic()-start,timeoutSeconds=seconds)
                state.write(label+'.result.json',result)
                (state.directory/'active-test.json').unlink()
        finally:
            if child.poll() is None:cancel_owned(state)
    print(json.dumps(result));return 2 if result['status']=='BLOCKED' else 0 if result['status']=='PASS' else 1

def database_preparation(state,action):
    # Only an already registered, monitored child may prepare its own new test database.
    from urllib.parse import urlparse,unquote
    import re
    active=state.read('active-test.json')
    if not active or active['pid']!=os.getpid() or active['processStart']!=process_start(os.getpid()):raise RuntimeError('GUARDED_PREPARATION_CHILD_REQUIRED')
    data,_=identity(state);db_info(data);url=urlparse(os.environ['TEST_DATABASE_URL'])
    if url.hostname!='127.0.0.1' or not re.fullmatch(r'/callsign_test_[A-Za-z0-9_]+',url.path) or url.username!='postgres':raise RuntimeError('NEW_OWNED_DATABASE_REQUIRED')
    env=dict(os.environ,PGPASSWORD=unquote(url.password or ''))
    command=['docker','exec','-i','--env','PGPASSWORD']
    if action=='provision-logins':command += [argument for key in ['ISSUER_DB_PASSWORD','AUTH_DB_PASSWORD','WORKER_DB_PASSWORD','PBX_DB_PASSWORD'] for argument in ['--env',key]]
    command += [data['containerId'],'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d',url.path[1:]]
    if action=='wait-database':
        deadline=time.monotonic()+20
        while time.monotonic()<deadline:
            state.require_ready();logs=subprocess.check_output(['docker','logs',data['containerId']],stderr=subprocess.STDOUT,timeout=3)
            if b'PostgreSQL init process complete; ready for start up.' in logs and logs.count(b'database system is ready to accept connections')>=2:
                subprocess.run(command,input=b'SELECT 1;',env=env,check=True,timeout=5,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);return 0
            time.sleep(.1)
        raise RuntimeError('FINAL_POSTGRES_NOT_READY')
    sql=Path('infra/deploy/provision-logins.sql').read_bytes()
    subprocess.run(command,input=sql,env=env,check=True,timeout=30,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);return 0

if __name__=='__main__':
    if len(sys.argv)<3:
        print('Usage: validation-resource-control.py observe NEW_PRIVATE_DIRECTORY | watch OWNED_RUN_DIRECTORY | run OWNED_RUN_DIRECTORY LABEL TIMEOUT_SECONDS COMMAND ... | cleanup OWNED_RUN_DIRECTORY');sys.exit(64)
    arguments=sys.argv[1:];policy=LEGACY_POLICY
    if '--policy' in arguments:
        index=arguments.index('--policy');policy=arguments[index+1];del arguments[index:index+2]
    if policy not in [LEGACY_POLICY,PRESSURE_POLICY]:raise RuntimeError('UNKNOWN_RESOURCE_POLICY')
    action,directory,*args=arguments;path=Path(directory)
    if action=='observe':
        if not path.exists():path.mkdir(mode=0o700,parents=False,exist_ok=False)
        elif any((path/name).exists() for name in ['resource-samples.jsonl','resource-watches.json','preflight-ready.json','environment-stop.json']):raise RuntimeError('NEW_OBSERVATION_DIRECTORY_REQUIRED')
    state=RunState(path,path.name)
    if action!='observe' and os.environ.get('CALLSIGN_ALLOW_EXTERNAL_EXECUTION')!='integration':raise RuntimeError('INTEGRATION_EXECUTION_BLOCKED')
    if action=='observe':sys.exit(observe(state,True,policy=policy))
    if action=='cleanup':
        data,_=identity(state);prior=state.read('environment-stop.json');stop(state,prior['reason'] if prior else 'NORMAL_COMPLETION',{'monotonicNs':time.monotonic_ns()},data);incomplete=bool(state.read('environment-cleanup.json')['errors']);state.write('finished.json',{'status':'CLEANUP_INCOMPLETE' if incomplete else 'BLOCKED' if prior else 'COMPLETED'});sys.exit(2 if incomplete else 0)
    state.require_ready()
    if state.read('identity.json') and identity(state)[0].get('resourcePolicy',LEGACY_POLICY)!=policy:raise RuntimeError('EXPLICIT_RESOURCE_POLICY_MISMATCH')
    if action in ['wait-database','provision-logins']:sys.exit(database_preparation(state,action))
    if action=='watch':sys.exit(observe(state,False,identity(state)[0],policy))
    if action=='run':sys.exit(run(state,args[0],int(args[1]),args[2:],policy))
    raise RuntimeError('UNKNOWN_RESOURCE_ACTION')
