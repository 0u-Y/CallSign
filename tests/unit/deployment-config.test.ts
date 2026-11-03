import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
it.each(['infra/deploy/compose.yml','infra/deploy/compose.pbx.yml'])('documents every deployment variable used by %s without resolving secrets or running Compose',file=>{
 const declared=new Set(readFileSync('.env.example','utf8').split('\n').filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>l.split('=',1)[0]));
 const used=[...readFileSync(file,'utf8').matchAll(/\$\{([A-Z_][A-Z0-9_]*)/g)].map(m=>m[1]!);
 expect([...new Set(used)].filter(name=>!declared.has(name))).toEqual([]);
});
it('uses the service entrypoint and explicitly supplies worker retention and public CA trust mounts',()=>{
 const pkg=JSON.parse(readFileSync('services/api/package.json','utf8'));
 const root=JSON.parse(readFileSync('package.json','utf8'));expect(root.scripts['trust:generate']).toBe('tsx scripts/prepare-finals.ts trust');expect(root.scripts['trust:generate:legacy']).toBe('tsx scripts/generate-web-trust.ts');
 expect(pkg.scripts.start).toBe('tsx src/finals-server.ts');expect(pkg.scripts['start:legacy']).toBe('tsx src/server.ts');
 const compose=readFileSync('infra/deploy/compose.yml','utf8');const issuer=compose.split('\n  issuer:')[1]!.split('\n  sender:')[0]!;const worker=compose.split('\n  worker:')[1]!.split('\n  migration-runner:')[0]!;
 for(const role of [issuer,worker]){expect(role).toContain('NODE_EXTRA_CA_CERTS: /tls/extra-ca.pem');expect(role).toContain('${SERVICE_EXTRA_CA_PATH:?');expect(role).toContain('target: /tls/extra-ca.pem');expect(role).toContain('read_only: true');expect(role).toContain('bind: {create_host_path: false}');}
 expect(worker).toContain('RETENTION_SECONDS: ${RETENTION_SECONDS:-604800}');
});
it('keeps integration entrypoints, nested env files and private certificates out of the image build context',()=>{
 const excluded=readFileSync('.dockerignore','utf8').split('\n');
 for(const path of ['services/api/test','tests','**/*.test.ts','**/.env','**/.env.*','**/*.key','**/*.pem'])expect(excluded).toContain(path);
 const dockerfile=readFileSync('infra/deploy/app.Dockerfile','utf8');expect(dockerfile).toContain('src/finals-server.ts');expect(dockerfile).not.toContain('COPY . .');
});

it('allows the authenticated UI to start before PBX readiness without replacing readiness by liveness',()=>{
 const compose=readFileSync('infra/deploy/compose.yml','utf8');
 expect(compose).toContain("process.env.PORT+'/readiness'");
 expect(compose).toContain('issuer: { condition: service_started }');expect(compose).toContain('sender: { condition: service_started }');expect(compose).toContain('depends_on: { platform: { condition: service_started } }');
 expect(compose).toContain('depends_on: { postgres: { condition: service_healthy } }');
});

it('keeps offline image workspace checks and generator network isolation explicit',()=>{
 const generator=readFileSync('scripts/generate-besu.sh','utf8');expect(generator).toContain('--network none');expect(generator).toContain('--memory 1g');
 const dockerfile=readFileSync('infra/deploy/app.Dockerfile','utf8');expect(dockerfile).toContain('AS local-runtime');expect(dockerfile).toContain('LOCAL_WORKSPACE_ROOT');expect(dockerfile).toContain('pnpm --filter @callsign/witness exec node --version');
 expect(readFileSync('pnpm-workspace.yaml','utf8')).toContain('verifyDepsBeforeRun: error');
 expect(dockerfile).not.toContain('verify-deps-before-run=false');
});

it('keeps real chain integration outside light and database suites with an explicit guard',()=>{
 const pkg=JSON.parse(readFileSync('package.json','utf8'));
 expect(pkg.scripts['test:chain-runtime']).toContain('scripts/restricted.mjs chain');
 expect(pkg.scripts['test:chain-runtime']).toContain('--configLoader runner');
 expect(readFileSync('vitest.integration.config.ts','utf8')).toContain('tests/integration/chain-runtime.test.ts');
 expect(readFileSync('vitest.chain.config.ts','utf8')).toContain('CHAIN_INTEGRATION_REQUIRED');
});

it('ships the historical report required by the web bundle and avoids dependency-directory config writes',()=>{
 const web=readFileSync('infra/deploy/web.Dockerfile','utf8');expect(web).toContain('vite build --configLoader runner');expect(web).toContain('COPY artifacts/test-results.json artifacts/test-results.json');
 expect(readFileSync('scripts/release-manifest.ts','utf8')).toContain("'artifacts/test-results.json'");expect(readFileSync('.dockerignore','utf8')).toContain('!artifacts/test-results.json');
});

it('keeps NEW rehearsal preparation dry and denies unapproved execution before Docker or file creation',()=>{
 const args=['tests/integration/runtime-delivery-bootstrap.py','--delivery','.local/nonexistent-delivery','--root','.local/media-delivery-unit-dry','--browser-cache','/nonexistent-browser'];
 const dry=JSON.parse(execFileSync('python3',args,{encoding:'utf8'}));expect(dry.mode).toBe('dry-run');expect(dry.scope).toContain('AWS override is NOT executed');
 expect(()=>execFileSync('python3',[...args,'--apply'],{env:{PATH:process.env.PATH},stdio:'pipe'})).toThrow(/INTEGRATION_EXECUTION_BLOCKED/);
});

it('rejects unowned or differently configured existing rehearsal containers before reuse',()=>{
 const check=`import ast,copy,json
from pathlib import Path
module=ast.parse(Path('tests/integration/runtime-delivery-bootstrap.py').read_text())
fn=next(node for node in module.body if isinstance(node,ast.FunctionDef) and node.name=='owned_container')
info={'Id':'owned-id','Image':'reviewed-image','Config':{'Labels':{'org.callsign.run-id':'unit-owned'}},'HostConfig':{'NetworkMode':'container:unit-namespace','PortBindings':{}}}
scope={'json':json,'run':'unit-owned','owner':{'containers':[{'id':'owned-id'}]},'capture':lambda args:json.dumps([info])}
exec(compile(ast.Module(body=[fn],type_ignores=[]),'real-owned-container-guard','exec'),scope)
verify=scope['owned_container'];assert verify('name','reviewed-image','container:unit-namespace')['Id']=='owned-id'
original=copy.deepcopy(info)
for mutation in ['label','image','network','ports','id']:
 info=copy.deepcopy(original)
 if mutation=='label':info['Config']['Labels']['org.callsign.run-id']='another-workload'
 if mutation=='image':info['Image']='different-image'
 if mutation=='network':info['HostConfig']['NetworkMode']='host'
 if mutation=='ports':info['HostConfig']['PortBindings']={'5432/tcp':[{'HostPort':'5432'}]}
 if mutation=='id':info['Id']='unrecorded-id'
 try:verify('name','reviewed-image','container:unit-namespace')
 except RuntimeError:continue
 raise AssertionError('unsafe existing container accepted:'+mutation)
volume_fn=next(node for node in module.body if isinstance(node,ast.FunctionDef) and node.name=='owned_volume')
exec(compile(ast.Module(body=[volume_fn],type_ignores=[]),'real-owned-volume-guard','exec'),scope)
info={'Name':'unit-volume','Labels':{'org.callsign.run-id':'unit-owned'}};scope['owner']['volumes']=['unit-volume']
assert scope['owned_volume']('unit-volume')['Name']=='unit-volume'
for labels,recorded in [({'org.callsign.run-id':'another-workload'},['unit-volume']),({'org.callsign.run-id':'unit-owned'},[])]:
 info={'Name':'unit-volume','Labels':labels};scope['owner']['volumes']=recorded
 try:scope['owned_volume']('unit-volume')
 except RuntimeError:continue
 raise AssertionError('unsafe existing volume accepted')
`;
 expect(()=>execFileSync('python3',['-c',check],{stdio:'pipe'})).not.toThrow();
});

it('refuses to stop a replaced or foreign observer controller',()=>{
 const check=`import ast,copy
from pathlib import Path
module=ast.parse(Path('tests/integration/runtime-media-driver.py').read_text())
fn=next(node for node in module.body if isinstance(node,ast.FunctionDef) and node.name=='assert_controller')
scope={'run_id':'unit-owned','app_image':'reviewed-image','keeper':{'Id':'namespace'},'owner':{'containers':[{'id':'controller-id'}]}}
exec(compile(ast.Module(body=[fn],type_ignores=[]),'real-controller-guard','exec'),scope)
info={'Id':'controller-id','Image':'reviewed-image','Config':{'Labels':{'org.callsign.run-id':'unit-owned'}},'HostConfig':{'Init':True,'NetworkMode':'container:namespace'}}
scope['assert_controller'](info)
for field in ['id','image','label','init','network']:
 candidate=copy.deepcopy(info)
 if field=='id':candidate['Id']='another-controller'
 if field=='image':candidate['Image']='another-image'
 if field=='label':candidate['Config']['Labels']['org.callsign.run-id']='another-workload'
 if field=='init':candidate['HostConfig']['Init']=False
 if field=='network':candidate['HostConfig']['NetworkMode']='host'
 try:scope['assert_controller'](candidate)
 except RuntimeError:continue
 raise AssertionError('unsafe controller accepted:'+field)
`;
 expect(()=>execFileSync('python3',['-c',check],{stdio:'pipe'})).not.toThrow();
});

it('keeps the offline runtime recipe independent of dependency-install stages and requires an explicit base',()=>{
 const source=readFileSync('infra/deploy/prepared-runtime.Dockerfile','utf8');
 expect(source.match(/^FROM .+$/gm)).toEqual(['FROM ${PREPARED_RUNTIME_IMAGE} AS prepared-runtime']);expect(source).toMatch(/^ARG PREPARED_RUNTIME_IMAGE$/m);expect(source).not.toMatch(/(?:corepack prepare|pnpm install|curl|wget)/);
 for(const path of ['packages','services','scripts','apps/web','infra/deploy'])expect(source).toContain(`COPY ${path} ${path}`);
 expect(readFileSync('infra/deploy/app.Dockerfile','utf8')).not.toContain('AS prepared-runtime');
});
