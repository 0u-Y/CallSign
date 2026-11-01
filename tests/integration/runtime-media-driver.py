"""Explicit host-side driver for the owned final-image integration test; creates no network or published port."""
import argparse, json, os, re, subprocess, time
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--case', choices=['logout','work-cancel','lease-expiry','delegation-revoke','emergency-stop'])
selected_case = parser.parse_args().case

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

def command(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]

import base64
credential = json.loads((root / 'private-app.json').read_text())['pbxCredentialSecret']
if len(base64.urlsafe_b64decode(credential + '=' * (-len(credential) % 4))) != 32:
    raise SystemExit('PBX_CREDENTIAL_SECRET_MUST_DECODE_TO_32_BYTES')

keeper = inspect(run_id + '-net')
if keeper['Config']['Labels'].get('org.callsign.run-id') != run_id or keeper['HostConfig']['NetworkMode'] != 'none':
    raise SystemExit('OWNED_NONE_NAMESPACE_REQUIRED')

def write_env(name, values):
    path = root / (name + '.env')
    with open(path, 'x', opener=lambda p, f: os.open(p, f, 0o600)) as output:
        output.write(''.join(k + '=' + str(v) + '\n' for k, v in values.items()))
    return path

def start(role, env, mounts, args=None, image=app_image, memory='512m'):
    name = run_id + '-' + role
    env_path = write_env(role, env)
    request = ['docker', 'run', '-d', '--name', name, '--label', 'org.callsign.run-id=' + run_id,
               '--network', 'container:' + run_id + '-net', '--memory', memory, '--memory-swap', memory,
               '--cpus', '1', '--pids-limit', '128', '--read-only', '--cap-drop', 'ALL',
               '--security-opt', 'no-new-privileges', '--tmpfs', '/tmp:rw,nosuid,nodev,size=67108864',
               '--env-file', str(env_path)]
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
if controller_info['Config']['Labels'].get('org.callsign.run-id') != run_id or not controller_info['HostConfig'].get('Init'):
    raise SystemExit('OWNED_CONTROLLER_INIT_REQUIRED')
selection = ['--testNamePattern', 'boots final image|after ' + selected_case + '$'] if selected_case else []
child = subprocess.Popen(['timeout', '600', 'docker', 'exec', '--env-file', str(root / 'runtime-test.env'), controller,
                          'node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.http.config.ts',
                          '--configLoader', 'runner', '--fsModuleCachePath', '/tmp/callsign-runtime-image-modules',
                          '--cache=false', '--reporter=json', '--outputFile=/run/callsign/runtime-media-results.json'] + selection,
                         stdout=log, stderr=subprocess.STDOUT)
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
    start('issuer', issuer, public_mounts + [(root / 'data/issuer', '/issuer'), (root / 'data/pbx/evidence.json', '/pbx/evidence.json'), (root / 'tls/cert.pem', '/tls/cert.pem')])
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
    build_env = {k:v for k,v in os.environ.items() if not k.startswith('VITE_')}
    build_env.update({'VITE_SERVICE_TRUST_SHA256': prepared['pin'], 'VITE_PROTOCOL_PROFILE': 'service'})
    command(['pnpm', '--filter', '@callsign/web', 'exec', 'vite', 'build', '--outDir', str(root / 'web-inputs/dist')], env=build_env, stdout=log, stderr=subprocess.STDOUT, timeout=60)
    inputs = root / 'web-inputs'
    config = Path('infra/deploy/nginx.conf').read_text().replace('listen 8080;', 'listen 8443 ssl;\n  ssl_certificate /tls/cert.pem;\n  ssl_certificate_key /tls/key.pem;').replace('https://asterisk:8089/ws','https://127.0.0.1:8089/ws').replace('http://platform:4100/','http://127.0.0.1:4100/')
    (inputs/'default.conf').write_text(config)
    (inputs/'nginx.conf').write_text('pid /tmp/nginx.pid;\nerror_log /dev/stderr notice;\nevents { worker_connections 128; }\nhttp { include /etc/nginx/mime.types; access_log off; client_body_temp_path /tmp/client; proxy_temp_path /tmp/proxy; fastcgi_temp_path /tmp/fastcgi; uwsgi_temp_path /tmp/uwsgi; scgi_temp_path /tmp/scgi; include /etc/nginx/conf.d/*.conf; }\n')
    (inputs/'Dockerfile').write_text('ARG BASE\nFROM ${BASE}\nCOPY dist /usr/share/nginx/html\nCOPY default.conf /etc/nginx/conf.d/default.conf\nCOPY nginx.conf /etc/nginx/nginx.conf\nUSER 1000:1000\nCMD ["nginx","-g","daemon off;"]\n')
    nginx = json.loads(subprocess.check_output(['docker','image','inspect','nginx:stable']))[0]
    nginx_ref = nginx['RepoDigests'][0] if nginx.get('RepoDigests') else nginx['Id']
    command(['docker','build','--network=none','--pull=false','--build-arg','BASE='+nginx_ref,'--iidfile',str(root/'web-image-id.txt'),'-t',run_id+'-web:candidate',str(inputs)],stdout=log,stderr=subprocess.STDOUT,timeout=60)
    web_image = (root/'web-image-id.txt').read_text().strip()
    start('web', {}, [(root/'tls/cert.pem','/tls/cert.pem'),(root/'tls/key.pem','/tls/key.pem'),(root/'tls/ca.pem','/etc/nginx/pbx-ca.pem')], image=web_image)
    web_health = "const end=Date.now()+10000;for(;;){try{const r=await fetch('https://127.0.0.1:8443/service');if(!r.ok)throw Error();break;}catch{if(Date.now()>end)throw Error('WEB_HTTPS_READINESS_TIMEOUT');await new Promise(r=>setTimeout(r,200));}}"
    command(['docker', 'exec', '--env', 'NODE_EXTRA_CA_CERTS=/run/callsign/tls/ca.pem', controller, 'node', '--input-type=module', '-e', web_health], stdout=log, stderr=subprocess.STDOUT)
    service_ids = [c['id'] for c in owner['containers'] if c['role'] in ['final-image-issuer','final-image-sender','final-image-platform','final-image-worker']]
    service_info = [inspect(i) for i in service_ids]
    if any(any(mount['Destination'].startswith('/work') or 'node_modules' in mount['Destination'] for mount in item['Mounts']) for item in service_info):
        raise RuntimeError('APPLICATION_SOURCE_MOUNT_FORBIDDEN')
    report = {'appImage':app_image,'webImage':web_image,'noApplicationSourceMounts':True,'serviceImages':{item['Name']:item['Image'] for item in service_info},'roleEnvironmentNames':{item['Name']:[e.split('=',1)[0] for e in item['Config']['Env']] for item in service_info},'configScope':'owned-loopback-test-only'}
    (root/'image-services-started.json').write_text(json.dumps(report,indent=2)+'\n')
    code = child.wait(timeout=450)
    if code:
        raise RuntimeError('RUNTIME_MEDIA_ASSERTIONS_FAILED')
    print('Owned final-image integration assertions completed.')
finally:
    if child.poll() is None:
        child.terminate()
        child.wait(timeout=5)
    log.close()
