import {it,expect} from 'vitest';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {awsPreflight} from '../../scripts/preflight-aws.js';
import {reviewDeploymentImage} from '../../scripts/image-reference.mjs';
import {anchorListenHost} from '../../services/api/src/consumption-anchor.js';
const env={CALLSIGN_DEPLOYMENT_TARGET:'aws',AWS_DEPLOYMENT_MODE:'new',PUBLIC_DEPLOYMENT:'true',DEMO_MODE:'false',AWS_RELEASE_DIR:'/srv/release',AWS_VOLUME_ROOT:'/srv/volumes',FINALS_DATA_DIR:'/srv/config',AWS_WEB_TLS_DIR:'/srv/tls',WEB_ORIGIN:'https://contest.example',OIDC_ISSUER:'https://id.example',OIDC_JWKS_URL:'https://id.example/jwks',OIDC_AUTHORIZATION_URL:'https://id.example/authorize',OIDC_TOKEN_URL:'https://id.example/token',CONSUMPTION_ANCHOR_URL:'https://anchor.example',OIDC_CLIENT_ID:'work',OFFICIAL_OIDC_CLIENT_ID:'official',OIDC_AUDIENCE:'work-aud',OFFICIAL_OIDC_AUDIENCE:'official-aud',INSTITUTION_ID:'synthetic-institution',DEPLOYMENT_ID:'synthetic-deployment',CALLSIGN_PROJECT:'synthetic-project',SIP_WSS_URL:'wss://contest.example/pbx/ws'};
it('separates AWS preparation from generated runtime images and rejects developer endpoints including credentialed DB URLs',()=>{
 expect(awsPreflight(env).filter(c=>['FAIL','BLOCKED'].includes(c.status))).toEqual([]);
 expect(awsPreflight({...env,PATH:'/home/developer/bin',NVM_DIR:'/home/developer/.nvm',COREPACK_ROOT:'/home/developer/tools'}).filter(c=>c.status==='FAIL')).toEqual([]);
 expect(awsPreflight(env,'runtime').find(c=>c.id==='CALLSIGN_WEB_IMAGE')?.status).toBe('BLOCKED');
 const checks=awsPreflight({...env,ISSUER_DATABASE_URL:'postgres://unit:private@dev.example:5432/callsign',AWS_VOLUME_ROOT:'/home/developer/.local/db'},'prepare',['dev.example']);
 expect(checks.find(c=>c.id==='standalone:ISSUER_DATABASE_URL')?.status).toBe('FAIL');expect(checks.find(c=>c.id==='AWS_VOLUME_ROOT')?.status).toBe('FAIL');expect(JSON.stringify(checks)).not.toContain('private');
 expect(awsPreflight({...env,CONSUMPTION_ANCHOR_URL:'https://127.0.0.1:4300'}).find(c=>c.id==='CONSUMPTION_ANCHOR_URL')?.status).toBe('FAIL');
});
it('requires distinct official OIDC context, explicit deployment mode and TLS for remote Anchor binding',()=>{
 expect(awsPreflight({...env,OFFICIAL_OIDC_CLIENT_ID:'work'}).find(c=>c.id==='aws-oidc-separation')?.status).toBe('BLOCKED');
 expect(awsPreflight({...env,AWS_DEPLOYMENT_MODE:'reset'}).find(c=>c.id==='aws-mode')?.status).toBe('FAIL');
 expect(anchorListenHost()).toBe('127.0.0.1');expect(()=>anchorListenHost('0.0.0.0')).toThrow('REMOTE_ANCHOR_REQUIRES_TLS');expect(anchorListenHost('0.0.0.0',true)).toBe('0.0.0.0');
});
it('distinguishes amd64 image config identity from registry digest and rejects the old synthetic-trust web image',()=>{
 const id='sha256:'+'1'.repeat(64),pin='a'.repeat(64),info={Id:id,Os:'linux',Architecture:'amd64',RepoDigests:['unit/image@sha256:'+'2'.repeat(64)],Config:{Labels:{'org.callsign.trust-sha256':pin}}};
 expect(reviewDeploymentImage('CALLSIGN_WEB_IMAGE',id,info,pin).configId).toBe(id);
 expect(()=>reviewDeploymentImage('CALLSIGN_WEB_IMAGE',id,info,'b'.repeat(64))).toThrow('AWS_WEB_REBUILD');
 expect(()=>reviewDeploymentImage('CALLSIGN_APP_IMAGE',id,{...info,Architecture:'arm64'})).toThrow('LINUX_AMD64');
});
it('renders the explicit Docker TURN NAT mapping once and refuses to overwrite existing configuration',async()=>{
 const root=await mkdtemp(join(tmpdir(),'callsign-turn-render-')),dest=join(root,'turn');
 const args=['--import','tsx','scripts/prepare-pbx.ts',dest,'--turn','--apply'];const environment={PATH:process.env.PATH,CALLSIGN_ALLOW_EXTERNAL_EXECUTION:'infrastructure',TURN_SECRET:'unit-only-not-an-operating-secret-value',SIP_REALM:'turn.example',PBX_PUBLIC_ADDRESS:'203.0.113.1',TURN_PRIVATE_ADDRESS:'10.205.0.30'};
 try{execFileSync(process.execPath,args,{env:environment,stdio:'pipe'});const content=await readFile(join(dest,'turnserver.conf'),'utf8');expect(content).toContain('external-ip=203.0.113.1/10.205.0.30');expect(content).toContain('denied-peer-ip=169.254.0.0-169.254.255.255');expect(content).toContain('allow-loopback-peers=0');expect(content).not.toContain('no-loopback-peers');expect(content).not.toMatch(/@[A-Z_]+@/);expect(()=>execFileSync(process.execPath,args,{env:environment,stdio:'pipe'})).toThrow();expect(await readFile(join(dest,'turnserver.conf'),'utf8')).toBe(content);}finally{await rm(root,{recursive:true});}
});
it('keeps TLS/port/egress/storage boundaries in the AWS Compose overlay and blocks deployment before Docker without approval',async()=>{
 const main=await readFile('infra/deploy/compose.yml','utf8'),aws=await readFile('infra/deploy/compose.aws.yml','utf8'),anchor=await readFile('infra/deploy/compose.anchor.yml','utf8');
 expect(main).toContain("command: ['turnserver', '-c'");expect(main.slice(main.indexOf('  worker:'),main.indexOf('  migration-runner:'))).toContain('networks: [application, ledger, egress]');expect(aws).toContain('ports: !reset []');expect(aws).toContain('AWS_VOLUME_ROOT');expect(anchor).toContain('ANCHOR_HOST: 0.0.0.0');expect(anchor).not.toContain('5432:5432');
 expect(()=>execFileSync('bash',['scripts/deployment.sh','start'],{env:{PATH:process.env.PATH},stdio:'pipe'})).toThrow();
});
it('selects AWS from the protected env file and refuses unapproved execution before invoking Docker',async()=>{
 const root=await mkdtemp(join(tmpdir(),'callsign-aws-target-')),path=join(root,'aws.env');
 try{await writeFile(path,'CALLSIGN_DEPLOYMENT_TARGET=aws\n',{mode:0o600});try{execFileSync('bash',['scripts/deployment.sh','stop'],{env:{PATH:process.env.PATH,CALLSIGN_ALLOW_EXTERNAL_EXECUTION:'infrastructure',CALLSIGN_ENV_FILE:path},stdio:'pipe'});throw Error('AWS_GUARD_MISSING');}catch(e){expect((e as {status:number}).status).toBe(78);expect(String((e as {stderr:Buffer}).stderr)).toContain('AWS target confirmation required');}}finally{await rm(root,{recursive:true});}
});
