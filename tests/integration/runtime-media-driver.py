"""Explicit host-side driver for the owned final-image integration test; creates no network or published port."""
import argparse, json, os, re, shutil, subprocess, time
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--case', nargs='+', choices=['normal-end','logout','work-cancel','lease-expiry','delegation-revoke','emergency-stop','session-expiry','pbx-outage','policy-change','key-change','device-denied','device-absent'])
parser.add_argument('--analysis-fixture',action='store_true',help='Explicit observer-only provider adapter entrypoint; never a production fallback')
parser.add_argument('--archive-phase', help='Preserve prior private evidence and stop only owned application/controller processes before an explicit new phase')
parser.add_argument('--delivery-files', type=Path, help='Extracted, checksum-verified public delivery directory; build web only from delivered runtime/nginx')
options = parser.parse_args()
selected_cases = options.case or ['logout','work-cancel','lease-expiry','delegation-revoke','emergency-stop']
if len(set(selected_cases)) != len(selected_cases): raise SystemExit('DUPLICATE_CASE_SELECTION')

if os.environ.get('CALLSIGN_ALLOW_EXTERNAL_EXECUTION') != 'integration':
    raise SystemExit('INTEGRATION_EXECUTION_BLOCKED')
root = Path(os.environ['CALLSIGN_RUNTIME_TEST_ROOT']).resolve()
owner = json.loads((root / 'ownership.json').read_text())
run_id = owner['runId']
if not run_id.startswith('media-') or root.name != run_id:
    raise SystemExit('OWNED_DISPOSABLE_IDENTITY_REQUIRED')
app_image = os.environ['CALLSIGN_EXPECTED_RUNTIME_IMAGE']
if not re.fullmatch(r'sha256:[0-9a-f]{64}', app_image):
    raise SystemExit('IMMUTABLE_RUNTIME_IMAGE_REQUIRED')

def local_web_build_images(public, runtime, nginx):
    recipe = (public / 'infra/deploy/web.Dockerfile').read_text()
    if re.findall(r'^FROM .+$', recipe, re.M) != ['FROM ${PREPARED_RUNTIME_IMAGE} AS build', 'FROM ${NGINX_IMAGE} AS web'] or re.findall(r'^COPY\s+--from=(\S+)', recipe, re.M) != ['build'] or re.search(r'^\s*(?:#\s*syntax\s*=|ADD\s)', recipe, re.M | re.I):
        raise RuntimeError('OFFLINE_WEB_BUILD_RECIPE_REVIEW_REQUIRED')
    # --pull=false alone can still fetch a missing FROM; inspect both bases before any service starts.
    for ref in [runtime, nginx]:
        if not re.fullmatch(r'sha256:[0-9a-f]{64}', ref): raise RuntimeError('LOCAL_IMMUTABLE_BUILD_BASE_REQUIRED')
        info = json.loads(subprocess.check_output(['docker', 'image', 'inspect', ref], timeout=10))[0]
        if info['Id'] != ref or info['Os'] != 'linux' or info['Architecture'] != 'amd64':
            raise RuntimeError('LOCAL_BUILD_BASE_IDENTITY_MISMATCH')

if options.delivery_files and not options.archive_phase:
    public = options.delivery_files.resolve()
    if public != root / 'public' or not (root / 'images-loaded.json').is_file(): raise RuntimeError('OWNED_DELIVERY_FILES_REQUIRED')
    images = json.loads((root / 'images-loaded.json').read_text())
    if images['CALLSIGN_APP_IMAGE'] != app_image: raise RuntimeError('DELIVERED_RUNTIME_IMAGE_MISMATCH')
    local_web_build_images(public, app_image, images['HTTPS_IMAGE'])

def command(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'container', 'inspect', name]))[0]

import base64
credential = json.loads((root / 'private-app.json').read_text())['pbxCredentialSecret']
if len(base64.urlsafe_b64decode(credential + '=' * (-len(credential) % 4))) != 32:
    raise SystemExit('PBX_CREDENTIAL_SECRET_MUST_DECODE_TO_32_BYTES')

keeper = inspect(run_id + '-net')
if keeper['Config']['Labels'].get('org.callsign.run-id') != run_id or keeper['HostConfig']['NetworkMode'] != 'none':
    raise SystemExit('OWNED_NONE_NAMESPACE_REQUIRED')

if options.archive_phase:
    if not re.fullmatch(r'[a-z0-9-]{1,60}',options.archive_phase): raise SystemExit('PHASE_NAME_INVALID')
    phase = root / ('phase-' + options.archive_phase)
    phase.mkdir(mode=0o700)
    for role in ['issuer','platform','sender','worker','web','https']:
        observed = subprocess.run(['docker','container','inspect',run_id+'-'+role],capture_output=True,text=True)
        if observed.returncode: continue
        info = json.loads(observed.stdout)[0]
        if info['Config']['Labels'].get('org.callsign.run-id') != run_id or info['HostConfig']['NetworkMode'] != 'container:'+keeper['Id'] or not any(c['id']==info['Id'] for c in owner['containers']):
            raise RuntimeError('OWNED_PHASE_RESOURCE_REQUIRED')
        (phase/(role+'.log')).write_bytes(subprocess.run(['docker','logs',info['Id']],stdout=subprocess.PIPE,stderr=subprocess.STDOUT).stdout)
        command(['docker','stop','-t','5',info['Id']],stdout=subprocess.DEVNULL,timeout=15)
        command(['docker','rm',info['Id']],stdout=subprocess.DEVNULL,timeout=15)
        if (root/(role+'.env')).exists(): (root/(role+'.env')).rename(phase/(role+'.env'))
    controller = inspect(run_id+'-controller')
    if controller['Config']['Labels'].get('org.callsign.run-id') != run_id or not any(c['id']==controller['Id'] for c in owner['containers']): raise RuntimeError('OWNED_CONTROLLER_REQUIRED')
    command(['docker','stop','-t','3',controller['Id']],stdout=subprocess.DEVNULL,timeout=15)
    command(['docker','start',controller['Id']],stdout=subprocess.DEVNULL,timeout=15)
    names=['runtime-media-test.log','runtime-media-results.json','image-services-request.json','image-services-started.json','media-contact.json','delivery-web-build.json','web-image-id.txt','natural-session-wait.json','natural-expiry-lease-observation.json']
    names += [p.name for pattern in ['analysis-observation-*','media-failure-*','decoded-audio-*','device-result-*','delivery-work-*','delivery-device-*','delivery-recipient-*','delivery-agent-*','delivery-workspace-*','pbx-control-*','call-trial-*'] for p in root.glob(pattern)]
    for name in names:
        if (root/name).exists(): (root/name).rename(phase/name)
    if (root/'controller-code').exists(): shutil.copytree(root/'controller-code',phase/'controller-code')
    if (root/'runtime-test.env').exists(): shutil.copyfile(root/'runtime-test.env',phase/'runtime-test.env')
    if (root/'runtime-analysis-test.env').exists(): (root/'runtime-analysis-test.env').rename(phase/'runtime-analysis-test.env')
    print('Prior private evidence preserved; owned app/controller processes stopped/restarted. DB, chain, Anchor and keys were not initialized.')
    raise SystemExit(0)

def write_env(name, values):
    path = root / (name + '.env')
    text = ''.join(k + '=' + str(v) + '\n' for k, v in values.items())
    if path.exists():
        if path.read_text() != text: raise RuntimeError('EXISTING_ROLE_CONFIGURATION_DIFFERS:' + name)
        return path
    with open(path, 'x', opener=lambda p, f: os.open(p, f, 0o600)) as output:
        output.write(text)
    return path

def start(role, env, mounts, args=None, image=app_image, memory='512m'):
    name = run_id + '-' + role
    env_path = write_env(role, env)
    request = ['docker', 'run', '-d', '--name', name, '--label', 'org.callsign.run-id=' + run_id,
               '--pull=never', '--init', '--network', 'container:' + run_id + '-net', '--memory', memory, '--memory-swap', memory,
               '--cpus', '1', '--pids-limit', '128', '--read-only', '--cap-drop', 'ALL',
               '--security-opt', 'no-new-privileges', '--tmpfs', '/tmp:rw,nosuid,nodev,size=67108864',
               '--env-file', str(env_path)]
    if role in ['web','https']: request += ['--user', '1000:1000']
    for source, target in mounts:
        request += ['--mount', f'type=bind,src={source},dst={target},readonly']
    result = subprocess.check_output(request + [image] + (args or [])).decode().strip()
    owner['containers'].append({'id': result, 'name': name, 'role': 'final-image-' + role})
    (root / 'ownership.json').write_text(json.dumps(owner, indent=2) + '\n')
    return result

for previous in ['runtime-media-test.log','runtime-media-results.json','image-services-request.json','image-services-started.json']:
    if (root / previous).exists():
        raise SystemExit('ARCHIVE_PREVIOUS_TEST_EVIDENCE_FIRST')
log = open(root / 'runtime-media-test.log', 'x', opener=lambda p, f: os.open(p, f, 0o600))
controller = run_id + '-controller'
controller_info = inspect(controller)
def assert_controller(info):
    if info['Config']['Labels'].get('org.callsign.run-id') != run_id or not info['HostConfig'].get('Init') or info['Image'] != app_image or info['HostConfig']['NetworkMode'] != 'container:' + keeper['Id'] or not any(c['id'] == info['Id'] for c in owner['containers']):
        raise RuntimeError('OWNED_CONTROLLER_INIT_REQUIRED')
assert_controller(controller_info)
selection = ['--testNamePattern', 'boots final image|after (' + '|'.join(selected_cases) + ')$']
limit = 3900 if 'session-expiry' in selected_cases else 600
test_environment = root/'runtime-test.env'
if options.analysis_fixture:
    import secrets
    token_path=root/'analysis-fixture.token'
    if not token_path.exists():
        with open(token_path,'x',opener=lambda p,f:os.open(p,f,0o600)) as output:output.write(secrets.token_urlsafe(32))
    values=dict(line.split('=',1) for line in test_environment.read_text().splitlines() if '=' in line)
    values.update(CALLSIGN_WORKSPACE_FAILURE_TEST='yes' if os.environ.get('CALLSIGN_WORKSPACE_FAILURE_TEST')=='yes' else 'no',CALLSIGN_MEDIA_ANALYSIS_MODE='fixture',CALLSIGN_MEDIA_ANALYSIS_CONTROL_URL='http://127.0.0.1:4101/__fixture/analysis',CALLSIGN_MEDIA_ANALYSIS_TOKEN_FILE='/run/callsign/analysis-fixture.token')
    test_environment=write_env('runtime-analysis-test',values)
child = subprocess.Popen(['timeout', str(limit + 30), 'docker', 'exec', '--env-file', str(test_environment), controller,
                          'timeout', '--signal=TERM', '--kill-after=5s', str(limit), 'node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.http.config.ts',
                          '--configLoader', 'runner', '--fsModuleCachePath', '/tmp/callsign-runtime-image-modules',
                          '--cache=false', '--reporter=json', '--outputFile=/run/callsign/runtime-media-results.json'] + selection,
                         stdout=log, stderr=subprocess.STDOUT)
completed = False
try:
    deadline = time.monotonic() + 60
    while not (root / 'image-services-request.json').exists():
        if child.poll() is not None or time.monotonic() > deadline:
            raise RuntimeError('IMAGE_TEST_PREPARATION_FAILED')
        time.sleep(.2)
    prepared = json.loads((root / 'image-services-request.json').read_text())
    state = json.loads((root / 'synthetic-public-context.json').read_text())
    db = json.loads((root / 'private-database.json').read_text())
    keys = json.loads((root / 'private-app.json').read_text())
    institution = state['institutionId']
    common = {k: prepared['environment'][k] for k in ['WEB_ORIGIN', 'PUBLIC_DEPLOYMENT', 'DEMO_MODE', 'INSTITUTION_ID', 'NETWORK_ID', 'REGISTRY_ADDRESS']}
    common.update({'CALLSIGN_ALLOW_EXTERNAL_EXECUTION': 'infrastructure', 'SERVICE_PROFILE': 'service',
                   'PLATFORM_INTERNAL_TOKEN': keys['platformToken'], 'ISSUER_URL': 'http://127.0.0.1:4101',
                   'SENDER_URL': 'http://127.0.0.1:4102', 'TRUST_BUNDLE_PATH': '/trust/trust.json',
                   'NODE_EXTRA_CA_CERTS': '/tls/ca.pem', 'VITE_SERVICE_TRUST_SHA256': prepared['pin']})
    public_mounts = [(Path(prepared['runRoot']) / 'trust.json', '/trust/trust.json'), (root / 'tls/ca.pem', '/tls/ca.pem')]
    # Fixture paths name the shared namespace; mounts expose only role-specific key files.
    public_mounts[0] = (root / Path(prepared['runRoot']).relative_to('/run/callsign') / 'trust.json', '/trust/trust.json')
    ari = 'https://127.0.0.1:8089'
    import base64
    ari_auth = base64.b64encode(('callsign:' + keys['ariPassword']).encode()).decode()
    issuer = {**common, 'SERVICE_ROLE': 'issuer', 'PORT': '4101', 'SENDER_INTERNAL_TOKEN': keys['senderToken'],
              'ISSUER_DATABASE_URL': prepared['environment']['ISSUER_DATABASE_URL'],
              'AUTH_DATABASE_URL': prepared['environment']['AUTH_DATABASE_URL'],
              'DEPLOYMENT_ID': 'test:' + institution, 'CONSUMPTION_ANCHOR_URL': 'https://127.0.0.1:4300',
              'CONSUMPTION_ANCHOR_TOKEN': db['anchorToken'], 'ISSUER_KEY_DIRECTORY': '/issuer',
              'REGISTRY_APPROVERS': ','.join(state['publicAddresses']['approver' + str(n)] for n in [1, 2, 3]),
              'ARI_URL': ari, 'ARI_AUTHORIZATION': ari_auth, 'PBX_EVIDENCE_KEY_PATH': '/pbx/evidence.json',
              'PBX_DTLS_CERT_PATH': '/tls/cert.pem', 'PBX_CREDENTIAL_SECRET': keys['pbxCredentialSecret'],
              'SIP_REALM': 'callsign-test', 'SIP_DOMAIN': '127.0.0.1', 'SIP_WSS_URL': 'wss://127.0.0.1:8443/pbx/ws',
              'PBX_PRIVATE_ADDRESS': '127.0.0.1', 'TURN_URLS': 'turn:127.0.0.1:3478?transport=udp', 'TURN_SECRET': keys['turnSecret']}
    for key, value in prepared['environment'].items():
        if key.startswith('OIDC_') or key.startswith('OFFICIAL_OIDC_'):
            issuer[key] = value
    issuer_mounts=public_mounts+[(root/'data/issuer','/issuer'),(root/'data/pbx/evidence.json','/pbx/evidence.json'),(root/'tls/cert.pem','/tls/cert.pem')]
    issuer_command=None
    if options.analysis_fixture:
        # Probe the image's normal command before mounting the observer-only provider entrypoint.
        probe=start('issuer-entrypoint-probe',issuer,issuer_mounts)
        try:
            health_probe="const end=Date.now()+20000;for(;;){try{const h=await fetch('http://127.0.0.1:4101/health');const a=await fetch('http://127.0.0.1:4101/v3/auth/me?purpose=work');if(!h.ok||a.status!==401)throw Error();break;}catch{if(Date.now()>end)throw Error('NORMAL_ISSUER_ENTRYPOINT_TIMEOUT');await new Promise(r=>setTimeout(r,200));}}"
            command(['docker','exec',controller,'node','--input-type=module','-e',health_probe],stdout=log,stderr=subprocess.STDOUT,timeout=25)
            with open(root/('normal-entrypoint-'+str(time.time_ns())+'.json'),'x') as output:json.dump({'image':app_image,'normalCommand':True,'health':200,'unauthenticatedAuth':401,'fixtureMounted':False,'scope':'startup/auth challenge, not full readiness or media'},output)
        finally:
            info=inspect(probe)
            if info['Image']!=app_image or info['Config']['Labels'].get('org.callsign.run-id')!=run_id or not any(c['id']==info['Id'] for c in owner['containers']):raise RuntimeError('OWNED_NORMAL_ENTRYPOINT_PROBE_REQUIRED')
            command(['docker','stop','-t','3',info['Id']],stdout=log,stderr=subprocess.STDOUT,timeout=10)
            command(['docker','rm',info['Id']],stdout=log,stderr=subprocess.STDOUT,timeout=10)
            (root/'issuer-entrypoint-probe.env').unlink()
        entry=Path(__file__).resolve().parent/'runtime-analysis-fixture.ts'
        if not entry.is_file():raise RuntimeError('OBSERVER_ANALYSIS_ENTRY_MISSING')
        issuer.update(CALLSIGN_ALLOW_EXTERNAL_EXECUTION='integration',CALLSIGN_RUNTIME_IMAGE_CONFIRMATION='OWNED_FINAL_IMAGE',CALLSIGN_MEDIA_FIXTURE_RUN_ID=run_id,CALLSIGN_MEDIA_FIXTURE_TOKEN_FILE='/observer/token',CALLSIGN_MEDIA_FIXTURE_OWNERSHIP='/observer/ownership.json')
        work=json.loads(subprocess.check_output(['docker','image','inspect',app_image]))[0]['Config']['WorkingDir']
        if not work.startswith('/') or '..' in Path(work).parts:raise RuntimeError('RUNTIME_WORKING_DIRECTORY_REQUIRED')
        issuer_mounts += [(entry,work.rstrip('/')+'/tests/integration/runtime-analysis-fixture.ts'),(root/'analysis-fixture.token','/observer/token'),(root/'ownership.json','/observer/ownership.json')]
        issuer_command=['pnpm','exec','tsx','tests/integration/runtime-analysis-fixture.ts','--owned-analysis-fixture']
    start('issuer',issuer,issuer_mounts,issuer_command)
    start('sender', {**common, 'SERVICE_ROLE': 'sender', 'PORT': '4102', 'SENDER_INTERNAL_TOKEN': keys['senderToken'], 'SERVICE_URI': state['serviceUri'], 'SENDER_KEY_PATH': '/sender/key.json'}, public_mounts + [(root / 'data/sender/key.json', '/sender/key.json')])
    start('platform', {**common, 'SERVICE_ROLE': 'platform', 'PORT': '4100'}, public_mounts)
    health = "const end=Date.now()+20000;for(;;){try{await Promise.all([4100,4101,4102].map(p=>fetch('http://127.0.0.1:'+p+'/health').then(r=>{if(!r.ok)throw Error()})));break;}catch{if(Date.now()>end)throw Error('ROLE_HEALTH_TIMEOUT');await new Promise(r=>setTimeout(r,200));}}"
    command(['docker', 'exec', controller, 'node', '--input-type=module', '-e', health], stdout=log, stderr=subprocess.STDOUT)
    worker = {'CALLSIGN_ALLOW_EXTERNAL_EXECUTION': 'infrastructure', 'DEPLOYMENT_PATH': '/ledger/deployment.json',
              'WORKER_DATABASE_URL': prepared['environment']['WORKER_DATABASE_URL'], 'INSTITUTION_ID': institution,
              'DEPLOYMENT_ID': 'test:' + institution, 'CONSUMPTION_ANCHOR_URL': 'https://127.0.0.1:4300',
              'CONSUMPTION_ANCHOR_TOKEN': db['anchorToken'], 'NODE_EXTRA_CA_CERTS': '/tls/ca.pem',
              'REGISTRY_ADMIN_KEY_PATH': '/keys/administrator.txt', 'REGISTRY_OPERATOR_KEY_PATH': '/keys/stopper.txt',
              'REGISTRY_APPROVERS': issuer['REGISTRY_APPROVERS'],
              'BESU_NODE_URLS': ','.join('http://127.0.0.1:' + str(18540+n) for n in [1,2,3,4]),
              'ARI_URL': ari, 'ARI_AUTHORIZATION': ari_auth}
    start('worker', worker, [(root / 'data/deployment.json', '/ledger/deployment.json'), (root / 'private-keys/administrator.txt', '/keys/administrator.txt'), (root / 'private-keys/stopper.txt', '/keys/stopper.txt'), (root / 'tls/ca.pem', '/tls/ca.pem')], ['pnpm', 'exec', 'tsx', 'scripts/service-worker.ts'])
    if options.delivery_files:
        import hashlib
        tags = {'PREPARED_RUNTIME_IMAGE': run_id + '-runtime:delivery', 'NGINX_IMAGE': run_id + '-nginx:delivery'}
        for key, ref in [('PREPARED_RUNTIME_IMAGE', app_image), ('NGINX_IMAGE', images['HTTPS_IMAGE'])]:
            existing = subprocess.run(['docker','image','inspect','--format','{{.Id}}',tags[key]],capture_output=True,text=True)
            if existing.returncode == 0 and existing.stdout.strip() != ref: raise RuntimeError('EXISTING_BUILD_ALIAS_DIFFERS')
            if existing.returncode != 0: command(['docker', 'image', 'tag', ref, tags[key]], stdout=log, stderr=subprocess.STDOUT)
        build = ['docker', 'build', '--network=none', '--pull=false', '--no-cache', '--force-rm', '--memory=2g', '--memory-swap=2g', '--cpu-quota=100000',
                 '--file', str(public / 'infra/deploy/web.Dockerfile'), '--iidfile', str(root / 'web-image-id.txt'),
                 '--build-arg', 'VITE_SERVICE_TRUST_SHA256=' + prepared['pin']]
        for key, ref in tags.items(): build += ['--build-arg', key + '=' + ref]
        command(build + ['-t', run_id + '-web:candidate', str(public)], env={**os.environ,'DOCKER_BUILDKIT':'0'}, stdout=log, stderr=subprocess.STDOUT, timeout=90)
        web_image = (root / 'web-image-id.txt').read_text().strip()
        inputs = root / 'web-inputs'
        inputs.mkdir(exist_ok=True)
        (inputs / 'nginx.conf').write_text('pid /tmp/nginx.pid;\nerror_log /dev/stderr notice;\nevents { worker_connections 128; }\nhttp { include /etc/nginx/mime.types; access_log off; client_body_temp_path /tmp/client; proxy_temp_path /tmp/proxy; fastcgi_temp_path /tmp/fastcgi; uwsgi_temp_path /tmp/uwsgi; scgi_temp_path /tmp/scgi; include /etc/nginx/conf.d/*.conf; }\n')
        start('web', {}, [(inputs/'nginx.conf','/etc/nginx/nginx.conf'), (root/'tls/ca.pem','/etc/nginx/pbx-ca.pem')], image=web_image, args=['nginx','-g','daemon off;'])
        ingress = (public / 'infra/deploy/https-nginx.conf').read_text().replace('listen 80;', 'listen 8087;').replace('listen 443 ssl;', 'listen 8443 ssl;').replace('http://web:8080', 'http://127.0.0.1:8080').replace('/tls/privkey.pem','/tls/key.pem')
        (inputs / 'https.conf').write_text(ingress)
        start('https', {}, [(inputs/'nginx.conf','/etc/nginx/nginx.conf'), (inputs/'https.conf','/etc/nginx/conf.d/default.conf'), (root/'tls/cert.pem','/tls/fullchain.pem'), (root/'tls/key.pem','/tls/key.pem')], image=images['HTTPS_IMAGE'], args=['nginx','-g','daemon off;'])
        (root / 'delivery-web-build.json').write_text(json.dumps({'runtime':app_image,'nginx':images['HTTPS_IMAGE'],'web':web_image,'pin':prepared['pin'],'dockerfileSha256':hashlib.sha256((public/'infra/deploy/web.Dockerfile').read_bytes()).hexdigest(),'source':'delivered runtime layers only; public delivery build context','hostSourceOrNodeModules':False,'awsOverrideExecuted':False},indent=2)+'\n')
    else:
        build_env = {k:v for k,v in os.environ.items() if not k.startswith('VITE_')}
        build_env.update({'VITE_SERVICE_TRUST_SHA256': prepared['pin'], 'VITE_PROTOCOL_PROFILE': 'service'})
        command(['pnpm', '--filter', '@callsign/web', 'exec', 'vite', 'build', '--outDir', str(root / 'web-inputs/dist')], env=build_env, stdout=log, stderr=subprocess.STDOUT, timeout=60)
        inputs = root / 'web-inputs'
        config = Path('infra/deploy/nginx.conf').read_text().replace('listen 8080;', 'listen 8443 ssl;\n  ssl_certificate /tls/cert.pem;\n  ssl_certificate_key /tls/key.pem;').replace('https://asterisk:8089/ws','https://127.0.0.1:8089/ws').replace('http://platform:4100/','http://127.0.0.1:4100/')
        (inputs/'default.conf').write_text(config)
        (inputs/'nginx.conf').write_text('pid /tmp/nginx.pid;\nerror_log /dev/stderr notice;\nevents { worker_connections 128; }\nhttp { include /etc/nginx/mime.types; access_log off; client_body_temp_path /tmp/client; proxy_temp_path /tmp/proxy; fastcgi_temp_path /tmp/fastcgi; uwsgi_temp_path /tmp/uwsgi; scgi_temp_path /tmp/scgi; include /etc/nginx/conf.d/*.conf; }\n')
        (inputs/'Dockerfile').write_text('ARG BASE\nFROM ${BASE}\nCOPY dist /usr/share/nginx/html\nCOPY default.conf /etc/nginx/conf.d/default.conf\nCOPY nginx.conf /etc/nginx/nginx.conf\nUSER 1000:1000\nCMD ["nginx","-g","daemon off;"]\n')
        nginx = json.loads(subprocess.check_output(['docker','image','inspect','nginx:stable']))[0]
        nginx_ref = nginx['Id']
        command(['docker','build','--network=none','--pull=false','--build-arg','BASE='+nginx_ref,'--iidfile',str(root/'web-image-id.txt'),'-t',run_id+'-web:candidate',str(inputs)],stdout=log,stderr=subprocess.STDOUT,timeout=60)
        web_image = (root/'web-image-id.txt').read_text().strip()
        start('web', {}, [(root/'tls/cert.pem','/tls/cert.pem'),(root/'tls/key.pem','/tls/key.pem'),(root/'tls/ca.pem','/etc/nginx/pbx-ca.pem')], image=web_image)
    web_health = "const end=Date.now()+10000;for(;;){try{const r=await fetch('https://127.0.0.1:8443/service');if(!r.ok)throw Error();break;}catch{if(Date.now()>end)throw Error('WEB_HTTPS_READINESS_TIMEOUT');await new Promise(r=>setTimeout(r,200));}}"
    command(['docker', 'exec', '--env', 'NODE_EXTRA_CA_CERTS=/run/callsign/tls/ca.pem', controller, 'node', '--input-type=module', '-e', web_health], stdout=log, stderr=subprocess.STDOUT)
    service_ids = [run_id + '-' + role for role in ['issuer','sender','platform','worker']]
    service_info = [inspect(i) for i in service_ids]
    if any(any(mount['Destination'].startswith('/work') or 'node_modules' in mount['Destination'] for mount in item['Mounts']) for item in service_info):
        raise RuntimeError('APPLICATION_SOURCE_MOUNT_FORBIDDEN')
    report = {'appImage':app_image,'webImage':web_image,'noApplicationSourceMounts':True,'serviceImages':{item['Name']:item['Image'] for item in service_info},'roleEnvironmentNames':{item['Name']:[e.split('=',1)[0] for e in item['Config']['Env']] for item in service_info},'configScope':'owned-loopback-test-only','analysisProvider':'explicit-observer-fixture-entrypoint' if options.analysis_fixture else 'production-entrypoint-no-fixture'}
    (root/'image-services-started.json').write_text(json.dumps(report,indent=2)+'\n')
    deadline = time.monotonic() + limit
    while child.poll() is None:
        if time.monotonic() > deadline: raise RuntimeError('OWNED_TEST_TIME_LIMIT')
        for action in ['pause','unpause']:
            request, done = root / ('pbx-control-' + action + '.request'), root / ('pbx-control-' + action + '.done')
            if request.exists() and not done.exists():
                pbx = inspect(run_id + '-pbx')
                if pbx['Config']['Labels'].get('org.callsign.run-id') != run_id or pbx['HostConfig']['NetworkMode'] != 'container:' + keeper['Id']:
                    raise RuntimeError('OWNED_PBX_CONTROL_REQUIRED')
                command(['docker', action, pbx['Id']], stdout=log, stderr=subprocess.STDOUT, timeout=15)
                done.write_text(json.dumps({action+'d':True})+'\n')
        time.sleep(.2)
    code = child.returncode
    if code:
        raise RuntimeError('RUNTIME_MEDIA_ASSERTIONS_FAILED')
    completed = True
    print('Owned final-image integration assertions completed.')
finally:
    try:
        if not completed:
            current = inspect(controller)
            assert_controller(current)
            if current['Id'] != controller_info['Id']: raise RuntimeError('CONTROLLER_CHANGED_DURING_TEST')
            command(['docker','stop','-t','3',current['Id']], stdout=log, stderr=subprocess.STDOUT, timeout=15)
    finally:
        try:
            if 'pbx-outage' in selected_cases:
                pbx = inspect(run_id + '-pbx')
                if pbx['Config']['Labels'].get('org.callsign.run-id') == run_id and pbx['State']['Paused']:
                    command(['docker','unpause',pbx['Id']], stdout=log, stderr=subprocess.STDOUT, timeout=15)
        finally:
            try:
                if child.poll() is None:
                    child.terminate()
                    try: child.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait(timeout=5)
            finally: log.close()
