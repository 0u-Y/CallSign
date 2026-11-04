"""Owned full backup/restore using existing runtime CLI and existing PostgreSQL client image."""
import os,json,subprocess,shutil,tarfile,time,secrets,hashlib
from pathlib import Path
if os.environ.get('CALLSIGN_ALLOW_EXTERNAL_EXECUTION')!='integration':raise SystemExit('INTEGRATION_EXECUTION_BLOCKED')
root=Path(os.environ['CALLSIGN_RUNTIME_TEST_ROOT']).resolve();owner=json.loads((root/'ownership.json').read_text());run=owner['runId'];assert root.name==run and run.startswith('media-delivery-');images=json.loads((root/'images-loaded.json').read_text());db=json.loads((root/'private-database.json').read_text());ctx=json.loads((root/'synthetic-public-context.json').read_text());log=(root/('restore-driver-'+os.environ.get('CALLSIGN_RESTORE_CHECK_PHASE','full')+'.log')).open('x');tool=run+'-tool-restore';stage='prepare'
def save(): (root/'ownership.json').write_text(json.dumps(owner,indent=2)+'\n')
def call(args,**kw):return subprocess.run(args,check=True,stdout=log,stderr=subprocess.STDOUT,timeout=kw.pop('timeout',60),**kw)
def capture(args):return subprocess.check_output(args,text=True,stderr=log,timeout=15).strip()
def info(name):
 d=json.loads(capture(['docker','inspect',name]))[0];assert d['Config']['Labels'].get('org.callsign.run-id')==run and any(x['id']==d['Id']for x in owner['containers']);return d
net=info(run+'-net');assert net['State']['Running'];namespace='container:'+net['Id']
def envfile(name,values):
 p=root/(name+'.env');assert not p.exists();p.write_text(''.join(k+'='+str(v)+'\n'for k,v in values.items()));p.chmod(0o600);return str(p)
def register(cid,name,role):owner['containers'].append({'id':cid,'name':name,'role':role});save()
def stop_remove(d):
 assert d['Config']['Labels']['org.callsign.run-id']==run
 if d['State']['Running']:call(['docker','stop','-t','5',d['Id']],timeout=15)
 call(['docker','rm',d['Id']])
def execute(script,values={},args=[],expected=True,rejection=()):
 global stage
 stage=script;env={'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'infrastructure','CALLSIGN_RUNTIME_TEST_ROOT':'/run/callsign','NODE_EXTRA_CA_CERTS':'/run/callsign/tls/ca.pem','TSX_DISABLE_CACHE':'1',**values};p=envfile('restore-command-'+str(time.time_ns()),env)
 result=subprocess.run(['docker','exec','--env-file',p,tool,'/runtime-node','--import','tsx',script,*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90)
 if expected and result.returncode:raise RuntimeError('RESTORE_COMMAND_FAILED:'+script+':'+result.stderr.decode(errors='replace')[-400:].replace(db['ownerPassword'],'[REDACTED]').replace(db['anchorToken'],'[REDACTED]'))
 if not expected and (not result.returncode or not rejection or any(code not in result.stderr.decode(errors='replace') for code in rejection)):raise RuntimeError('NEGATIVE_RESTORE_DID_NOT_REJECT_FOR_EXPECTED_REASON')
 return result
url='postgres://callsign_migrator:'+db['ownerPassword']+'@127.0.0.1:5432/'+db['database'];common={'MIGRATOR_DATABASE_URL':url,'INSTITUTION_ID':ctx['institutionId'],'DEPLOYMENT_ID':'test:'+ctx['institutionId'],'CONSUMPTION_ANCHOR_URL':'https://127.0.0.1:4300','CONSUMPTION_ANCHOR_TOKEN':db['anchorToken']}
def check(phase,url_value=url):return execute('tests/integration/runtime-restore-check.ts',{'CALLSIGN_ALLOW_EXTERNAL_EXECUTION':'integration','MIGRATOR_DATABASE_URL':url_value},[phase])
if os.environ.get('CALLSIGN_RESTORE_CHECK_PHASE')=='stale':
 target=info(run+'-database');name=db['database']+'_stale';call(['docker','exec',target['Id'],'psql','-X','-v','ON_ERROR_STOP=1','-U','callsign_migrator','-d',db['database'],'-c','CREATE DATABASE '+name]);stale_url=url.rsplit('/',1)[0]+'/'+name
 values={'RESTORE_CONFIRMATION':'NEW-EMPTY-DATABASE-AND-DIRECTORY','RESTORE_BUNDLE':'/run/callsign/full-backup','RESTORE_DATABASE_URL':stale_url,'RESTORE_DATA_DIR':'/run/callsign/stale-restored','BACKUP_ENCRYPTION_KEY_PATH':'/run/callsign/backup-key.private'}
 shutil.copytree(root/'full-backup',root/'missing-metadata-backup');(root/'missing-metadata-backup/manifest.json').unlink();execute('scripts/restore-bundle.ts',{**values,'RESTORE_BUNDLE':'/run/callsign/missing-metadata-backup'},expected=False,rejection=('ENOENT','manifest.json'));execute('scripts/restore-bundle.ts',values);check('stale',stale_url);(root/'restore-negative-metadata.json').write_text(json.dumps({'status':'PASS','missingManifestRejected':True,'originalBackupPreserved':True})+'\n');raise SystemExit(0)
try:
 # Copy only from the exact already-reviewed runtime, without starting its extraction container.
 extract=run+'-tool-runtime-copy';cid=capture(['docker','create','--name',extract,'--label','org.callsign.run-id='+run,'--pull=never','--network','none','--memory','512m','--memory-swap','512m','--cpus','1',images['CALLSIGN_APP_IMAGE']]);register(cid,extract,'preparation-tool');work=json.loads(capture(['docker','image','inspect',images['CALLSIGN_APP_IMAGE']]))[0]['Config']['WorkingDir'];call(['docker','cp',cid+':'+work,str(root/'restore-runtime')],timeout=60);call(['docker','cp',cid+':/usr/local/bin/node',str(root/'restore-node')]);call(['docker','rm',cid]);(root/'restore-runtime/tests/integration').mkdir(parents=True,exist_ok=True);shutil.copyfile('tests/integration/runtime-restore-check.ts',root/'restore-runtime/tests/integration/runtime-restore-check.ts')
 env=envfile('restore-tool',{'LC_ALL':'C','HOME':'/tmp'});cid=capture(['docker','create','--name',tool,'--label','org.callsign.run-id='+run,'--pull=never','--network',namespace,'--memory','512m','--memory-swap','512m','--cpus','1','--pids-limit','128','--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,size=1048576','--env-file',env,'--workdir',work,'--mount','type=bind,src='+str(root)+',dst=/run/callsign','--mount','type=bind,src='+str(root/'restore-runtime')+',dst='+work+',readonly','--mount','type=bind,src='+str(root/'restore-node')+',dst=/runtime-node,readonly',images['POSTGRES_IMAGE'],'sleep','3600']);register(cid,tool,'preparation-tool');call(['docker','start',cid]);call(['docker','exec',tool,'pg_dump','--version']);call(['docker','exec',tool,'/runtime-node','--version'])
 check('snapshot');before=json.loads((root/'restore-before.private.json').read_text());assert before['state']['approvalKeyVersion']==1,'RESTORE_BEFORE_KEY_ROTATION_REQUIRED'
 drain=json.loads(execute('scripts/backup-control.ts',common,['drain']).stdout);token=drain['token'];chain=[info(run+'-besu'+str(i))for i in range(1,5)];witness=[info(run+'-witness'+str(i))for i in range(1,5)];media=[info(run+'-'+x)for x in ['pbx','turn']]
 for d in witness+media+chain:call(['docker','stop','-t','5',d['Id']],timeout=15)
 # Archive every owned Besu bind input/data after all four validators have stopped.
 paths=set()
 for d in chain:
  for m in d['Mounts']:
   assert m['Type']=='bind';p=Path(m['Source']).resolve();assert p.is_relative_to(root);paths.add(p)
 with tarfile.open(root/'chain-quiesced.tar','w')as t:
  for p in sorted(paths):t.add(p,arcname=str(p.relative_to(root)),recursive=True)
 config=root/'backup-configuration';shutil.copytree(root/'data',config);
 if (config/'asterisk').exists():shutil.rmtree(config/'asterisk')
 shutil.copytree(root/'asterisk',config/'asterisk');shutil.copytree(root/'media-tls',config/'asterisk/tls',dirs_exist_ok=True);shutil.copytree(root/'tls',config/'trust/tls');key=root/'backup-key.private';key.write_bytes(secrets.token_bytes(32));key.chmod(0o600)
 deployment_env=str(root/'phase-work-cancel/issuer.env');assert Path(deployment_env).is_file() and not Path(deployment_env).stat().st_mode&0o077
 inputs=config/'trust/deployment-inputs';inputs.mkdir(mode=0o700);roles=config/'trust/role-envs';roles.mkdir(mode=0o700)
 for name in ['private-database.json','private-app.json','synthetic-public-context.json','live-http-context.json','prepared-trust.json']:shutil.copyfile(root/name,inputs/name);(inputs/name).chmod(0o600)
 for name in ['issuer','platform','sender','worker','web','https']:
  path=root/'phase-work-cancel'/(name+'.env');assert path.is_file();shutil.copyfile(path,roles/path.name);(roles/path.name).chmod(0o600)
 backup={**common,'BACKUP_SCOPE':'full','BACKUP_CONFIRMATION':'MAINTENANCE-WITH-QUIESCED-CHAIN','BACKUP_DRAIN_TOKEN':token,'BACKUP_DIR':'/run/callsign/full-backup','FINALS_DATA_DIR':'/run/callsign/backup-configuration','BACKUP_ENCRYPTION_KEY_PATH':'/run/callsign/backup-key.private','BACKUP_DEPLOYMENT_ENV_PATH':'/run/callsign/phase-work-cancel/issuer.env','CHAIN_SNAPSHOT_ARCHIVE':'/run/callsign/chain-quiesced.tar'}
 execute('scripts/backup-bundle.ts',backup);execute('scripts/backup-control.ts',{**common,'BACKUP_DRAIN_TOKEN':token},['fence']);source=info(run+'-database');stop_remove(source)
 # New physical PostgreSQL volume, same logical deployment/database and reviewed role credentials.
 volume=run+'-restored-database';call(['docker','volume','create','--label','org.callsign.run-id='+run,volume]);owner['volumes'].append(volume);save();pg_env=envfile('restored-database',{'POSTGRES_USER':'callsign_migrator','POSTGRES_DB':db['database'],'POSTGRES_PASSWORD':db['ownerPassword']});cid=capture(['docker','create','--name',run+'-database','--label','org.callsign.run-id='+run,'--pull=never','--network',namespace,'--memory','512m','--memory-swap','512m','--cpus','1','--pids-limit','128','--env-file',pg_env,'--mount','type=volume,src='+volume+',dst=/var/lib/postgresql/data',images['POSTGRES_IMAGE'],'postgres','-p','5432']);register(cid,run+'-database','restored-database');call(['docker','start',cid])
 for _ in range(30):
  p=subprocess.run(['docker','exec',cid,'pg_isready','-U','callsign_migrator','-d',db['database']],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=3)
  if not p.returncode:break
  time.sleep(1)
 else:raise RuntimeError('RESTORED_DATABASE_NOT_READY')
 call(['docker','exec','-i','--env-file',str(root/'db-role-passwords.env'),cid,'psql','-X','-v','ON_ERROR_STOP=1','-v','restore_roles_only=1','-U','callsign_migrator','-d',db['database']],input=(root/'public/infra/deploy/provision-logins.sql').read_text(),text=True)
 restore={'RESTORE_CONFIRMATION':'NEW-EMPTY-DATABASE-AND-DIRECTORY','RESTORE_BUNDLE':'/run/callsign/full-backup','RESTORE_DATABASE_URL':url,'RESTORE_DATA_DIR':'/run/callsign/restored-data','BACKUP_ENCRYPTION_KEY_PATH':'/run/callsign/backup-key.private'}
 wrong=root/'wrong-key.private';wrong.write_bytes(secrets.token_bytes(32));wrong.chmod(0o600);execute('scripts/restore-bundle.ts',{**restore,'BACKUP_ENCRYPTION_KEY_PATH':'/run/callsign/wrong-key.private','RESTORE_DATA_DIR':'/run/callsign/wrong-key-restored'},expected=False,rejection=('BACKUP_MANIFEST_AUTHENTICATION_REQUIRED',));execute('scripts/restore-bundle.ts',restore);check('verify');target_token=json.loads((root/'restore-activate.private.json').read_text())['token'];execute('scripts/backup-control.ts',{**common,'BACKUP_DRAIN_TOKEN':target_token,'SOURCE_FENCE_CONFIRMATION':'SOURCE-WRITERS-STOPPED-AND-FENCED'},['activate']);check('replay')
 chain_dir=root/'restored-chain';chain_dir.mkdir(mode=0o700)
 with tarfile.open(root/'restored-data/chain.snapshot')as t:t.extractall(chain_dir,filter='data')
 def recreate(d,chain_mount=False):
  stop_remove(d);name=d['Name'].lstrip('/');env=envfile('restored-'+name.rsplit('-',1)[-1],dict(x.split('=',1)for x in d['Config'].get('Env',[])));args=['docker','create','--name',name,'--label','org.callsign.run-id='+run,'--pull=never','--network',namespace,'--memory',str(d['HostConfig']['Memory']),'--memory-swap',str(d['HostConfig']['MemorySwap']),'--cpus','1','--pids-limit',str(d['HostConfig'].get('PidsLimit') or 256),'--env-file',env]
  for m in d['Mounts']:
   assert m['Type']=='bind';p=Path(m['Source']);assert p.is_relative_to(root);new=chain_dir/p.relative_to(root)if chain_mount else p;assert new.exists();args+=['--mount','type=bind,src='+str(new)+',dst='+m['Destination']+(''if m['RW']else',readonly')]
  for p,opts in (d['HostConfig'].get('Tmpfs')or{}).items():args+=['--tmpfs',p+':'+opts]
  cid=capture(args+[d['Image'],*d['Config'].get('Cmd',[])]);register(cid,name,'restored-'+name.rsplit('-',1)[-1]);call(['docker','start',cid])
 (root/'data').rename(root/'source-data');(root/'restored-data').rename(root/'data');shutil.copytree(root/'data/asterisk',root/'restored-asterisk');(root/'asterisk').rename(root/'source-asterisk');(root/'restored-asterisk').rename(root/'asterisk')
 for d in chain:recreate(d,True)
 for d in witness+media:recreate(d)
 check('chain')
 (root/'restore-complete.json').write_text(json.dumps({'status':'PASS','scope':'Full encrypted bundle, new PostgreSQL volume and separately extracted stopped Besu state. Current independent Anchor was not restored. Actual post-restore login/call is a later media stage.','sourceDatabaseId':source['Id'],'targetDatabaseId':cid,'wrongKeyRejected':True,'nativeClients':'existing PostgreSQL image; Node and CLI copied from exact runtime image; no installation/download','stoppedValidatorCount':4,'restoredValidatorCount':4,'sourceFencePreserved':True,'sourceStatePreservedPrivately':True},indent=2)+'\n')
except BaseException as error:
 (root/'restore-failure.json').write_text(json.dumps({'status':'FAIL','stage':stage,'errorType':type(error).__name__,'message':str(error).replace(db['ownerPassword'],'[REDACTED]').replace(db['anchorToken'],'[REDACTED]')[-600:]})+'\n');raise
finally:log.close()
