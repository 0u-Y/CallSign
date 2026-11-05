"""Bounded NEW delivery-only rehearsal setup. No host network, ports, installs or cloud operations."""
import argparse,sys,os,json,subprocess,hashlib,tarfile,secrets,uuid,time,shutil,base64,hmac,wave,struct,math
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--delivery',type=Path,required=True)
p.add_argument('--root',type=Path,required=True)
p.add_argument('--browser-cache',type=Path,required=True,help='Observer-only installed Chromium directory')
p.add_argument('--apply',action='store_true')
p.add_argument('--resume',action='store_true')
p.add_argument('--start-policy',choices=['full-40-gib','staged-memory-v1'],default='full-40-gib')
options=p.parse_args();r=options.root.resolve();delivery=options.delivery.resolve();run=r.name
if not run.startswith('media-delivery-') or not r.is_relative_to(Path.cwd().resolve()/'.local'):raise SystemExit('OWNED_LOCAL_REHEARSAL_ROOT_REQUIRED')
if not options.apply:
 print(json.dumps({'mode':'dry-run','scope':'NEW disposable local delivery-only stack; AWS override is NOT executed','services':'Besu4, registry deployer, Witness4, application/Anchor PostgreSQL, HTTPS Anchor, Asterisk/TURN; observer controller','guard':'integration; no bridge, port publish, host networking or image pull','next':'--apply starts only owned resources; --resume verifies completed stages without regenerating identity'}));raise SystemExit(0)
if os.environ.get('CALLSIGN_ALLOW_EXTERNAL_EXECUTION')!='integration':raise SystemExit('INTEGRATION_EXECUTION_BLOCKED')
if os.getuid()!=1000:raise SystemExit('REHEARSAL_REQUIRES_MATCHING_IMAGE_UID_1000_NO_HOST_CHOWN')
if sys.version_info<(3,12) or not shutil.which('docker'):raise SystemExit('PYTHON_312_AND_INSTALLED_DOCKER_REQUIRED')
for required in ['tests/integration/runtime-media.test.ts','tests/integration/service-http-fixture.ts','tests/media/analysis-path.ts','vitest.http.config.ts','/usr/lib/x86_64-linux-gnu','/usr/share/fonts','/etc/fonts']:
 if not Path(required).exists():raise SystemExit('OBSERVER_INPUT_MISSING:'+required)
if not (options.browser_cache/'chromium-1243/chrome-linux64/chrome').is_file():raise SystemExit('INSTALLED_OBSERVER_CHROMIUM_REQUIRED_NO_DOWNLOAD')
mem={k:int(v.split()[0]) for k,v in (line.split(':',1) for line in Path('/proc/meminfo').read_text().splitlines())}
if options.start_policy=='staged-memory-v1':
 plan_dir=r.parents[2];plan=json.loads((plan_dir/'plan.json').read_text())
 if Path((plan_dir/'full-root-path').read_text().strip())!=r or plan.get('startPolicy')!='staged-memory-v1' or plan.get('reserveGiB')!=16 or plan.get('totalObservedGiB')!=24 or not time.monotonic_ns()<plan['deadlineMonotonicNs']<=time.monotonic_ns()+90*60*10**9:raise SystemExit('EXPLICIT_STAGED_MEMORY_PLAN_REQUIRED')
 if mem['MemAvailable']<16*1024*1024:raise SystemExit('HOST_16_GIB_RESERVE')
elif mem['MemAvailable']<40*1024*1024:raise SystemExit('REHEARSAL_23_GIB_BUDGET_PLUS_16_GIB_HEADROOM_REQUIRED')
checks={}
for line in (delivery/'SHA256SUMS').read_text().splitlines():
 digest,name=line.split(None,1);name=name.strip();path=delivery/name
 if path.parent!=delivery or not path.is_file() or path.is_symlink():raise SystemExit('DELIVERY_PATH_INVALID')
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 if h.hexdigest()!=digest:raise SystemExit('DELIVERY_HASH_MISMATCH')
 checks[name]=digest
if not {'aws-bootstrap-images.tar','deployment-files.tar','images.json'}<=checks.keys():raise SystemExit('MANDATORY_DELIVERY_CHECKSUMS_REQUIRED')
if options.resume:
 owner=json.loads((r/'ownership.json').read_text())
 if owner['runId']!=run or owner['deliveryChecksums']!=checks:raise SystemExit('RESUME_DELIVERY_IDENTITY_MISMATCH')
 if not (r/'foundation-complete.json').exists():raise SystemExit('PARTIAL_FOUNDATION_REQUIRES_MANUAL_OUTPUT_REVIEW_NEVER_REGENERATE_KEYS')
 if not 0<=time.time()-json.loads((r/'foundation-complete.json').read_text()).get('preparedAtUnixSeconds',0)<10800:raise SystemExit('REHEARSAL_EPHEMERAL_INPUTS_EXPIRED_NEW_IDENTITY_REQUIRED')
else:
 r.mkdir(mode=0o700)
 owner={'runId':run,'directory':str(r),'scope':'NEW disposable delivery-only rehearsal','containers':[],'volumes':[],'deliveryChecksums':checks}
 (r/'ownership.json').write_text(json.dumps(owner,indent=2)+'\n');(r/'ownership.json').chmod(0o600)
log=open(r/'bootstrap.log','a',opener=lambda p,f:os.open(p,f,0o600))
def save(): (r/'ownership.json').write_text(json.dumps(owner,indent=2)+'\n')
def run_cmd(a,**kw):return subprocess.run(a,check=True,stdout=log,stderr=subprocess.STDOUT,timeout=kw.pop('timeout',90),**kw)
def capture(a):return subprocess.check_output(a,stderr=log,text=True,timeout=30).strip()
def write(name,value):
 p=r/name;p.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 with open(p,'x',opener=lambda p,f:os.open(p,f,0o600)) as f:f.write(value if isinstance(value,str) else json.dumps(value,indent=2)+'\n')
def envfile(name,values):
 text=''.join(k+'='+str(v)+'\n' for k,v in values.items());path=r/name
 if path.exists():
  if path.read_text()!=text:raise RuntimeError('EXISTING_ENV_CONTENT_DIFFERS:'+name)
 else:write(name,text)
 return str(path)
def imageinfo(ref):return json.loads(capture(['docker','image','inspect',ref]))[0]
def owned_container(name,image,network):
 info=json.loads(capture(['docker','container','inspect',name]))[0]
 if info['Config']['Labels'].get('org.callsign.run-id')!=run or info['Config']['Labels'].get('org.callsign.lifecycle') == 'persistent' or info['Image']!=image or info['HostConfig']['NetworkMode']!=network or info['HostConfig'].get('PortBindings') or not any(c['id']==info['Id'] for c in owner['containers']):raise RuntimeError('EXISTING_CONTAINER_IDENTITY_MISMATCH')
 return info
def owned_volume(name):
 info=json.loads(capture(['docker','volume','inspect',name]))[0]
 if name not in owner['volumes'] or info.get('Name')!=name or info.get('Labels',{}).get('org.callsign.run-id')!=run or info.get('Labels',{}).get('org.callsign.lifecycle')=='persistent':raise RuntimeError('EXISTING_VOLUME_NOT_OWNED')
 return info
def start(role,image,args=None,env=None,mounts=(),memory='512m',cpu='1',pids=128,namespace=True,readonly=True,init=True,hosts=True):
 name=run+'-'+role
 try:
  network='container:'+json.loads(capture(['docker','container','inspect',run+'-net']))[0]['Id'] if namespace else 'none'
  info=owned_container(name,image,network)
  expected={(str(src),target,not ro) for src,target,ro in mounts}
  actual={(m['Source'],m['Destination'],m['RW']) for m in info['Mounts'] if m['Type']=='bind'}
  if expected!=actual:raise RuntimeError('EXISTING_SERVICE_MOUNTS_DIFFER')
  if not info['State']['Running']:raise RuntimeError('OWNED_EXISTING_CONTAINER_NOT_RUNNING:'+role)
  return name
 except subprocess.CalledProcessError:pass
 cmd=['docker','create','--name',name,'--label','org.callsign.run-id='+run,'--label','org.callsign.lifecycle=ephemeral','--pull=never','--network','container:'+run+'-net' if namespace else 'none','--memory',memory,'--memory-swap',memory,'--cpus',cpu,'--pids-limit',str(pids)]
 if init:cmd+=['--init']
 if role.startswith('besu'):cmd+=['--user','1000:1000']
 if readonly:cmd+=['--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,nosuid,nodev,exec,size=268435456,uid=1000,gid=1000']
 if hosts and not namespace:
  for host in ['asterisk','platform','issuer','sender','postgres']+['besu'+str(n) for n in range(1,5)]+['witness'+str(n) for n in range(1,5)]:cmd+=['--add-host',host+':127.0.0.1']
 if env:cmd+=['--env-file',envfile(role+'.env',env)]
 for source,target,ro in mounts:cmd+=['--mount',f'type=bind,src={source},dst={target}'+(',readonly' if ro else '')]
 result=capture(cmd+[image]+(args or []));owner['containers'].append({'id':result,'name':name,'role':role});save();run_cmd(['docker','start',result]);return name
counter=0
def tool(args,env=None,image=None,network=True,stdin=None,memory='512m',mountroot=True):
 global counter;counter+=1;name=run+'-tool-'+str(time.time_ns())
 cmd=['docker','create','--name',name,'--label','org.callsign.run-id='+run,'--label','org.callsign.lifecycle=ephemeral','--pull=never','--network','container:'+run+'-net' if network else 'none','--memory',memory,'--memory-swap',memory,'--cpus','1','--pids-limit','256','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,nosuid,nodev,exec,size=268435456,uid=1000,gid=1000']
 if image==images['BESU_IMAGE']:cmd+=['--user','1000:1000']
 if mountroot:cmd+=['--mount',f'type=bind,src={r},dst=/run/callsign']
 if 'scripts/prepare-pbx.ts' in args and '--turn' in args:
  target=imageinfo(images['CALLSIGN_APP_IMAGE'])['Config']['WorkingDir']+'/infra/deploy/turnserver.conf.example'
  cmd+=['--mount',f'type=bind,src={r}/public/infra/deploy/turnserver.conf.example,dst={target},readonly']
 if env:cmd+=['--env-file',envfile('tool-'+str(time.time_ns())+'.env',env)]
 if stdin is not None:cmd+=['-i']
 cmd+=[image or images['CALLSIGN_APP_IMAGE']]+args
 cid=capture(cmd);owner['containers'].append({'id':cid,'name':name,'role':'preparation-tool'});save()
 try:
  p=subprocess.run(['docker','start','--attach']+(['--interactive'] if stdin is not None else [])+[cid],input=stdin,text=True,stdout=log,stderr=subprocess.STDOUT,timeout=120)
  info=json.loads(capture(['docker','container','inspect',name]))[0]
  if info['Config']['Labels'].get('org.callsign.run-id')!=run or info['Config']['Labels'].get('org.callsign.lifecycle') == 'persistent':raise RuntimeError('OWNER_MISMATCH')
  if info['State']['OOMKilled']:raise RuntimeError('OWNED_TOOL_OOM')
  if p.returncode or info['State']['ExitCode']!=0:raise RuntimeError('OWNED_TOOL_FAILED:'+str(p.returncode)+':'+str(args[:4]))
 finally:
  info=owned_container(name,image or images['CALLSIGN_APP_IMAGE'],'container:'+json.loads(capture(['docker','container','inspect',run+'-net']))[0]['Id'] if network else 'none')
  if info['State']['Running']:run_cmd(['docker','stop','-t','2',info['Id']],timeout=10)
  run_cmd(['docker','rm',info['Id']],timeout=10)

def wait_pg(name,db,port=5432):
 for _ in range(30):
  p=subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-p',str(port),'-U','callsign_migrator' if port==5432 else 'anchor_owner','-d',db],stdout=log,stderr=log)
  if p.returncode==0:return
  time.sleep(.3)
 raise RuntimeError('OWNED_PG_READINESS_TIMEOUT')

if not options.resume:
 for name,args in [('interfaces-before.json',['ip','-j','addr']),('routes-before.json',['ip','-j','route','show','table','all'])]:write(name,json.loads(capture(args)))
 write('docker-networks-before.json',capture(['docker','network','ls','-q']).splitlines());write('docker-containers-before.json',capture(['docker','ps','-aq','--no-trunc']).splitlines())
if not (r/'foundation-complete.json').exists():
 public=r/'public';public.mkdir(mode=0o700)
 with tarfile.open(delivery/'deployment-files.tar') as t:
  if any(not (m.isfile() or m.isdir()) for m in t.getmembers()):raise RuntimeError('PUBLIC_ARCHIVE_REGULAR_FILES_ONLY')
  t.extractall(public,filter='data')
 # Loading must not retarget an existing image tag used by unrelated work.
 with tarfile.open(delivery/'aws-bootstrap-images.tar') as archive:
  member=archive.getmember('manifest.json')
  if member.size>1024*1024:raise RuntimeError('IMAGE_MANIFEST_TOO_LARGE')
  manifest=json.load(archive.extractfile(member))
 for entry in manifest:
  expected='sha256:'+Path(entry['Config']).stem
  if not expected.startswith('sha256:') or len(expected)!=71:raise RuntimeError('DOCKER_SAVE_CONFIGURATION_ID_REQUIRED')
  for tag in entry.get('RepoTags') or []:
   observed=subprocess.run(['docker','image','inspect','--format','{{.Id}}',tag],capture_output=True,text=True,timeout=10)
   if observed.returncode==0 and observed.stdout.strip()!=expected:raise RuntimeError('EXISTING_IMAGE_TAG_CONFLICT')
 run_cmd(['docker','image','load','--input',str(delivery/'aws-bootstrap-images.tar')],timeout=120)
 inventory=json.loads((delivery/'images.json').read_text());images={v['key']:v['configId'] for v in inventory['images'] if v['key']!='CALLSIGN_WEB_IMAGE'}
 for ref in images.values():
  i=imageinfo(ref)
  if i['Id']!=ref or i['Architecture']!='amd64' or i['Os']!='linux':raise RuntimeError('LOADED_IMAGE_IDENTITY_MISMATCH')
 write('images-loaded.json',images)
 start('net',images['HTTPS_IMAGE'],['sh','-c','sleep 14400'],memory='32m',cpu='.1',pids=16,namespace=False,hosts=True)
 for name in ['data','private-keys','tls','browser-home/.pki/nssdb','state','controller-code','web-inputs']:(r/name).mkdir(parents=True,exist_ok=True,mode=0o700)
 context={'runId':run,'institutionId':'callsign_test_delivery_'+run.rsplit('-',1)[-1],'institutionUri':'https://new-bank.example','serviceUri':'https://new-center.example','networkId':str(7000000+secrets.randbelow(1000000))}
 write('synthetic-public-context.json',context)
 tool(['pnpm','exec','tsx','scripts/prepare-finals.ts','keys','/run/callsign/data/roles','--apply'],env={'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'infrastructure','ISSUER_URI':context['institutionUri'],'SERVICE_URI':context['serviceUri']})
 roles=r/'data/roles'
 for child in roles.iterdir():shutil.move(str(child),r/'data'/child.name)
 roles.rmdir()
 # Inactive recovery fixture only; keep the active v1 manifest/key unchanged.
 tool(['pnpm','exec','tsx','scripts/prepare-finals.ts','approval-key','/run/callsign/data','/run/callsign/data/public-manifest-v2.json','--apply'],env={'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'infrastructure','APPROVAL_KEY_VERSION':'2'})
 tool(['pnpm','exec','tsx','scripts/prepare-finals.ts','management-keys','/run/callsign/data','--apply'],env={'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'infrastructure'})
 for role,path in [('deployer','deployer/key.txt'),('administrator','admin/administrator.txt'),('stopper','operator/emergency.txt')]:shutil.copyfile(r/'data'/path,r/'private-keys'/f'{role}.txt');(r/'private-keys'/f'{role}.txt').chmod(0o600)
 tool(['node','--input-type=module','-'],stdin="import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';import {writeFile,readFile} from 'node:fs/promises';const r='/run/callsign';const c=JSON.parse(await readFile(r+'/synthetic-public-context.json'));const p=JSON.parse(await readFile(r+'/data/management-public.json'));c.publicAddresses={deployer:p.deployer,administrator:p.administrator,stopper:p.emergencyStopper};for(let n=1;n<=3;n++){const k=generatePrivateKey();await writeFile(r+'/private-keys/approver'+n+'.txt',k+String.fromCharCode(10),{flag:'wx',mode:0o600});c.publicAddresses['approver'+n]=privateKeyToAccount(k).address;}await writeFile(r+'/synthetic-public-context.json',JSON.stringify(c,null,2)+String.fromCharCode(10));")
 context=json.loads((r/'synthetic-public-context.json').read_text())
 tool(['pnpm','exec','tsx','scripts/prepare-service-network.ts','/run/callsign/network-config.json','--apply'],env={'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'infrastructure','NETWORK_ID':context['networkId'],'DEPLOYER_PUBLIC_ADDRESS':context['publicAddresses']['deployer'],'REGISTRY_ADMIN_ADDRESS':context['publicAddresses']['administrator'],'REGISTRY_OPERATOR_ADDRESS':context['publicAddresses']['stopper']})
 # Besu generator only consumes the freshly rendered public network-config.
 out=r/'data/besu';out.mkdir(mode=0o700)
 tool(['operator','generate-blockchain-config','--config-file=/run/callsign/network-config.json','--to=/run/callsign/data/besu/generated','--private-key-file-name=key','--public-key-file-name=key.pub'],env={'JAVA_OPTS':'-Xmx512m'},image=images['BESU_IMAGE'],network=False,memory='1g')
 shutil.copyfile(out/'generated/genesis.json',out/'genesis.json');keydirs=sorted((out/'generated/keys').iterdir());assert len(keydirs)==4
 for n,p in enumerate(keydirs,1):shutil.copytree(p,out/f'keys/node{n}');(r/f'state/besu{n}').mkdir(mode=0o700)
 peers=[]
 for n in range(1,5):peers.append('enode://'+(out/f'keys/node{n}/key.pub').read_text().strip().removeprefix('0x')+'@127.0.0.1:'+str(30302+n))
 write('namespace-static-nodes.json',peers);write('namespace-permissions.toml','nodes-allowlist=['+','.join(json.dumps(x) for x in peers)+']\n')
 for n in range(1,5):
  args=['--data-path=/var/lib/besu','--genesis-file=/network/genesis.json','--node-private-key-file=/network/key','--network-id='+context['networkId'],'--p2p-host=127.0.0.1','--p2p-port='+str(30302+n),'--discovery-enabled=false','--static-nodes-file=/network/static-nodes.json','--permissions-nodes-config-file-enabled=true','--rpc-http-enabled=true','--rpc-http-host=127.0.0.1','--rpc-http-port='+str(18540+n),'--rpc-http-api=ETH,NET,WEB3','--host-allowlist=127.0.0.1,localhost','--min-gas-price=0','--sync-mode=FULL']
  start('besu'+str(n),images['BESU_IMAGE'],args,{'JAVA_OPTS':'-Xmx2g'},[(out/'genesis.json','/network/genesis.json',True),(out/f'keys/node{n}/key','/network/key',True),(r/'namespace-static-nodes.json','/network/static-nodes.json',True),(r/'namespace-permissions.toml','/var/lib/besu/permissions_config.toml',True),(r/f'state/besu{n}','/var/lib/besu',False)],memory='3g',cpu='1',pids=256)
 # Generate a fresh CA/leaf in the delivered media image; no host trust changes.
 tool(['bash','-c','umask 077; cd /run/callsign/tls; openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.pem -days 2 -subj /CN=CallSign-Delivery-Test-CA; openssl req -newkey rsa:2048 -nodes -keyout key.pem -out leaf.csr -subj /CN=asterisk; printf "subjectAltName=DNS:asterisk,DNS:localhost,IP:127.0.0.1\\nextendedKeyUsage=serverAuth\\n" > leaf.ext; openssl x509 -req -in leaf.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out cert.pem -days 2 -extfile leaf.ext; cp cert.pem fullchain.pem; cat ca.pem >> fullchain.pem'],image=images['ASTERISK_IMAGE'],network=False)
 tool(['sh','-c','certutil -N -d sql:/run/callsign/browser-home/.pki/nssdb --empty-password; certutil -A -d sql:/run/callsign/browser-home/.pki/nssdb -n callsign-delivery-test -t C,, -i /run/callsign/tls/ca.pem'],image=images['ASTERISK_IMAGE'],network=False)
 for n,hz in [('sender',660),('recipient',990)]:
  with wave.open(str(r/(n+'.wav')),'w') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(b''.join(struct.pack('<h',int(9000*math.sin(2*math.pi*hz*i/48000))) for i in range(48000*3)))
 # All subsequent image tool network operations are loopback in the owned namespace.
 (r/'registry.json').write_bytes((public/'artifacts/service-registry-build-20261027.json').read_bytes())
 write('foundation-files.json',{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for parent in ['data','private-keys','tls'] for p in (r/parent).rglob('*') if p.is_file()})
 write('foundation-complete.json',{'status':'PREPARED_NOT_RUNTIME_VERIFIED','preparedAtUnixSeconds':time.time(),'imagesLoadedFromArchive':True,'freshValidatorCount':4,'newIdentity':context['institutionId'],'noSourceMounts':True})
 print('Foundation prepared for '+run,flush=True)
else:
 images=json.loads((r/'images-loaded.json').read_text())
 for name,digest in json.loads((r/'foundation-files.json').read_text()).items():
  path=r/name
  if not path.is_relative_to(r) or path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise RuntimeError('PREPARED_IDENTITY_FILE_CHANGED')
 keeper=owned_container(run+'-net',images['HTTPS_IMAGE'],'none')
 if not keeper['State']['Running']:raise RuntimeError('OWNED_NAMESPACE_NOT_RUNNING_REVIEW_BEFORE_RESUME')
 for n in range(1,5):
  info=owned_container(run+'-besu'+str(n),images['BESU_IMAGE'],'container:'+keeper['Id'])
  if not info['State']['Running']:raise RuntimeError('OWNED_BESU_NOT_RUNNING_REVIEW_BEFORE_RESUME')

images=json.loads((r/'images-loaded.json').read_text());context=json.loads((r/'synthetic-public-context.json').read_text());public=r/'public'
if not (r/'private-database.json').exists():
 db={k:secrets.token_urlsafe(32) for k in ['ownerPassword','issuerPassword','authPassword','workerPassword','pbxPassword','anchorOwnerPassword','anchorPassword','anchorToken']};db['database']='callsign_test_delivery_'+run.rsplit('-',1)[-1];write('private-database.json',db)
else:db=json.loads((r/'private-database.json').read_text())
for role,port in [('database',5432),('anchor-database',5543)]:
 vol=run+'-'+role
 try:owned_volume(vol)
 except subprocess.CalledProcessError:
  run_cmd(['docker','volume','create','--label','org.callsign.run-id='+run,'--label','org.callsign.lifecycle=ephemeral',vol]);owner['volumes'].append(vol);save()
 name=run+'-'+role
 try:
  keeper=json.loads(capture(['docker','container','inspect',run+'-net']))[0]
  info=owned_container(name,images['POSTGRES_IMAGE'],'container:'+keeper['Id'])
  if not info['State']['Running'] or not any(m['Type']=='volume' and m['Name']==vol and m['Destination']=='/var/lib/postgresql/data' for m in info['Mounts']):raise RuntimeError('OWNED_DB_STORAGE_OR_STATE_MISMATCH')
 except subprocess.CalledProcessError:
  settings={'POSTGRES_DB':db['database'] if port==5432 else 'callsign_anchor','POSTGRES_USER':'callsign_migrator' if port==5432 else 'anchor_owner','POSTGRES_PASSWORD':db['ownerPassword'] if port==5432 else db['anchorOwnerPassword']}
  e=envfile(role+'.env',settings);cmd=['docker','create','--name',name,'--label','org.callsign.run-id='+run,'--label','org.callsign.lifecycle=ephemeral','--pull=never','--network','container:'+run+'-net','--memory','512m','--memory-swap','512m','--cpus','1','--pids-limit','128','--env-file',e,'--mount','type=volume,src='+vol+',dst=/var/lib/postgresql/data',images['POSTGRES_IMAGE'],'postgres','-p',str(port)]
  result=capture(cmd);owner['containers'].append({'id':result,'name':name,'role':role});save();run_cmd(['docker','start',result])
 wait_pg(name,db['database'] if port==5432 else 'callsign_anchor',port)
owner_url='postgres://callsign_migrator:'+db['ownerPassword']+'@127.0.0.1:5432/'+db['database']
# Reviewed image migration code and delivered SQL, not a source mount.
tool(['pnpm','exec','tsx','scripts/migrate-finals.ts','--apply'],env={'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'integration','MIGRATOR_DATABASE_URL':owner_url})
pg=run+'-database'
role_env=envfile('db-role-passwords.env',{'ISSUER_DB_PASSWORD':db['issuerPassword'],'AUTH_DB_PASSWORD':db['authPassword'],'WORKER_DB_PASSWORD':db['workerPassword'],'PBX_DB_PASSWORD':db['pbxPassword']})
# The owner provisioning transaction refuses existing logins, so resume first reads the exact role state.
roles=capture(['docker','exec',pg,'psql','-X','-tAc',"SELECT count(*) FROM pg_roles WHERE rolname IN ('callsign_issuer_login','callsign_auth_login','callsign_worker_login','callsign_pbx_login')",'-U','callsign_migrator','-d',db['database']])
if roles=='0':run_cmd(['docker','exec','-i','--env-file',role_env,pg,'psql','-X','-v','ON_ERROR_STOP=1','-U','callsign_migrator','-d',db['database']],input=(public/'infra/deploy/provision-logins.sql').read_text(),text=True)
elif roles!='4':raise RuntimeError('PARTIAL_ROLE_STATE_REQUIRES_REVIEW')
a=run+'-anchor-database';anchor_context=envfile('anchor-provision.env',{'DEPLOYMENT_ID':'test:'+context['institutionId'],'INSTITUTION_ID':context['institutionId'],'ANCHOR_APP_PASSWORD':db['anchorPassword']})
exists=capture(['docker','exec',a,'psql','-p','5543','-X','-tAc',"SELECT to_regclass('public.callsign_anchors') IS NOT NULL",'-U','anchor_owner','-d','callsign_anchor'])
if exists=='f':run_cmd(['docker','exec','-i',a,'psql','-p','5543','-X','-v','ON_ERROR_STOP=1','-U','anchor_owner','-d','callsign_anchor'],input=(public/'infra/deploy/anchor-schema.sql').read_text(),text=True)
count=capture(['docker','exec',a,'psql','-p','5543','-X','-tAc','SELECT count(*) FROM callsign_anchors','-U','anchor_owner','-d','callsign_anchor'])
if count=='0':run_cmd(['docker','exec','-i','--env-file',anchor_context,a,'psql','-p','5543','-X','-v','ON_ERROR_STOP=1','-U','anchor_owner','-d','callsign_anchor'],input=(public/'infra/deploy/provision-anchor.sql').read_text(),text=True)
elif count!='1':raise RuntimeError('UNEXPECTED_ANCHOR_HISTORY')
# Anchor runtime has a different SQL login and independent storage from application DB.
start('anchor',images['CALLSIGN_APP_IMAGE'],['pnpm','anchor'],{'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'infrastructure','ANCHOR_HOST':'0.0.0.0','PORT':'4300','ANCHOR_DATABASE_URL':'postgres://callsign_anchor_login:'+db['anchorPassword']+'@127.0.0.1:5543/callsign_anchor','ANCHOR_TOKEN':db['anchorToken'],'ANCHOR_TLS_KEY_PATH':'/tls/key.pem','ANCHOR_TLS_CERT_PATH':'/tls/cert.pem'},[(r/'tls/key.pem','/tls/key.pem',True),(r/'tls/cert.pem','/tls/cert.pem',True)],memory='256m')
# Public synthetic accounts use the actual fixture issuer before login; no session row is inserted.
accounts=[]
for subject,role in [('staff','institution'),('agent','gateway'),('recipient','recipient'),('other','recipient'),('approver-one','approver'),('approver-two','approver')]:
 permissions=['contact.manage','delegation.manage','institution.recover','institution.suspend','key.activate'] if role=='institution' else ['governance.approve'] if role=='approver' else []
 accounts.append({'id':'https://127.0.0.1:4443|'+subject,'displayName':'Synthetic '+subject,'role':role,'permissions':permissions})
if not (r/'accounts.json').exists():write('accounts.json',accounts)
rows=capture(['docker','exec',pg,'psql','-X','-tAc','SELECT count(*) FROM issuer_v2.institutions','-U','callsign_migrator','-d',db['database']])
if rows=='0':tool(['pnpm','exec','tsx','scripts/provision-finals.ts','/run/callsign/data/public-manifest.json','/run/callsign/accounts.json','--apply'],env={'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'infrastructure','INSTITUTION_ID':context['institutionId'],'OIDC_ISSUER':'https://127.0.0.1:4443','MIGRATOR_DATABASE_URL':owner_url})
elif rows!='1':raise RuntimeError('UNEXPECTED_INSTITUTION_STATE')
# Existing rows and role names alone never establish deployment identity or least privilege.
verify_env={'MIGRATOR_DATABASE_URL':owner_url,'ANCHOR_OWNER_DATABASE_URL':'postgres://anchor_owner:'+db['anchorOwnerPassword']+'@127.0.0.1:5543/callsign_anchor','VERIFY_DATABASE':db['database']}
for role in ['issuer','auth','worker','pbx']:verify_env['VERIFY_'+role.upper()+'_URL']='postgres://callsign_'+role+'_login:'+db[role+'Password']+'@127.0.0.1:5432/'+db['database']
tool(['node','--import','tsx','--input-type=module','-'],env=verify_env,stdin="import postgres from 'postgres';import {readFile,writeFile} from 'node:fs/promises';import {hashCanonical} from './packages/protocol/src/index.ts';const root='/run/callsign',context=JSON.parse(await readFile(root+'/synthetic-public-context.json'));const owner=postgres(process.env.MIGRATOR_DATABASE_URL,{max:1}),anchor=postgres(process.env.ANCHOR_OWNER_DATABASE_URL,{max:1});try{const records=await owner`SELECT id,state FROM issuer_v2.institutions`;if(records.length!==1||records[0].id!==context.institutionId||records[0].state.institutionUri!==context.institutionUri||!records[0].state.services[context.serviceUri])throw Error('EXISTING_INSTITUTION_IDENTITY_MISMATCH');const state=records[0].state,key=JSON.parse(await readFile(root+'/data/issuer/approval-v'+state.approvalKeyVersion+'.json'));if(key.kid!==state.approvalKid||hashCanonical(key.publicJwk)!==hashCanonical(state.approvalPublicKey))throw Error('EXISTING_INSTITUTION_KEY_MISMATCH');const roles=['issuer','auth','worker','pbx'];const flags=await owner`SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN ${owner(roles.map(r=>'callsign_'+r+'_login'))}`;if(flags.length!==4||flags.some(r=>!r.rolcanlogin||r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls))throw Error('LOGIN_PRIVILEGE_FLAGS_INVALID');const membership=await owner`SELECT member.rolname AS member,parent.rolname AS parent,m.admin_option FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles parent ON parent.oid=m.roleid WHERE member.rolname IN ${owner(roles.map(r=>'callsign_'+r+'_login'))}`;if(membership.length!==4||membership.some(m=>m.admin_option||m.member!==m.parent+'_login'))throw Error('LOGIN_MEMBERSHIP_INVALID');for(const role of roles){const client=postgres(process.env['VERIFY_'+role.toUpperCase()+'_URL'],{max:1});try{const [r]=await client`SELECT current_user,current_database(),has_schema_privilege(current_user,'issuer_v2','USAGE') AS authority,has_table_privilege(current_user,'public.sessions','INSERT') AS sessions`;if(r.current_user!=='callsign_'+role+'_login'||r.current_database!==process.env.VERIFY_DATABASE||r.authority!==['issuer','worker'].includes(role)||r.sessions!==(role==='auth'))throw Error('LOGIN_EFFECTIVE_ACCESS_MISMATCH:'+role);}finally{await client.end();}}const rows=await anchor`SELECT deployment,institution_id,state FROM callsign_anchors`;if(rows.length!==1||rows[0].deployment!=='test:'+context.institutionId||rows[0].institution_id!==context.institutionId||rows[0].state.deployment!==rows[0].deployment||rows[0].state.institutionId!==context.institutionId)throw Error('EXISTING_ANCHOR_IDENTITY_MISMATCH');await writeFile(root+'/database-identity-'+Date.now()+'.json',JSON.stringify({status:'PASS',realRoleConnections:roles,authorityAndSessionAccessSeparated:true,existingAuthorityAndAnchorIdentityVerified:true}),{flag:'wx',mode:0o600});}finally{await owner.end();await anchor.end();}")
if not (r/'database-stage-complete.json').exists():write('database-stage-complete.json',{'status':'PREPARED_NOT_PRODUCT_PASS','migrations':'0000..0010','roles':'distinct issuer/auth/worker/PBX logins','anchor':'separate PostgreSQL storage/login/TLS','sessionsInserted':False,'provisioning':'delivered scripts and SQL; existing data never overwritten'})
print('Owned PostgreSQL and independent TLS Anchor prepared',flush=True)

images=json.loads((r/'images-loaded.json').read_text());context=json.loads((r/'synthetic-public-context.json').read_text())
e={'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'chain','NETWORK_ID':context['networkId'],'REGISTRY_APPROVERS':','.join(context['publicAddresses']['approver'+str(n)] for n in [1,2,3]),'DEPLOYMENT_PATH':'/run/callsign/data/deployment.json','BESU_NODE_URLS':','.join('http://127.0.0.1:'+str(18540+n) for n in [1,2,3,4])}
if not (r/'chain-observation.json').exists():tool(['pnpm','exec','tsx','scripts/deploy-service-registry.ts','inspect','/run/callsign/chain-observation.json'],env=e)
observation=json.loads((r/'chain-observation.json').read_text());e.update({'EXPECTED_GENESIS_HASH':observation['genesisHash'],'DEPLOYER_KEY_PATH':'/run/callsign/private-keys/deployer.txt','REGISTRY_ARTIFACT_PATH':'/run/callsign/registry.json','REGISTRY_ARTIFACT_SHA256':hashlib.sha256((r/'registry.json').read_bytes()).hexdigest(),'INSTITUTION_ID':context['institutionId']})
tool(['pnpm','exec','tsx','scripts/deploy-service-registry.ts','--apply'],env=e)
for n in [1,2,3,4]:start('witness'+str(n),images['CALLSIGN_APP_IMAGE'],['pnpm','--filter','@callsign/witness','start'],{'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'infrastructure','WITNESS_ID':'witness-'+str(n),'WITNESS_PORT':str(4200+n),'BESU_RPC_URL':'http://127.0.0.1:'+str(18540+n),'DEPLOYMENT_PATH':'/ledger/deployment.json','WITNESS_KEY_PATH':'/keys/witness.json','WITNESS_PREPROVISIONED_KEYS':'true','SERVICE_REGISTRY_PROFILE':'CALLSIGN_SERVICE_JOINT_CONFIGURATION_1'},[(r/'data/deployment.json','/ledger/deployment.json',True),(r/f'data/witness-keys/witness-{n}.json','/keys/witness.json',True)])
if not (r/'live-http-context.json').exists():write('live-http-context.json',context)
print('Actual delivered registry deployed and four Witness processes started; institution registration remains pending',flush=True)

images=json.loads((r/'images-loaded.json').read_text());context=json.loads((r/'synthetic-public-context.json').read_text());db=json.loads((r/'private-database.json').read_text())
if not (r/'private-app.json').exists():write('private-app.json',{k:secrets.token_urlsafe(32) for k in ['ariPassword','pbxCredentialSecret','turnSecret','platformToken','senderToken']})
keys=json.loads((r/'private-app.json').read_text());e={'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'infrastructure','WEB_ORIGIN':'https://127.0.0.1:8443','PBX_PUBLIC_HOST':'asterisk','PBX_PUBLIC_ADDRESS':'127.0.0.1','PBX_PRIVATE_ADDRESS':'127.0.0.1','ARI_PASSWORD':keys['ariPassword'],'PBX_DB_USER':'callsign_pbx_login','PBX_DB_PASSWORD':db['pbxPassword']}
if not (r/'asterisk').exists():
 tool(['pnpm','exec','tsx','scripts/prepare-pbx.ts','/run/callsign/asterisk','--apply'],env=e)
 p=r/'asterisk/odbc.ini';p.write_text(p.read_text().replace('Database=callsign','Database='+db['database']))
 user=str(int(time.time())+14400)+':pbx';pw=base64.b64encode(hmac.new(keys['turnSecret'].encode(),user.encode(),hashlib.sha1).digest()).decode()
 p=r/'asterisk/rtp.conf';p.write_text(p.read_text().replace('[ice_host_candidates]',f'turnaddr=127.0.0.1:3478\nturnusername={user}\nturnpassword={pw}\n\n[ice_host_candidates]'))
if not (r/'turn').exists():
 tool(['pnpm','exec','tsx','scripts/prepare-pbx.ts','/run/callsign/turn','--turn','--apply'],env={'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'infrastructure','TURN_SECRET':keys['turnSecret'],'SIP_REALM':'callsign-test','PBX_PUBLIC_ADDRESS':'127.0.0.1','TURN_PRIVATE_ADDRESS':'127.0.0.1'})
 p=r/'turn/turnserver.conf';p.write_text(p.read_text().replace('allow-loopback-peers=0','allow-loopback-peers=1')+'\npidfile=/tmp/turn.pid\nlog-file=stdout\nno-stdout-log\nuser-quota=12\ntotal-quota=32\n')
 (r/'turn/tls').mkdir(mode=0o700)
if not (r/'media-tls').exists():
 (r/'media-tls').mkdir(mode=0o700)
 for source,dest in [('ca.pem','ca.pem'),('cert.pem','cert.pem'),('fullchain.pem','fullchain.pem'),('key.pem','key.pem'),('key.pem','privkey.pem')]:shutil.copyfile(r/'tls'/source,r/'media-tls'/dest);(r/'media-tls'/dest).chmod(0o600)
start('turn',images['TURN_IMAGE'],['turnserver','-c','/etc/coturn/turnserver.conf'],mounts=[(r/'turn','/etc/coturn',True),(r/'media-tls','/etc/coturn/tls',True)])
# Runtime tmpfs are owned ephemeral directories, never host permission changes.
(r/'asterisk/tls').mkdir(mode=0o700,exist_ok=True)
name=run+'-pbx'
try:
 info=owned_container(name,images['ASTERISK_IMAGE'],'container:'+json.loads(capture(['docker','container','inspect',run+'-net']))[0]['Id'])
 if not info['State']['Running']:raise RuntimeError('OWNED_PBX_IDENTITY_OR_STATE_MISMATCH')
except subprocess.CalledProcessError:
 cmd=['docker','create','--name',name,'--label','org.callsign.run-id='+run,'--label','org.callsign.lifecycle=ephemeral','--pull=never','--network','container:'+run+'-net','--memory','512m','--memory-swap','512m','--cpus','1','--pids-limit','128','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges']
 for directory in ['/tmp','/var/run/asterisk','/var/log/asterisk','/var/spool/asterisk']:cmd+=['--tmpfs',directory+':rw,nosuid,nodev,size=67108864,uid=1000,gid=1000']
 for source,dest in [(r/'asterisk','/etc/asterisk'),(r/'asterisk/odbc.ini','/etc/odbc.ini'),(r/'media-tls','/etc/asterisk/tls')]:cmd+=['--mount',f'type=bind,src={source},dst={dest},readonly']
 cid=capture(cmd+[images['ASTERISK_IMAGE']]);owner['containers'].append({'id':cid,'name':name,'role':'pbx'});save();run_cmd(['docker','start',cid])
if not (r/'prepared-trust.json').exists():tool(['pnpm','exec','tsx','scripts/prepare-finals.ts','trust','/run/callsign/data','/run/callsign/prepared-trust.json','--apply'],env={'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'infrastructure','INSTITUTION_ID':context['institutionId'],'PBX_DTLS_CERT_PATH':'/run/callsign/tls/cert.pem'})
# Own OIDC certificate references for the controller, not service source files.
for src,dest in [('tls/key.pem','tls.key'),('tls/cert.pem','tls.crt')]:
 if not (r/dest).exists():shutil.copyfile(r/src,r/dest);(r/dest).chmod(0o600)
print('PBX/TURN prepared from delivered runtime; local-only loopback relay differences recorded',flush=True)

images=json.loads((r/'images-loaded.json').read_text());db=json.loads((r/'private-database.json').read_text())
code=r/'controller-code';(code/'tests/integration').mkdir(parents=True,exist_ok=True)
for name in ['runtime-media.test.ts','service-http-fixture.ts']:shutil.copyfile(Path('tests/integration')/name,code/'tests/integration'/name)
(code/'tests/media').mkdir(parents=True,exist_ok=True)
shutil.copyfile('tests/media/analysis-path.ts',code/'tests/media/analysis-path.ts')
shutil.copyfile('vitest.http.config.ts',code/'vitest.http.config.ts')
# Observer-only code/browser mounts. Application services never see these mounts.
work=imageinfo(images['CALLSIGN_APP_IMAGE'])['Config']['WorkingDir']
start('controller',images['CALLSIGN_APP_IMAGE'],['sleep','14400'],mounts=[(r,'/run/callsign',False),(code/'tests',work+'/tests',True),(code/'vitest.http.config.ts',work+'/vitest.http.config.ts',True),(options.browser_cache.resolve(),'/opt/browser-cache',True),(Path('/usr/lib/x86_64-linux-gnu'),'/host-libs',True),(Path('/usr/share/fonts'),'/usr/share/fonts',True),(Path('/etc/fonts'),'/etc/fonts',True)],memory='2g',pids=512)
e={'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'integration','CALLSIGN_RUNTIME_IMAGE_CONFIRMATION':'OWNED_FINAL_IMAGE','CALLSIGN_LIVE_AUTHORITY_CONFIRMATION':'OWNED_LOOPBACK_ONLY','CALLSIGN_CHAIN_TEST_ROOT':'/run/callsign','CALLSIGN_HTTP_TEST_ROOT':'/run/callsign','CALLSIGN_EXPECTED_RUNTIME_IMAGE':images['CALLSIGN_APP_IMAGE'],'CALLSIGN_RUNTIME_RESUME_OIDC':'https://127.0.0.1:4443','CALLSIGN_PREPARED_TRUST':'/run/callsign/prepared-trust.json','CALLSIGN_DELIVERY_NEW':'true','CALLSIGN_BROWSER_HOME':'/run/callsign/browser-home','TEST_DATABASE_URL':'postgres://callsign_migrator:'+db['ownerPassword']+'@127.0.0.1:5432/'+db['database'],'ISSUER_DATABASE_URL':'postgres://callsign_issuer_login:'+db['issuerPassword']+'@127.0.0.1:5432/'+db['database'],'AUTH_DATABASE_URL':'postgres://callsign_auth_login:'+db['authPassword']+'@127.0.0.1:5432/'+db['database'],'WORKER_DATABASE_URL':'postgres://callsign_worker_login:'+db['workerPassword']+'@127.0.0.1:5432/'+db['database'],'TEST_ANCHOR_TOKEN':db['anchorToken'],'NODE_EXTRA_CA_CERTS':'/run/callsign/tls/ca.pem','PBX_DTLS_CERT_PATH':'/run/callsign/tls/cert.pem','HOME':'/tmp','XDG_DATA_HOME':'/tmp/xdg'}
envfile('runtime-test.env',e)
print('Observer controller ready; browser and copied test sources are separate from service runtime dependencies',flush=True)


write('prepared-scope.json',{'status':'PREPARED_NOT_PRODUCT_PASS','serviceInputs':'delivered archive/public files and NEW generated protected inputs','observerInputs':'copied integration tests, installed Chromium, shared libraries and fonts','awsOverrideExecuted':False}) if not (r/'prepared-scope.json').exists() else None
print('Owned NEW prerequisites ready. Run runtime-media-driver.py --delivery-files ROOT/public for actual product assertions. Preserve all partial outputs and ownership.json on failure.')
