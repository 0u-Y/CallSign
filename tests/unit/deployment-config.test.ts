import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
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
