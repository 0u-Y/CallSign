if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration')throw new Error('INTEGRATION_EXECUTION_BLOCKED');
import {it,expect} from 'vitest';
import postgres from 'postgres';
import {randomUUID} from 'node:crypto';
import {applyMigrations} from '../../scripts/migrate-finals.js';
import {serviceFixture} from '../unit/service-fixture.js';
it('upgrades 0009 with preserved authority/session/receipt/cleanup, rolls back blocked 0010 DDL and safely resumes',async()=>{
 const source=process.env.TEST_DATABASE_URL;if(!source||!/^\/callsign_test_/.test(new URL(source).pathname))throw new Error('DISPOSABLE_DATABASE_REQUIRED');
 const owner=postgres(source,{max:1}),name='callsign_test_upgrade_'+randomUUID().replaceAll('-',''),url=new URL(source);url.pathname='/'+name;
 let db:ReturnType<typeof postgres>|undefined,writer:typeof db,limited:typeof db;
 try{
  await owner.unsafe(`CREATE DATABASE "${name}"`);db=postgres(url.href,{max:1});writer=postgres(url.href,{max:1});limited=postgres(url.href,{max:1,connection:{lock_timeout:250}});
  await applyMigrations(db,'0009_pjsip_boolean_fields');
  const f=await serviceFixture('upgrade-synthetic-institution');await f.consume();const r=await f.store.read(f.institution.institutionId),attempt=r.serviceV3!.attempts[f.attempt.id]!;
  attempt.cleanup={status:'retry',observedAt:1800000000,source:'server-request',attempts:1};r.members.recipient!.active=false;r.epoch='2';
  await db`INSERT INTO issuer_v2.institutions(id,state) VALUES(${r.id},${db.json(r as unknown as postgres.JSONValue)})`;
  await db`INSERT INTO public.users(id,display_name,role,demo_code) VALUES('upgrade-user','Synthetic upgrade','recipient',${randomUUID()})`;
  await db`INSERT INTO public.sessions(id,token_hash,csrf_token,user_id,expires_at) VALUES('upgrade-session','upgrade-hash','upgrade-csrf','upgrade-user',now()+interval '5 minutes')`;
  const receipt=(await f.consume()).payload;await db`INSERT INTO issuer_v2.approval_consumptions(authorization_id,institution_id,protocol_version,binding_hash,receipt) VALUES(${receipt.authorizationId},${r.id},3,${receipt.bindingHash},${db.json(receipt as unknown as postgres.JSONValue)})`;
  const before=await db`SELECT state FROM issuer_v2.institutions WHERE id=${r.id}`;
  await writer.unsafe('BEGIN');await writer`UPDATE issuer_v2.outbox SET attempts=attempts WHERE false`;
  try{await expect(applyMigrations(limited)).rejects.toMatchObject({code:'55P03'});}finally{await writer.unsafe('ROLLBACK');}
  expect((await db`SELECT indexname FROM pg_indexes WHERE indexname IN ('audit_recall_lookup_idx','outbox_recall_lookup_idx')`)).toHaveLength(0);
  expect((await db`SELECT id FROM public.callsign_migrations WHERE id='0010_operation_lookup_indexes'`)).toHaveLength(0);
  await applyMigrations(db);const applied=await db`SELECT * FROM public.callsign_migrations ORDER BY id`;expect(applied).toHaveLength(11);
  expect((await db`SELECT indexname FROM pg_indexes WHERE indexname IN ('audit_recall_lookup_idx','outbox_recall_lookup_idx')`)).toHaveLength(2);
  await applyMigrations(db);expect(await db`SELECT * FROM public.callsign_migrations ORDER BY id`).toEqual(applied);
  expect(await db`SELECT state FROM issuer_v2.institutions WHERE id=${r.id}`).toEqual(before);
  expect((await db`SELECT id FROM public.sessions WHERE id='upgrade-session'`)).toHaveLength(1);expect((await db`SELECT binding_hash FROM issuer_v2.approval_consumptions WHERE institution_id=${r.id}`)[0]!.binding_hash).toBe(receipt.bindingHash);
 }finally{
  await Promise.all([db?.end(),writer?.end(),limited?.end()]);await owner.unsafe(`DROP DATABASE IF EXISTS "${name}"`);await owner.end();
 }
},20000);
