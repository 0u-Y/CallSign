from pathlib import Path
import sys,json,time,subprocess,os,signal,re,threading,datetime
sys.path.insert(0,str(Path(__file__).resolve().parent));from validation_resources import host_sample,SwapWatch,PRESSURE_POLICY,owned_rss,process_start
def scoped_tailscale(root,*args):
 if not root.is_absolute() or not args or args[0] not in ['up','status'] or any(a.startswith('--socket') for a in args):raise ValueError('OWNED_SOCKET_COMMAND_REQUIRED')
 return ['/usr/bin/tailscale','--socket='+str(root/'daemon.sock'),*args]

import argparse
parser=argparse.ArgumentParser(description='Prepare a separate userspace Tailscale enrollment. No global daemon, public listener or backend is configured.')
parser.add_argument('--apply',action='store_true');parser.add_argument('--output');args=parser.parse_args()
if not args.apply:
 print(json.dumps({'mode':'plan','scope':'Isolated userspace ingress enrollment only; no global service mutation, download, backend or public listener','required':['explicit ingress approval','installed tailscale/tailscaled','new directory under a private owned parent','24GiB start / 16GiB reserve / host3GiB / whole4GiB / existing pressure policy','interactive node approval; no existing credential store access'],'next':'--apply --output PRIVATE_NEW_PATH requires infrastructure guard and ISOLATED-USERSPACE-ONLY confirmation'}));raise SystemExit(0)
if os.environ.get('CALLSIGN_ALLOW_EXTERNAL_EXECUTION')!='infrastructure' or os.environ.get('CALLSIGN_INGRESS_CONFIRMATION')!='ISOLATED-USERSPACE-ONLY':raise SystemExit('ISOLATED_INGRESS_APPROVAL_REQUIRED')
if not args.output:raise SystemExit('NEW_PRIVATE_OUTPUT_REQUIRED')
r=Path(args.output).absolute();parent=r.parent.lstat()
if not r.name or r.exists() or r.is_symlink() or not r.parent.is_dir() or r.parent.is_symlink() or parent.st_uid!=os.getuid() or parent.st_mode&0o077:raise SystemExit('NEW_OWNED_PRIVATE_PARENT_REQUIRED')
for binary in ['/usr/sbin/tailscaled','/usr/bin/tailscale']:
 if not Path(binary).is_file():raise SystemExit('INSTALLED_TAILSCALE_REQUIRED_NO_DOWNLOAD')
r.mkdir(mode=0o700);state=r/'state';state.mkdir(mode=0o700);deadline=time.monotonic()+45*60;watch=SwapWatch(PRESSURE_POLICY);children=[];result={'status':'NOT_RUN'};events=(r/'resource-samples.jsonl').open('x');os.chmod(r/'resource-samples.jsonl',0o600)
plan={'scope':'One isolated userspace ingress enrollment, no application/backend/OIDC/chain/media services or existing daemon mutation','authorization':'Caller must hold explicit isolated ingress approval; guards do not grant permission. No firewall/NAT/global changes','resourceProfile':'Lightweight enrollment thresholds; not a full-stack or persistent-service policy','startGiB':24,'reserveGiB':16,'hostGiB':3,'wholeGiB':4,'deadlineMonotonic':deadline,'cleanupReserveSeconds':600,'enrollmentWaitSeconds':300,'automaticRetry':False,'persistentBackendCreated':False};(r/'plan.json').write_text(json.dumps(plan,indent=2))
def sample():
 row=watch.update(host_sample());rss=row['observerRssBytes']+sum(owned_rss(p.pid,i)for p,i in children if p.poll()is None);row['hostOwnedBytes']=rss;events.write(json.dumps(row)+'\n');events.flush();assert not row['stop'],row['stop'];assert row['memAvailableBytes']>=16*1024**3,'RESERVE_16_GIB';assert rss<=3*1024**3,'HOST_3_GIB';assert time.monotonic()<deadline-600,'CLEANUP_RESERVE';assert sum(x.stat().st_size for x in r.rglob('*')if x.is_file()and not x.is_symlink())<5*1024**3,'DISK_LIMIT';return row

def start(args):
 p=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True,text=True);children.append((p,process_start(p.pid)));return p

socket=r/'daemon.sock';daemon=None
try:
 first=sample();(r/'initial-sample.json').write_text(json.dumps(first,indent=2));assert first['memAvailableBytes']>=24*1024**3,'START_24_GIB';begin=time.monotonic()
 while time.monotonic()-begin<60:time.sleep(5);sample()
 daemon=start(['/usr/sbin/tailscaled','--tun=userspace-networking','--state='+str(state/'tailscaled.state'),'--statedir='+str(state),'--socket='+str(socket),'--port=0','--no-logs-no-support','--encrypt-state=false'])
 def drain():
  with (r/'daemon-sanitized.log').open('x')as log:
   os.chmod(r/'daemon-sanitized.log',0o600)
   for line in daemon.stdout:
    if log.tell()<10*1024**2:log.write(re.sub(r'https://(?:login|controlplane)\.tailscale\.com/\S+','[PROTECTED_ENROLLMENT_URL]',line));log.flush()
 threading.Thread(target=drain,daemon=True).start();began=time.monotonic()
 while not socket.exists():sample();assert daemon.poll()is None,'OWNED_DAEMON_START_FAILED';assert time.monotonic()-began<10,'OWNED_SOCKET_TIMEOUT';time.sleep(.25)
 up=start(scoped_tailscale(r,'up','--hostname=callsign-demo-'+r.name[-7:].lower(),'--accept-dns=false','--accept-routes=false','--netfilter-mode=off','--ssh=false','--snat-subnet-routes=false','--timeout=20s','--json'))
 began=time.monotonic()
 while up.poll()is None:sample();assert time.monotonic()-began<30,'UP_TIMEOUT';time.sleep(1)
 raw=up.stdout.read();matches=re.findall(r'https://login\.tailscale\.com/a/[A-Za-z0-9]+',raw)
 if matches:
  link=r/'enrollment-url.protected.txt';link.write_text(matches[0]+'\n');link.chmod(0o600);print(json.dumps({'status':'USER_NODE_APPROVAL_REQUIRED','protectedEnrollmentReference':str(link),'oldDaemonUntouched':True}),flush=True)
 begin=time.monotonic()
 while time.monotonic()-begin<300:
  sample();assert daemon.poll()is None,'OWNED_DAEMON_EXITED'
  status=subprocess.run(scoped_tailscale(r,'status','--json'),capture_output=True,text=True,timeout=5)
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
 events.close();result.update({'ownedProcessesStopped':not cleanup_errors and all(p.poll()is not None for p,_ in children),'cleanupErrors':cleanup_errors,'ownedStatePreserved':True,'existingDaemonNeverAddressed':True,'persistentBackendCreated':False});(r/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
raise SystemExit(0 if result['status']=='ISOLATED_NODE_ENROLLED_NOT_PUBLIC_BACKEND' and result['ownedProcessesStopped'] else 78 if result['status']=='BLOCKED' else 3)
