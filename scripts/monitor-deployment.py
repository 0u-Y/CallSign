"""Observe one approved persistent deployment; stop only its validated containers."""
import argparse
import datetime
import json
import os
from pathlib import Path
import subprocess
import signal
import time

from validation_resources import host_sample, SwapWatch, PRESSURE_POLICY, process_start


def resource_reason(sample, owned_bytes, expires_ns):
    if sample['stop']:
        return sample['stop']['reason']
    if sample['memAvailableBytes'] < 16 * 1024**3:
        return 'HOST_16_GIB_RESERVE'
    if owned_bytes > 16 * 1024**3:
        return 'DEPLOYMENT_16_GIB_BUDGET'
    if sample['monotonicNs'] >= expires_ns:
        return 'APPROVED_PERIOD_ENDED'
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if os.environ.get('CALLSIGN_ALLOW_EXTERNAL_EXECUTION') != 'infrastructure':
        raise SystemExit('PERSISTENT_DEPLOYMENT_APPROVAL_REQUIRED')
    root = Path(args.output).absolute()
    parent = root.parent.lstat()
    if root.exists() or root.parent.is_symlink() or parent.st_uid != os.getuid() or parent.st_mode & 0o077:
        raise SystemExit('NEW_OWNED_PRIVATE_MONITOR_DIRECTORY_REQUIRED')
    root.mkdir(mode=0o700)
    env_file = str(Path(args.env_file).absolute())
    control = str(Path(__file__).with_name('deployment-control.mjs').resolve())
    safe_env = {k: os.environ[k] for k in ['PATH', 'LANG', 'TZ'] if k in os.environ}
    def command(action):
        return subprocess.check_output(['node', control, action, env_file, 'docker', 'compose'],
                                       env=safe_env, timeout=75, stderr=subprocess.PIPE, text=True)
    command('check')
    watch = SwapWatch(PRESSURE_POLICY)
    # Starting the expiry clock now gives at most the approved 24h, including preparation.
    expires_ns = time.monotonic_ns() + 24 * 3600 * 10**9
    reason = None
    ready = False
    log = root / 'resources.jsonl'
    phase = 'host-observation'
    error_type = None
    def interrupted(_signum, _frame):
        raise RuntimeError('MONITOR_INTERRUPTED')
    signal.signal(signal.SIGTERM, interrupted)
    try:
        began = time.monotonic()
        while True:
            phase = 'host-observation'
            row = watch.update(host_sample())
            if not (root / 'initial-sample.json').exists():
                (root / 'initial-sample.json').write_text(json.dumps(row) + '\n')
            phase = 'owned-container-status'
            status = json.loads(command('status'))
            if status['resourceStopLatched']:
                raise RuntimeError('RESOURCE_STOP_LATCHED')
            containers = []
            owned_bytes = row['observerRssBytes']
            for service in status['services']:
                phase = 'owned-container-memory'
                cid = service['id']
                details = json.loads(subprocess.check_output(['docker', 'inspect', '--format',
                    '{"id":{{json .Id}},"pid":{{.State.Pid}},"oom":{{.State.OOMKilled}},"memory":{{.HostConfig.Memory}},"swap":{{.HostConfig.MemorySwap}},"restart":{{json .HostConfig.RestartPolicy.Name}}}',
                    cid], env=safe_env, timeout=10, stderr=subprocess.PIPE, text=True))
                if details['id'] != cid or details['oom']:
                    raise RuntimeError('OWNED_CONTAINER_IDENTITY_OR_OOM')
                if not details['memory'] or details['swap'] != details['memory'] or details['restart'] != 'no':
                    raise RuntimeError('OWNED_CONTAINER_LIMITS_REQUIRED')
                used = 0
                if details['pid']:
                    pid = details['pid']
                    start = process_start(pid)
                    group = next(s.split(':', 2)[2] for s in Path(f'/proc/{pid}/cgroup').read_text().splitlines() if s.startswith('0::'))
                    cg = Path('/sys/fs/cgroup') / group.lstrip('/')
                    used = int((cg / 'memory.current').read_text())
                    events = dict(line.split() for line in (cg / 'memory.events').read_text().splitlines())
                    if int(events.get('oom', 0)) or int(events.get('oom_kill', 0)):
                        raise RuntimeError('OWNED_CGROUP_OOM')
                    if process_start(pid) != start:
                        raise RuntimeError('OWNED_PROCESS_CHANGED_DURING_OBSERVATION')
                owned_bytes += used
                containers.append({'id': cid, 'service': service['service'], 'memoryBytes': used})
            row.update(ownedBytes=owned_bytes, containers=containers)
            if log.exists() and log.stat().st_size >= 10 * 1024**2:
                (root / 'resources.previous.jsonl').unlink(missing_ok=True)
                log.rename(root / 'resources.previous.jsonl')
            with log.open('a') as output:
                output.write(json.dumps(row) + '\n')
            reason = resource_reason(row, owned_bytes, expires_ns)
            if not ready and row['memAvailableBytes'] < 32 * 1024**3:
                reason = reason or 'START_32_GIB_REQUIRED'
            if reason:
                break
            if not ready and time.monotonic() - began >= 60:
                (root / 'ready.json').write_text(json.dumps({'pid': os.getpid(), 'processStart': process_start(os.getpid()),
                    'deploymentId': status['deploymentId'], 'expiresMonotonicNs': expires_ns,
                    'scope': 'Resource preflight only; not application readiness'}) + '\n')
                ready = True
            time.sleep(5)
    except BaseException as error:
        reason = str(error) if isinstance(error, RuntimeError) else 'MANDATORY_OBSERVATION_FAILED'
        error_type = type(error).__name__
    finally:
        record = {'reason': reason, 'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'phase': phase, 'errorType': error_type, 'automaticRestart': False, 'containersStopped': False}
        (root / 'stop.json').write_text(json.dumps(record) + '\n')
        errors = []
        for action in ['latch', 'stop']:
            try:
                command(action)
                if action == 'stop':
                    record['containersStopped'] = True
            except Exception as error:
                errors.append({'action': action, 'errorType': type(error).__name__})
        record['cleanupErrors'] = errors
        (root / 'stop.json').write_text(json.dumps(record) + '\n')
        if errors:
            raise SystemExit(78)


if __name__ == '__main__':
    main()
