import { authorityStateHash } from '../../services/api/src/finals-model.js';
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration')throw new Error('INTEGRATION_EXECUTION_BLOCKED');
import { afterAll,expect,it } from 'vitest';
import postgres from 'postgres';
import {postgresAuthorityStore} from '../../services/api/src/finals-store.js';
import {journalEntry} from '../../services/api/src/service-worker.js';
import {assertAnchorMatches,type Anchor} from '../../services/api/src/consumption-anchor.js';
import { PbxEndpoints } from '../../services/api/src/pbx-routes.js';
import {serviceFixture} from '../unit/service-fixture.js';
import { randomUUID } from 'node:crypto';
import { postgresQuotaStore } from '../../services/api/src/quota.js';
import { postgresWorkerStore } from '../../services/api/src/service-worker.js';
// Requires an explicitly provisioned disposable database with migrations through 0005; no startup/migration hooks.
const url=process.env.MIGRATOR_DATABASE_URL;if(!url)throw new Error('EXPLICIT_INTEGRATION_DATABASE_URL_REQUIRED');
const sql=postgres(url,{max:2}),quota=postgresQuotaStore(url),worker=postgresWorkerStore(url,async()=>{});
afterAll(async()=>{await worker.close();await quota.close();await sql.end();});
it('reserves a shared budget under contention and settles a reservation only once',async()=>{
 const run=randomUUID(),key=`integration-global:${run}`,scopes=[{key,limit:10}],ids=[`quota-a:${run}`,`quota-b:${run}`];
 const results=await Promise.allSettled(ids.map(id=>quota.reserve(id,'test-institution','test-units',7,scopes,Math.floor(Date.now()/1000)+60)));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const winner=ids[results.findIndex(r=>r.status==='fulfilled')]!;
 await quota.settle(winner,3);await quota.settle(winner,3);await expect(quota.settle(winner,4)).rejects.toThrow('QUOTA_SETTLEMENT_CONFLICT');
 const rows=await sql`SELECT used,reserved FROM issuer_v2.quota_balances WHERE key=${key}`;expect(Number(rows[0]!.used)).toBe(3);expect(Number(rows[0]!.reserved)).toBe(0);
});
it('claims a job once across workers and fences an expired claim before committing a result',async()=>{
 const run=randomUUID(),institution=`worker-test:${run}`;await sql`INSERT INTO issuer_v2.institutions(id,state) VALUES(${institution},'{}')`;await sql`INSERT INTO issuer_v2.recovery_gate(institution_id,status) VALUES(${institution},'ready')`;await sql`INSERT INTO issuer_v2.outbox(id,institution_id,kind,object_id,payload) VALUES(${run},${institution},'intent.created','test','{}')`;
 const second=postgresWorkerStore(url,async()=>{});try{
  const jobs=await Promise.all([worker.claim(),second.claim()]);const claimed=jobs.filter(j=>j?.id===run);expect(claimed).toHaveLength(1);const job=claimed[0]!;
  await sql`UPDATE issuer_v2.outbox SET lease_until=now()-interval '1 second' WHERE id=${run}`;
  expect(await worker.renew(job)).toBe(false);await expect(worker.complete(job)).rejects.toThrow('CLAIM_LOST');
  const recovered=await worker.claim();expect(recovered?.id).toBe(run);expect(recovered?.claim_token).not.toBe(job.claim_token);if(recovered)await worker.complete(recovered);
 }finally{await second.close();await sql`DELETE FROM issuer_v2.outbox WHERE id=${run}`;await sql`DELETE FROM issuer_v2.recovery_gate WHERE institution_id=${institution}`;await sql`DELETE FROM issuer_v2.institutions WHERE id=${institution}`;}
});

it('cannot recreate SIP credentials from an idempotent result after terminal cleanup',async()=>{
 const f=await serviceFixture(),id=`endpoint-test:${randomUUID()}`,record=await f.store.read(f.institution.institutionId),attempt=record.serviceV3!.attempts[f.attempt.id]!;
 record.id=id;const now=Math.floor(Date.now()/1000);attempt.firstConnectBy=now+120;attempt.callEndBy=now+3600;for(const i of Object.values(record.intents)){i.institutionId=id;i.expiresAt=now+3600;}for(const a of Object.values(record.serviceV3!.authorizations))a.payload.institutionId=id;
 const endpoints=new PbxEndpoints({databaseUrl:url!,secret:Buffer.alloc(32,1).toString('base64url'),realm:'test.example',wssUrl:'wss://test.example/pbx/ws',sipDomain:'test.example',mediaAddress:'10.205.0.20'}),username=`cs-${randomUUID()}`,encrypted=endpoints.generate(username);
 attempt.pbx={bridgeId:'test-bridge',senderChannelId:'s',recipientChannelId:'r',senderEndpoint:'s',recipientEndpoint:username,state:'reserved',reports:{},credentials:{recipient:encrypted}};
 try{
  await sql`INSERT INTO issuer_v2.institutions(id,state) VALUES(${id},${sql.json(record as unknown as postgres.JSONValue)})`;await sql`INSERT INTO issuer_v2.recovery_gate(institution_id,status) VALUES(${id},'ready')`;
  await endpoints.ensure(encrypted,id,attempt.id,f.receiver.userId,attempt.callEndBy);
  attempt.status='cancelled';await sql`UPDATE issuer_v2.institutions SET state=${sql.json(record as unknown as postgres.JSONValue)} WHERE id=${id}`;await endpoints.remove(attempt.id);
  await expect(endpoints.ensure(encrypted,id,attempt.id,f.receiver.userId,attempt.callEndBy)).rejects.toThrow('PBX_PREPARATION_FORBIDDEN');expect((await sql`SELECT id FROM pbx.endpoint_leases WHERE attempt_id=${attempt.id}`)).toHaveLength(0);
 }finally{await endpoints.remove(attempt.id);await endpoints.close();await sql`DELETE FROM issuer_v2.recovery_gate WHERE institution_id=${id}`;await sql`DELETE FROM issuer_v2.outbox WHERE institution_id=${id}`;await sql`DELETE FROM issuer_v2.institutions WHERE id=${id}`;}
});

it('shares authenticated request counters across replicas and minute boundaries',async()=>{const second=postgresQuotaStore(url!),institution=`request-test:${randomUUID()}`,user='same-user';try{const now=1800000000;const key=`api:${institution}:${user}:${Math.floor(now/60)}`;await sql`INSERT INTO issuer_v2.global_quota(key,used,hard_limit,expires_at) VALUES(${key},299,300,to_timestamp(${now+60}))`;const results=await Promise.allSettled([quota.chargeRequest(institution,user,now,300),second.chargeRequest(institution,user,now,300)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);await expect(second.chargeRequest(institution,user,now,300)).rejects.toThrow('API_REQUEST_QUOTA_EXHAUSTED');await expect(second.chargeRequest(institution,user,now+60,300)).resolves.toBeUndefined();}finally{await second.close();}});

it('keeps the SQL recovery gate closed when intermediate journal and consumption rows are both lost',async()=>{
 // Real PG boundary with a memory independent-authority fixture; not a real anchor deployment or restore proof.
 const f=await serviceFixture(),id=`recovery-test:${randomUUID()}`,record=await f.store.read(f.institution.institutionId);record.id=id;
 const metadataId=`authority-state:1:${randomUUID()}`,metadataHash=authorityStateHash(record),metadataRoot=journalEntry(id,metadataId,metadataHash,'0'.repeat(64));
 const root1=journalEntry(id,'approval-1','binding-1',metadataRoot),root2=journalEntry(id,'approval-2','binding-2',root1),anchor={deployment:'test-deployment',institutionId:id,sequence:'3',hash:root2,epoch:'1'};
 const store=postgresAuthorityStore(url!,{deployment:anchor.deployment,anchor:{read:async()=>anchor,advance:async()=>{throw new Error('NO_ANCHOR_ADVANCE_IN_RECOVERY_TEST');}}});
 try{
  await sql`INSERT INTO issuer_v2.institutions(id,state) VALUES(${id},${sql.json(record as unknown as postgres.JSONValue)})`;await sql`INSERT INTO issuer_v2.recovery_gate(institution_id,status) VALUES(${id},'blocked')`;
  await sql`INSERT INTO issuer_v2.consumption_journal VALUES(1,${id},${metadataId},${metadataHash},${metadataRoot},${'0'.repeat(64)})`;
  for(const [n,hash,previous] of [[1,root1,metadataRoot],[2,root2,root1]] as const){await sql`INSERT INTO issuer_v2.approval_consumptions(institution_id,authorization_id,protocol_version,binding_hash,receipt) VALUES(${id},${`approval-${n}`},3,${`binding-${n}`},'{}')`;await sql`INSERT INTO issuer_v2.consumption_journal VALUES(${n+1},${id},${`approval-${n}`},${`binding-${n}`},${hash},${previous})`;}
  await store.verifyRecovery(id);expect((await sql`SELECT status FROM issuer_v2.recovery_gate WHERE institution_id=${id}`)[0]!.status).toBe('ready');
  await sql`DELETE FROM issuer_v2.consumption_journal WHERE institution_id=${id} AND sequence=2`;await sql`DELETE FROM issuer_v2.approval_consumptions WHERE institution_id=${id} AND authorization_id='approval-1'`;
  await expect(store.verifyRecovery(id)).rejects.toThrow('CONSUMPTION_HISTORY_RECOVERY_REQUIRED');expect((await sql`SELECT status FROM issuer_v2.recovery_gate WHERE institution_id=${id}`)[0]!.status).toBe('blocked');
 }finally{await store.close();await sql`DELETE FROM issuer_v2.consumption_journal WHERE institution_id=${id}`;await sql`DELETE FROM issuer_v2.approval_consumptions WHERE institution_id=${id}`;await sql`DELETE FROM issuer_v2.recovery_gate WHERE institution_id=${id}`;await sql`DELETE FROM issuer_v2.outbox WHERE institution_id=${id}`;await sql`DELETE FROM issuer_v2.institutions WHERE id=${id}`;}
});

it('serializes duplicate account onboarding across independent SQL connections, and revokes sessions across reactivation',async()=>{
 const peer=postgres(url!,{max:1}),run=randomUUID(),f=await serviceFixture(),institution=`account-test:${run}`,issuer='https://test-identity.example',actor=`${issuer}|manager-${run}`,target=`${issuer}|person-${run}`,record=await f.store.read(f.institution.institutionId);
 record.id=institution;record.members={[actor]:{role:'institution',permissions:['institution.recover','contact.manage'],active:true}};
 let remote:Anchor={deployment:'account-test-deployment',institutionId:institution,sequence:'0',hash:'0'.repeat(64),epoch:'1'};
 const anchor={read:async()=>structuredClone(remote),advance:async(previous:Anchor,next:Anchor)=>{assertAnchorMatches(previous,remote);remote=structuredClone(next);}};
 const accountStore=postgresAuthorityStore(url!,{anchor,deployment:remote.deployment}),otherStore=postgresAuthorityStore(url!,{anchor,deployment:remote.deployment});
 const body={issuer,subject:`person-${run}`,userId:target,displayName:'Test identity',role:'recipient',active:true,permissions:[]};
 try{
  await sql`INSERT INTO public.users(id,display_name,role,demo_code) VALUES(${actor},'Test manager','institution',${`disabled-${run}`})`;
  await sql`INSERT INTO issuer_v2.institutions(id,state) VALUES(${institution},${sql.json(record as unknown as postgres.JSONValue)})`;
  await sql`INSERT INTO issuer_v2.identity_links VALUES(${actor},${institution})`;
  await sql`INSERT INTO issuer_v2.recovery_gate(institution_id,status) VALUES(${institution},'blocked')`;await accountStore.verifyRecovery(institution);
  await expect(peer`SELECT issuer_v2.manage_account(${institution},'not-a-member','missing-manager',${peer.json(body)})`).rejects.toThrow('ACCOUNT_MANAGER_REQUIRED');
  const results=await Promise.all([accountStore.manageAccount!(institution,actor,'same-account-request',body),otherStore.manageAccount!(institution,actor,'same-account-request',body)]);
  expect(results[0]).toEqual(results[1]);expect(remote.sequence).toBe('2');expect((await sql`SELECT id FROM public.users WHERE id=${target}`)).toHaveLength(1);
  await expect(peer`SELECT issuer_v2.manage_account(${institution},${actor},'same-account-request',${peer.json({...body,role:'institution'})})`).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  await sql`INSERT INTO public.sessions(id,token_hash,csrf_token,user_id,expires_at,purpose,membership_generation,oidc_issuer,oidc_client_id,oidc_audience,authenticated_at) VALUES(${run},${run},'test-csrf',${target},now()+interval '1 hour','work',1,${issuer},'test-work-client','test-work-audience',now())`;
  await accountStore.manageAccount!(institution,actor,'disable-account',{...body,active:false});
  expect((await peer`SELECT id FROM public.sessions WHERE user_id=${target}`)).toHaveLength(0);
  await otherStore.manageAccount!(institution,actor,'reactivate-account',body);expect(remote.sequence).toBe('4');await accountStore.verifyRecovery(institution);
  const current=(await sql`SELECT state FROM issuer_v2.institutions WHERE id=${institution}`)[0]!.state;
  expect(current.members[target].sessionGeneration).toBe(3);expect((await sql`SELECT id FROM public.sessions WHERE user_id=${target}`)).toHaveLength(0);
  await expect(peer`SELECT issuer_v2.manage_account(${institution},${actor},'create-joint-role',${peer.json({...body,role:'approver'})})`).rejects.toThrow('ACCOUNT_SCOPE_INVALID');
 }finally{await sql`DELETE FROM issuer_v2.outbox WHERE institution_id=${institution}`;await accountStore.close();await otherStore.close();await peer.end();await sql`DELETE FROM issuer_v2.consumption_journal WHERE institution_id=${institution}`;await sql`DELETE FROM issuer_v2.recovery_gate WHERE institution_id=${institution}`;await sql`DELETE FROM issuer_v2.account_requests WHERE institution_id=${institution}`;await sql`DELETE FROM issuer_v2.audit WHERE institution_id=${institution}`;await sql`DELETE FROM issuer_v2.identity_links WHERE institution_id=${institution}`;await sql`DELETE FROM issuer_v2.outbox WHERE institution_id=${institution}`;await sql`DELETE FROM issuer_v2.institutions WHERE id=${institution}`;await sql`DELETE FROM public.users WHERE id IN (${target},${actor})`;}
});

it('fences a late signed result after the signer lease changes without persisting or broadcasting it',async()=>{
 const run=randomUUID(),institution=`signer-test:${run}`,signer=`0x${'9'.repeat(40)}`;await sql`INSERT INTO issuer_v2.institutions(id,state) VALUES(${institution},'{}')`;await sql`INSERT INTO issuer_v2.recovery_gate(institution_id,status) VALUES(${institution},'ready')`;await sql`INSERT INTO issuer_v2.outbox(id,institution_id,kind,object_id,payload) VALUES(${run},${institution},'institution.configure','test','{}')`;
 try{const job=await worker.claim();expect(job?.id).toBe(run);if(!job)throw new Error('EXPECTED_TEST_JOB');
 let release!:(value:{raw:string;hash:string;signer:string;nonce:string})=>void,started!:()=>void;
 const waiting=new Promise<void>(resolve=>{started=resolve;});
 const pending=worker.persist(job,signer,async()=>{started();return new Promise(resolve=>{release=resolve;});});
 // Register the rejection before resolving the injected late network operation.
 const rejected=expect(pending).rejects.toThrow('SIGNER_LEASE_LOST');await waiting;
 await sql`UPDATE issuer_v2.signer_leases SET owner='another-worker',expires_at=now()+interval '1 minute' WHERE signer=${signer}`;
 release({raw:'never-broadcast-fixture',hash:'hash',signer,nonce:'0'});await rejected;
 expect((await sql`SELECT signed_transaction FROM issuer_v2.outbox WHERE id=${run}`)[0]!.signed_transaction).toBeNull();
 }finally{await sql`DELETE FROM issuer_v2.signer_leases WHERE signer=${signer}`;await sql`DELETE FROM issuer_v2.outbox WHERE id=${run}`;await sql`DELETE FROM issuer_v2.recovery_gate WHERE institution_id=${institution}`;await sql`DELETE FROM issuer_v2.institutions WHERE id=${institution}`;}
});

it('bootstraps authority metadata once across two independently connected recovery passes',async()=>{
 const f=await serviceFixture(),id=`bootstrap-test:${randomUUID()}`,record=await f.store.read(f.institution.institutionId);record.id=id;
 let remote:Anchor={deployment:'disposable-bootstrap-test',institutionId:id,sequence:'0',hash:'0'.repeat(64),epoch:'1'},advances=0;
 // Memory authority fixture with real independent PostgreSQL transactions; separate HTTPS coverage is another file.
 const anchor={read:async()=>structuredClone(remote),advance:async(previous:Anchor,next:Anchor)=>{assertAnchorMatches(previous,remote);remote=structuredClone(next);advances++;}};
 const first=postgresAuthorityStore(url!,{anchor,deployment:remote.deployment}),second=postgresAuthorityStore(url!,{anchor,deployment:remote.deployment});
 try{
  await sql`INSERT INTO issuer_v2.institutions(id,state) VALUES(${id},${sql.json(record as unknown as postgres.JSONValue)})`;await sql`INSERT INTO issuer_v2.recovery_gate(institution_id,status) VALUES(${id},'blocked')`;
  const results=await Promise.allSettled([first.verifyRecovery(id),second.verifyRecovery(id)]);expect(results.some(r=>r.status==='fulfilled')).toBe(true);expect(advances).toBe(1);expect(remote.sequence).toBe('1');expect((await sql`SELECT status FROM issuer_v2.recovery_gate WHERE institution_id=${id}`)[0]!.status).toBe('ready');
  await first.verifyRecovery(id);expect(advances).toBe(1);
 }finally{await first.close();await second.close();await sql`DELETE FROM issuer_v2.consumption_journal WHERE institution_id=${id}`;await sql`DELETE FROM issuer_v2.recovery_gate WHERE institution_id=${id}`;await sql`DELETE FROM issuer_v2.outbox WHERE institution_id=${id}`;await sql`DELETE FROM issuer_v2.institutions WHERE id=${id}`;}
});

it('recovers the same committed signed receipt after the caller loses its response, using an independent SQL store',async()=>{
 const institution=`retry-test:${randomUUID()}`,f=await serviceFixture(),record=await f.store.read(f.institution.institutionId);record.id=institution;
 const signed=await f.consume(),payload={...signed.payload,institutionId:institution};const {signPayload}=await import('../../packages/protocol/src/index.js');const receipt={payload,jws:await signPayload(payload,f.issuer)};
 let anchor={deployment:'test:commit-response',institutionId:institution,sequence:'0',hash:'0'.repeat(64),epoch:'1'};
 const remote={read:async()=>structuredClone(anchor),advance:async(previous:typeof anchor,next:typeof anchor)=>{if(previous.hash!==anchor.hash||previous.sequence!==anchor.sequence)throw new Error('CAS_CONFLICT');anchor=structuredClone(next);}};
 const first=postgresAuthorityStore(url!,{anchor:remote,deployment:anchor.deployment}),second=postgresAuthorityStore(url!,{anchor:remote,deployment:anchor.deployment});
 try{await sql`INSERT INTO issuer_v2.institutions(id,state) VALUES(${institution},${sql.json(record as unknown as postgres.JSONValue)})`;await sql`INSERT INTO issuer_v2.recovery_gate(institution_id,status) VALUES(${institution},'blocked')`;await first.verifyRecovery(institution);
 const consume=(store:typeof first,binding=payload.bindingHash)=>store.transact(institution,async state=>{const old=state.serviceV3!.consumptions[payload.authorizationId];if(old&&old.payload.bindingHash!==binding)throw new Error('BINDING_REUSE');if(!old)state.serviceV3!.consumptions[payload.authorizationId]=receipt;return state.serviceV3!.consumptions[payload.authorizationId];});
 await expect((async()=>{await consume(first);throw new Error('RESPONSE_DROPPED_AFTER_COMMIT');})()).rejects.toThrow('RESPONSE_DROPPED_AFTER_COMMIT');expect(await consume(second)).toEqual(receipt);await expect(consume(second,'other-binding')).rejects.toThrow('BINDING_REUSE');expect((await sql`SELECT count(*) FROM issuer_v2.approval_consumptions WHERE institution_id=${institution}`)[0]!.count).toBe('1');
 }finally{await Promise.all([first.close(),second.close()]);await sql`DELETE FROM issuer_v2.consumption_journal WHERE institution_id=${institution}`;await sql`DELETE FROM issuer_v2.approval_consumptions WHERE institution_id=${institution}`;await sql`DELETE FROM issuer_v2.recovery_gate WHERE institution_id=${institution}`;await sql`DELETE FROM issuer_v2.outbox WHERE institution_id=${institution}`;await sql`DELETE FROM issuer_v2.institutions WHERE id=${institution}`;}
});
