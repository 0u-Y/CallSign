"""Read-only samples and the existing three-active-interval stop rule; no service startup."""
import os
import hashlib
import time
import math
from pathlib import Path

LEGACY_POLICY = "swap-activity-v1"
PRESSURE_POLICY = "integration-pressure-v1"

class SwapWatch:
    def __init__(self, policy=LEGACY_POLICY):
        if policy not in [LEGACY_POLICY, PRESSURE_POLICY]: raise ValueError("UNKNOWN_RESOURCE_POLICY")
        self.policy = policy
        self.pressure_consecutive = 0
        self.out_consecutive = 0
        self.previous = None
        self.consecutive = 0
        self.stopped = None

    def update(self, sample):
        if self.policy == PRESSURE_POLICY:
            required = [sample['monotonicNs'], sample['pageBytes'], sample['swapInPagesTotal'], sample['swapOutPagesTotal'], sample['memAvailableBytes'], sample['oomKillTotal']]
            required += [sample['memoryPSI'][kind][key] for kind in ['some','full'] for key in ['avg10','avg60','avg300','total']]
            if any(not isinstance(v,(int,float)) or not math.isfinite(v) or v<0 for v in required) or sample['pageBytes']==0: raise ValueError('INVALID_RESOURCE_OBSERVATION')
        previous, self.previous = self.previous, dict(sample)
        result = dict(sample, baseline=previous is None, consecutive=0, intervalSeconds=None,
                      swapInPages=None, swapOutPages=None, swapInMiBPerSecond=None, swapOutMiBPerSecond=None)
        if previous is not None:
            elapsed = (sample['monotonicNs'] - previous['monotonicNs']) / 1e9
            incoming, outgoing = sample['swapInPagesTotal']-previous['swapInPagesTotal'], sample['swapOutPagesTotal']-previous['swapOutPagesTotal']
            result.update(intervalSeconds=elapsed, swapInPages=incoming, swapOutPages=outgoing)
            invalid = 'HOST_COUNTER_RESET' if incoming < 0 or outgoing < 0 else 'OBSERVATION_IDENTITY_CHANGED' if elapsed <= 0 or sample['pageBytes'] != previous['pageBytes'] or sample.get('bootIdHash') != previous.get('bootIdHash') else None
            if invalid:
                self.consecutive = 0
                self.stopped = self.stopped or dict(reason=invalid, firstSatisfiedMonotonicNs=sample['monotonicNs'])
            else:
                result.update(swapInMiBPerSecond=incoming*sample['pageBytes']/1048576/elapsed,
                              swapOutMiBPerSecond=outgoing*sample['pageBytes']/1048576/elapsed)
                self.consecutive = self.consecutive+1 if incoming > 0 or outgoing > 0 else 0
                if self.policy == LEGACY_POLICY and self.consecutive >= 3:
                    self.stopped = self.stopped or dict(reason='SUSTAINED_SWAP', firstSatisfiedMonotonicNs=sample['monotonicNs'])
            result['consecutive'] = self.consecutive
        result['policy'] = self.policy
        if self.policy == PRESSURE_POLICY:
            pressure = sample['memoryPSI']['some']['avg10']>=10 or sample['memoryPSI']['full']['avg10']>=2
            self.pressure_consecutive = self.pressure_consecutive+1 if pressure else 0
            if previous is not None:
                result['oomKillDelta'] = sample['oomKillTotal']-previous['oomKillTotal']
                result['psiTotalDeltaMicroseconds'] = {kind:sample['memoryPSI'][kind]['total']-previous['memoryPSI'][kind]['total'] for kind in ['some','full']}
                if result['oomKillDelta']<0 or any(v<0 for v in result['psiTotalDeltaMicroseconds'].values()):
                    self.stopped = self.stopped or dict(reason='HOST_COUNTER_RESET',firstSatisfiedMonotonicNs=sample['monotonicNs'])
                elif result['oomKillDelta']>0:
                    self.stopped = self.stopped or dict(reason='HOST_OOM_KILL',firstSatisfiedMonotonicNs=sample['monotonicNs'])
            self.out_consecutive = self.out_consecutive+1 if (result['swapOutMiBPerSecond'] or 0)>=5 else 0
            result.update(pressureConsecutive=self.pressure_consecutive,swapOutConsecutive=self.out_consecutive)
            reason = 'SUSTAINED_MEMORY_PSI' if self.pressure_consecutive>=3 else 'SUSTAINED_SWAP_OUT' if self.out_consecutive>=3 else None
            if reason:self.stopped = self.stopped or dict(reason=reason,firstSatisfiedMonotonicNs=sample['monotonicNs'])
        if sample['memAvailableBytes'] < 8*1024**3:
            self.stopped = self.stopped or dict(reason='HOST_MEMORY_RESERVE', firstSatisfiedMonotonicNs=sample['monotonicNs'])
        result['stop'] = self.stopped
        return result

    def require_ready(self):
        if self.stopped:
            raise RuntimeError('ENVIRONMENT_BLOCKED:'+self.stopped['reason'])


def host_sample():
    memory = {k:int(v.split()[0])*1024 for k,v in (line.split(':',1) for line in Path('/proc/meminfo').read_text().splitlines())}
    counters = dict(line.split() for line in Path('/proc/vmstat').read_text().splitlines())
    psi = None
    try:
        psi = {line.split()[0]:{k:float(v) for k,v in (p.split('=') for p in line.split()[1:])} for line in Path('/proc/pressure/memory').read_text().splitlines()}
    except (FileNotFoundError, PermissionError):
        pass
    observer_rss = int(next(line for line in Path('/proc/self/status').read_text().splitlines() if line.startswith('VmRSS:')).split()[1])*1024
    return dict(bootIdHash=hashlib.sha256(Path('/proc/sys/kernel/random/boot_id').read_bytes()).hexdigest(),clock='linux-CLOCK_MONOTONIC',observerPid=os.getpid(),observerRssBytes=observer_rss,monotonicNs=time.monotonic_ns(), pageBytes=os.sysconf('SC_PAGE_SIZE'),
                oomKillTotal=int(counters['oom_kill']),swapInPagesTotal=int(counters['pswpin']), swapOutPagesTotal=int(counters['pswpout']),
                memAvailableBytes=memory['MemAvailable'], memoryPSI=psi)

def budget_reason(sample, deadline_ns=None):
    if sample['ownedProcessRssBytes']+sample['observerRssBytes']>3*1024**3:return 'APP_MEMORY_BUDGET'
    if sample['temporaryTotalUpperBoundBytes']>5*1024**3:return 'DISK_BUDGET'
    if sample.get('containerOomKilled'):return 'CONTAINER_OOM'
    if sample.get('databaseUnexpectedlyStopped'):return 'DATABASE_STOPPED'
    if deadline_ns is not None and sample['monotonicNs']>=deadline_ns-40_000_000_000:return 'RUN_DEADLINE_CLEANUP_RESERVE'
    return None

UI_PROFILE = 'ui-only-v1'

def ui_budget_reason(sample, deadline_ns=None, startup=False):
    return ('UI_START_MEMORY' if startup and sample['memAvailableBytes']<24*1024**3 else
            'UI_HOST_MEMORY_RESERVE' if sample['memAvailableBytes']<16*1024**3 else
            'UI_TOTAL_MEMORY_BUDGET' if sample['ownedProcessRssBytes']+sample['observerRssBytes']+(sample.get('containerMemoryBytes') or 0)>4*1024**3 else
            'UI_DEADLINE_CLEANUP_RESERVE' if deadline_ns is not None and sample['monotonicNs']>=deadline_ns-600_000_000_000 else
            budget_reason(sample,deadline_ns))

# This latch belongs to one owned test directory, not the host or a production service.
import json
import signal
import subprocess
import tempfile
import fcntl
from contextlib import contextmanager

class RunState:
    def __init__(self, directory, run_id):
        self.directory = Path(directory).resolve()
        info = self.directory.stat()
        if info.st_uid != os.getuid() or info.st_mode & 0o077 or not run_id:
            raise RuntimeError('OWNED_PRIVATE_RUN_DIRECTORY_REQUIRED')
        self.run_id = run_id

    @contextmanager
    def locked(self):
        with (self.directory/'resource.lock').open('a') as lock:
            os.chmod(lock.name,0o600)
            fcntl.flock(lock,fcntl.LOCK_EX)
            yield

    def read(self, name):
        path = self.directory/name
        if path.is_symlink():
            raise RuntimeError('RUN_STATE_SYMLINK_FORBIDDEN')
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        if data.get('runId') != self.run_id:
            raise RuntimeError('RUN_STATE_IDENTITY_MISMATCH')
        return data

    def write(self, name, value):
        with tempfile.NamedTemporaryFile(mode='w',dir=self.directory,delete=False) as output:
            json.dump(dict(value,runId=self.run_id),output)
            output.flush();os.fsync(output.fileno())
        os.replace(output.name,self.directory/name)

    def require_ready(self):
        stop = self.read('environment-stop.json')
        if stop:
            raise RuntimeError('ENVIRONMENT_BLOCKED:'+stop['reason'])


def process_start(pid):
    try:
        # comm may contain spaces; the remaining fields start at Linux stat field 3.
        fields = Path(f'/proc/{pid}/stat').read_text().rsplit(')',1)[1].split()
        return None if fields[0] == 'Z' else fields[19]
    except (FileNotFoundError, ProcessLookupError):
        return None


def owned_processes(pid, start):
    leader = process_start(pid)
    if leader is not None and leader != start:
        return []
    parents, starts, session_members = {}, {}, []
    for path in Path('/proc').glob('[0-9]*/stat'):
        try:
            fields=path.read_text().rsplit(')',1)[1].split();identity=int(path.parent.name)
            if fields[0]=='Z':continue
            parents.setdefault(int(fields[1]),[]).append(identity);starts[identity]=fields[19]
            if int(fields[3])==pid:session_members.append(identity)
        except (OSError,ValueError,IndexError):continue
    seen, stack = set(), ([pid] if leader is not None else [])+session_members
    while stack:
        current=stack.pop()
        if current not in seen:seen.add(current);stack.extend(parents.get(current,[]))
    return [dict(pid=current,processStart=starts[current]) for current in seen if current in starts]


def active_processes(active):
    known=active.get('ownedProcesses',[])+owned_processes(active['pid'],active['processStart'])
    return list({(p['pid'],p['processStart']):p for p in known if p['pid']!=active.get('launcherPid') and process_start(p['pid'])==p['processStart']}.values())


def process_rss(processes):
    total=0
    for child in processes:
        if process_start(child['pid'])!=child['processStart']:continue
        try:
            status=Path(f"/proc/{child['pid']}/status").read_text()
            total+=int(next(line for line in status.splitlines() if line.startswith('VmRSS:')).split()[1])*1024
        except (FileNotFoundError,ProcessLookupError,StopIteration):pass
    return total

def owned_rss(pid,start):
    return process_rss(owned_processes(pid,start))


def cancel_owned(state):
    active=state.read('active-test.json')
    if not active:return
    children=active_processes(active)
    orphaned=process_start(active['pid'])!=active['processStart'] and bool(children)
    active['ownedProcesses']=children;state.write('active-test.json',active)
    def refresh():
        active['ownedProcesses']=children
        children[:]=active_processes(active)
        state.write('active-test.json',active)
        return children
    if process_start(active['pid'])==active['processStart']:
        if os.getpgid(active['pid'])!=active['pid']:raise RuntimeError('OWNED_PROCESS_GROUP_REQUIRED')
        try:os.kill(active['pid'],signal.SIGINT)
        except ProcessLookupError:pass
    # The runner closes apps/browser first; registered descendants are only forced after grace.
    for sig, wait in ([(signal.SIGTERM,2),(signal.SIGKILL,1)] if orphaned else [(None,8),(signal.SIGTERM,2),(signal.SIGKILL,1)]):
        remaining=refresh()
        if not remaining:
            # A /proc snapshot may predate the last helper fork but observe its parent already exited.
            remaining=refresh()
            if not remaining:return orphaned
        if sig:
            for child in remaining:
                try:os.kill(child['pid'],sig)
                except ProcessLookupError:pass
        deadline=time.monotonic()+wait
        while time.monotonic()<deadline and refresh():time.sleep(.05)
    if refresh():raise RuntimeError('OWNED_PROCESS_CLEANUP_INCOMPLETE')
    return orphaned


def stop_environment(state, reason, observation, cancel, preserve, close_apps, stop_db):
    with state.locked():
        first = state.read('environment-stop.json')
        if not first:
            first = dict(reason=reason,firstSatisfiedMonotonicNs=observation['monotonicNs'],observation=observation)
            state.write('environment-stop.json',first)
        steps, errors, partial = [], [], None
        for name, action in [('cancel-test',cancel),('preserve-partial-results',preserve),('close-apps-browser',close_apps),('stop-owned-database',stop_db)]:
            if name == 'stop-owned-database' and any(e['step'] in ['cancel-test','close-apps-browser'] for e in errors):
                steps.append(dict(step=name,status='BLOCKED_BY_ACTIVE_PROCESS',monotonicNs=time.monotonic_ns()))
                continue
            steps.append(dict(step=name,monotonicNs=time.monotonic_ns()))
            try:
                value = action()
                if name=='preserve-partial-results':partial=value
            except Exception as error:
                errors.append(dict(step=name,error=type(error).__name__))
        state.write('environment-cleanup.json',dict(reason=first['reason'],steps=steps,errors=errors,partial=partial))
        return first
