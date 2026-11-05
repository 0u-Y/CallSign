from pathlib import Path
import sys,json,time,subprocess,os,signal,re,threading,datetime,tempfile,stat
sys.path.insert(0,str(Path(__file__).resolve().parent));from validation_resources import host_sample,SwapWatch,PRESSURE_POLICY,owned_rss,process_start
def scoped_tailscale(root,*args):
 if not root.is_absolute() or not args or args[0] not in ['up','status'] or any(a.startswith('--socket') for a in args):raise ValueError('OWNED_SOCKET_COMMAND_REQUIRED')
 return ['/usr/bin/tailscale','--socket='+str(root/'daemon.sock'),*args]

def private_socket(root):
 path=root/'daemon.sock'
 if not root.is_absolute() or len(os.fsencode(path))>=100:raise ValueError('SHORT_PRIVATE_SOCKET_REQUIRED')
 return path

def isolated_process_environment(logs):
 return {**{k:os.environ[k]for k in ['PATH','LANG','LC_ALL','TZ']if k in os.environ},'TS_LOGS_DIR':str(logs)}

import argparse
parser=argparse.ArgumentParser(description='Prepare a separate userspace Tailscale enrollment. No global daemon, public listener or backend is configured.')
parser.add_argument('--apply',action='store_true');parser.add_argument('--output');parser.add_argument('--deadline',type=float);parser.add_argument('--resume-identity');args=parser.parse_args()
if not args.apply:
 print(json.dumps({'mode':'plan','scope':'Isolated userspace ingress enrollment only; no global service mutation, download, backend or public listener','required':['explicit ingress approval','installed tailscale/tailscaled','new directory under a private owned parent','24GiB start / 16GiB reserve / host3GiB / whole4GiB / existing pressure policy','interactive node approval; no existing credential store access'],'next':'--apply --output PRIVATE_NEW_PATH requires infrastructure guard and ISOLATED-USERSPACE-ONLY confirmation'}));raise SystemExit(0)
if os.environ.get('CALLSIGN_ALLOW_EXTERNAL_EXECUTION')!='infrastructure' or os.environ.get('CALLSIGN_INGRESS_CONFIRMATION')!='ISOLATED-USERSPACE-ONLY':raise SystemExit('ISOLATED_INGRESS_APPROVAL_REQUIRED')
if not args.output:raise SystemExit('NEW_PRIVATE_OUTPUT_REQUIRED')
r=Path(args.output).absolute();parent=r.parent.lstat()
if not r.name or r.exists() or r.is_symlink() or not r.parent.is_dir() or r.parent.is_symlink() or parent.st_uid!=os.getuid() or parent.st_mode&0o077:raise SystemExit('NEW_OWNED_PRIVATE_PARENT_REQUIRED')
for binary in ['/usr/sbin/tailscaled','/usr/bin/tailscale']:
 if not Path(binary).is_file():raise SystemExit('INSTALLED_TAILSCALE_REQUIRED_NO_DOWNLOAD')
maximum_deadline=time.monotonic()+45*60;deadline=maximum_deadline if args.deadline is None else args.deadline
if not time.monotonic()+600<deadline<=maximum_deadline:raise SystemExit('BOUNDED_DEADLINE_REQUIRED')
identity_root=Path(args.resume_identity).absolute()if args.resume_identity else r
if args.resume_identity:
 info=identity_root.lstat();marker=identity_root/'identity.json';meta=marker.lstat()
 if not identity_root.is_dir()or identity_root.is_symlink()or info.st_uid!=os.getuid()or info.st_mode&0o077 or not stat.S_ISREG(meta.st_mode)or meta.st_uid!=os.getuid()or meta.st_mode&0o077:raise SystemExit('OWNED_INGRESS_IDENTITY_REQUIRED')
 identity=json.loads(marker.read_text())
 if identity.get('format')!='callsign-isolated-ingress-v1'or identity.get('root')!=str(identity_root):raise SystemExit('OWNED_INGRESS_IDENTITY_REQUIRED')
 if(identity_root/'resource-stop.json').exists():raise SystemExit('INGRESS_RESOURCE_STOP_LATCHED_REVIEW_REQUIRED')
else:identity={'format':'callsign-isolated-ingress-v1','root':str(r),'hostname':'callsign-demo-'+r.name[-7:].lower()}
state=identity_root/'state'
if args.resume_identity:
 info=state.lstat()
 if not state.is_dir()or state.is_symlink()or info.st_uid!=os.getuid()or info.st_mode&0o077:raise SystemExit('OWNED_PRIVATE_STATE_REQUIRED')
r.mkdir(mode=0o700)
if not args.resume_identity:
 state.mkdir(mode=0o700);(r/'identity.json').write_text(json.dumps(identity));(r/'identity.json').chmod(0o600)
logs=r/'logs';logs.mkdir(mode=0o700);watch=SwapWatch(PRESSURE_POLICY);children=[];result={'status':'NOT_RUN'};events=(r/'resource-samples.jsonl').open('x');os.chmod(r/'resource-samples.jsonl',0o600)
plan={'scope':'One isolated userspace ingress enrollment, no application/backend/OIDC/chain/media services or existing daemon mutation','authorization':'Caller must hold explicit isolated ingress approval; guards do not grant permission. No firewall/NAT/global changes','resourceProfile':'Lightweight enrollment thresholds; not a full-stack or persistent-service policy','startGiB':24,'reserveGiB':16,'hostGiB':3,'wholeGiB':4,'deadlineMonotonic':deadline,'cleanupReserveSeconds':600,'enrollmentWaitSeconds':300,'automaticRetry':False,'persistentBackendCreated':False,'identityRoot':str(identity_root),'resumesExistingNode':bool(args.resume_identity)};(r/'plan.json').write_text(json.dumps(plan,indent=2))
def stop_on(reason):
 if children:
  latch=identity_root/'resource-stop.json'
  if not latch.exists():
   with latch.open('x')as record:record.write(json.dumps({'reason':reason,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'owned ingress enrollment only'}))
   latch.chmod(0o600)
 raise RuntimeError(reason)

def sample():
 try:row=watch.update(host_sample())
 except Exception:stop_on('MANDATORY_OBSERVATION_FAILED')
 rss=row['observerRssBytes']+sum(owned_rss(p.pid,i)for p,i in children if p.poll()is None);row['hostOwnedBytes']=rss;events.write(json.dumps(row)+'\n');events.flush()
 if row['stop']:stop_on(row['stop']['reason'])
 if row['memAvailableBytes']<16*1024**3:stop_on('RESERVE_16_GIB')
 if rss>3*1024**3:stop_on('HOST_3_GIB')
 if time.monotonic()>=deadline-600:stop_on('CLEANUP_RESERVE')
 if sum(x.stat().st_size for x in r.rglob('*')if x.is_file()and not x.is_symlink())>=5*1024**3:stop_on('DISK_LIMIT')
 return row

def start(args):
 p=subprocess.Popen(args,env=isolated_process_environment(logs),stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True,text=True);children.append((p,process_start(p.pid)));return p

socket_dir=None;daemon=None
try:
 first=sample();(r/'initial-sample.json').write_text(json.dumps(first,indent=2))
 if first['memAvailableBytes']<24*1024**3:raise RuntimeError('START_24_GIB')
 begin=time.monotonic()
 while time.monotonic()-begin<60:time.sleep(5);sample()
 socket_dir=Path(tempfile.mkdtemp(prefix='cs-ingress-',dir='/tmp'));socket=private_socket(socket_dir)
 daemon=start(['/usr/sbin/tailscaled','--tun=userspace-networking','--state='+str(state/'tailscaled.state'),'--statedir='+str(state),'--socket='+str(socket),'--port=0','--no-logs-no-support','--encrypt-state=false'])
 def drain():
  with (r/'daemon-sanitized.log').open('x')as log:
   os.chmod(r/'daemon-sanitized.log',0o600)
   for line in daemon.stdout:
    if log.tell()<10*1024**2:log.write(re.sub(r'https://(?:login|controlplane)\.tailscale\.com/\S+','[PROTECTED_ENROLLMENT_URL]',line));log.flush()
 threading.Thread(target=drain,daemon=True).start();began=time.monotonic()
 while not socket.exists():
  sample()
  if daemon.poll()is not None:raise RuntimeError('OWNED_DAEMON_START_FAILED')
  if time.monotonic()-began>=10:stop_on('OWNED_SOCKET_TIMEOUT')
  time.sleep(.25)
 up=start(scoped_tailscale(socket_dir,'up','--hostname='+identity['hostname'],'--accept-dns=false','--accept-routes=false','--netfilter-mode=off','--ssh=false','--snat-subnet-routes=false','--timeout=20s','--json'))
 began=time.monotonic()
 while up.poll()is None:
  sample()
  if time.monotonic()-began>=30:stop_on('UP_TIMEOUT')
  time.sleep(1)
 raw=up.stdout.read();matches=re.findall(r'https://login\.tailscale\.com/a/[A-Za-z0-9]+',raw)
 if matches:
  link=r/'enrollment-url.protected.txt';link.write_text(matches[0]+'\n');link.chmod(0o600);print(json.dumps({'status':'USER_NODE_APPROVAL_REQUIRED','protectedEnrollmentReference':str(link),'oldDaemonUntouched':True}),flush=True)
 begin=time.monotonic()
 while time.monotonic()-begin<300:
  sample()
  if daemon.poll()is not None:raise RuntimeError('OWNED_DAEMON_EXITED')
  status=subprocess.run(scoped_tailscale(socket_dir,'status','--json'),capture_output=True,text=True,timeout=5)
  if status.returncode==0:
   body=json.loads(status.stdout)
   if body.get('BackendState')=='Running':
    result={'status':'ISOLATED_NODE_ENROLLED_NOT_PUBLIC_BACKEND','dnsName':body.get('Self',{}).get('DNSName'),'funnel':'NOT_ENABLED_NO_BACKEND_TARGET','media':'NOT_TESTED','actualPublicOidc':'NOT_CONFIGURED'};break
  time.sleep(5)
 else:result={'status':'USER_NODE_APPROVAL_REQUIRED','protectedEnrollmentReference':str(r/'enrollment-url.protected.txt'),'noPublicServiceCreated':True}
except Exception as e:result={'status':'BLOCKED','reason':str(e)[:300],'automaticRetry':False}
finally:
 cleanup_errors=[]
 for p,identity in reversed(children):
  if p.poll()is None:
   try:
    if process_start(p.pid)!=identity:raise RuntimeError('OWNED_PROCESS_IDENTITY_MISMATCH')
    os.killpg(p.pid,signal.SIGTERM)
    try:p.wait(timeout=10)
    except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=5)
   except ProcessLookupError:pass
   except Exception as error:cleanup_errors.append({'pid':p.pid,'errorType':type(error).__name__})
 if socket_dir and all(p.poll()is not None for p,_ in children):
  try:
   if socket.exists():
    info=socket.lstat()
    if not stat.S_ISSOCK(info.st_mode)or info.st_uid!=os.getuid():raise RuntimeError('OWNED_SOCKET_IDENTITY_MISMATCH')
    socket.unlink()
   socket_dir.rmdir()
  except Exception as error:cleanup_errors.append({'resource':'privateSocketDirectory','errorType':type(error).__name__})
 events.close();result.update({'ownedProcessesStopped':not cleanup_errors and all(p.poll()is not None for p,_ in children),'cleanupErrors':cleanup_errors,'ownedStatePreserved':True,'identityRoot':str(identity_root),'existingDaemonNeverAddressed':True,'persistentBackendCreated':False});(r/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
raise SystemExit(0 if result['status']=='ISOLATED_NODE_ENROLLED_NOT_PUBLIC_BACKEND' and result['ownedProcessesStopped'] else 78 if result['status']=='BLOCKED' else 3)
