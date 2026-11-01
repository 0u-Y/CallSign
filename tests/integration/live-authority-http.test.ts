// Real owned Besu/Witness + persistent HTTPS Anchor + HTTP/SQL. OIDC alone remains a local fixture.
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration'||process.env.CALLSIGN_LIVE_AUTHORITY_CONFIRMATION!=='OWNED_LOOPBACK_ONLY'||!process.env.CALLSIGN_CHAIN_TEST_ROOT)throw new Error('LIVE_AUTHORITY_INTEGRATION_BLOCKED');
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {join} from 'node:path';
import {keccak256,stringToHex,type Hex} from 'viem';
import {createHttpFixture,type HttpFixture} from './service-http-fixture.js';
import {workerLedger} from '../../services/api/src/worker-ledger.js';
import {aggregateWitnesses} from '../../services/api/src/witness-aggregate.js';
import {verifyStateBundle} from '../../packages/verifier/src/index.js';
import {generateEd25519KeyPair,hashCanonical} from '../../packages/protocol/src/index.js';
const root=process.env.CALLSIGN_CHAIN_TEST_ROOT!;
const read=async(name:string)=>JSON.parse(await readFile(join(root,name),'utf8'));
let f:HttpFixture,ledger:ReturnType<typeof workerLedger>,worker:ChildProcess,workerLog:number|undefined;
let staff:Awaited<ReturnType<HttpFixture['login']>>,agent:typeof staff,receiver:typeof staff,digest:string,attemptId:string;
const settle=async(kind:string)=>{
 await vi.waitFor(async()=>{
  expect(worker.exitCode,'Actual worker must remain running').toBeNull();
  const rows=await f.sql`SELECT status,last_error FROM issuer_v2.outbox WHERE institution_id=${f.id} AND kind=${kind}`;
  expect(rows.length).toBeGreaterThan(0);expect(rows.some(r=>r.status==='failed'),JSON.stringify(rows)).toBe(false);expect(rows.every(r=>r.status==='done')).toBe(true);
 },{timeout:15000,interval:300});
};
beforeAll(async()=>{
 f=await createHttpFixture({web:false,liveDirectory:root});await f.start();
 const d=await read('data/deployment.json'),c=await read('live-http-context.json');
 const key=async(role:string)=>(await readFile(join(root,'private-keys',role+'.txt'),'utf8')).trim() as Hex;
 ledger=workerLedger({networkId:Number(d.networkId),genesisHash:d.genesisHash,registry:d.registryAddress,codeHash:d.registryCodeHash,rpcUrls:[1,2,3,4].map(n=>`http://127.0.0.1:${18540+n}`),administratorKey:await key('administrator'),stopperKey:await key('stopper'),approvers:[1,2,3].map(n=>c.publicAddresses[`approver${n}`])});
 // Real worker entrypoint: no ARI fixture or synthetic successful cleanup.
 workerLog=openSync(join(f.runRoot,'worker.log'),'wx',0o600);
 worker=spawn(process.execPath,['--import','tsx','scripts/service-worker.ts'],{stdio:['ignore',workerLog,workerLog],env:{...process.env,CALLSIGN_ALLOW_EXTERNAL_EXECUTION:'infrastructure',DEPLOYMENT_PATH:join(root,'data/live-http-deployment.json'),INSTITUTION_ID:f.id,BESU_NODE_URLS:[1,2,3,4].map(n=>`http://127.0.0.1:${18540+n}`).join(','),REGISTRY_ADMIN_KEY_PATH:join(root,'private-keys/administrator.txt'),REGISTRY_OPERATOR_KEY_PATH:join(root,'private-keys/stopper.txt')}});

},30000);
afterAll(async()=>{if(worker&&worker.exitCode===null){const exited=once(worker,'exit');worker.kill('SIGTERM');const timeout=setTimeout(()=>worker.kill('SIGKILL'),5000);try{await exited;}finally{clearTimeout(timeout);}}if(workerLog!==undefined)closeSync(workerLog);await f?.close();});
it('logs in through OIDC/PKCE and persists pending work/delegation with distinct minimum-privilege SQL roles',async()=>{
 staff=await f.login('staff');agent=await f.login('agent');receiver=await f.login('recipient');
 for(const login of [staff,agent,receiver])expect(login.done.status).toBe(200);
 const created=await staff.c.request('/v3/intents',{id:'live-contact',recipientId:f.uid('recipient'),agentId:f.uid('agent'),serviceUri:(await read('live-http-context.json')).serviceUri,expiresAt:Math.floor(Date.now()/1000)+3600});expect(created.status).toBe(200);
 const vc=await staff.c.request('/v3/credentials',{serviceUri:(await read('live-http-context.json')).serviceUri});expect(vc.status,JSON.stringify(vc.body)).toBe(200);expect(vc.body.state).toBe('pending');digest=vc.body.digest;
 expect((await f.sql`SELECT status FROM issuer_v2.recovery_gate WHERE institution_id=${f.id}`)[0]!.status).toBe('ready');
 const anchor=await f.anchor.read(f.id);expect(BigInt(anchor.sequence)).toBeGreaterThan(0n);expect(anchor.epoch).toBe((await f.state()).epoch);
 expect((await agent.c.request('/v3/intents',{id:'forbidden'})).status).toBeGreaterThanOrEqual(400);
});
it('registers the API-issued delegation through the durable worker and obtains real fresh Witness signatures before authorization',async()=>{
 await settle('credential.register');expect((await f.state()).serviceV3!.credentials[digest]!.state).toBe('registered');
 const trust=JSON.parse(await readFile(join(f.runRoot,'trust.json'),'utf8'));
 const bundle=await aggregateWitnesses({endpoints:trust.endpoints,institutionId:f.id,delegationId:digest,trust});
 const verified=await verifyStateBundle(bundle,trust,{expectedInstitutionId:f.id,expectedDelegationId:digest,nowWallSeconds:Math.floor(Date.now()/1000),nowMonotonicMs:performance.now(),maxStateAgeSeconds:10});expect(verified.signerIds.length).toBeGreaterThanOrEqual(3);expect(bundle.snapshot.delegationState.exists).toBe(true);
 const attempt=await agent.c.request('/v3/attempts',{intentId:'live-contact',profile:'asterisk-webrtc-v3'});expect(attempt.status,JSON.stringify(attempt.body)).toBe(200);attemptId=attempt.body.id;
 const key=await generateEd25519KeyPair(),challenge=await agent.c.request('/v3/challenge',{attemptId,digest,publicKey:key.publicJwk});expect(challenge.status,JSON.stringify(challenge.body)).toBe(200);
 const proof=await agent.c.request('/v3/sender-proof',{challengeId:challenge.body.challengeId});expect(proof.status,JSON.stringify(proof.body)).toBe(200);
 const auth=await agent.c.request('/v3/authorizations',{challengeId:challenge.body.challengeId,proofJws:proof.body.jws});expect(auth.status,JSON.stringify(auth.body)).toBe(200);expect(auth.body.payload.epoch).toBe(bundle.snapshot.institutionState.epoch);expect(auth.body.payload.callProfile).toBe('asterisk-webrtc-v3');
 const outbox=await f.sql`SELECT signed_transaction,transaction_hash,receipt_block FROM issuer_v2.outbox WHERE institution_id=${f.id} AND kind='credential.register'`;expect(outbox[0]!.signed_transaction).toMatch(/^0x/);expect(outbox[0]!.receipt_block).toMatch(/^\d+$/);
 expect(hashCanonical(auth.body.payload)).toMatch(/^[0-9a-f]{64}$/);
});
it('submits a real emergency stop through HTTP/outbox and observes chain/Witness revocation in persisted API authority',async()=>{
 const response=await staff.c.request('/v3/management/suspend',{});expect(response.status,JSON.stringify(response.body)).toBe(200);expect(response.body.ledger).toBe('pending');
 await settle('institution.suspend');await vi.waitFor(async()=>{expect((await f.state()).observedEpoch).toBeDefined();},{timeout:5000,interval:200});
 const record=await f.state();expect(record.status).toBe('suspended');expect(BigInt(record.observedEpoch!)).toBeGreaterThan(BigInt(record.epoch));expect(record.serviceV3!.credentials[digest]!.state).toBe('revoked');
 const trust=JSON.parse(await readFile(join(f.runRoot,'trust.json'),'utf8')),bundle=await aggregateWitnesses({endpoints:trust.endpoints,institutionId:f.id,delegationId:digest,trust});expect(bundle.snapshot.institutionState.status).toBe('Suspended');
 const key=await generateEd25519KeyPair();expect((await agent.c.request('/v3/challenge',{attemptId,digest,publicKey:key.publicJwk})).status).toBeGreaterThanOrEqual(400);
 expect(record.serviceV3!.attempts[attemptId]!.status).toBe('cancelled');
});
