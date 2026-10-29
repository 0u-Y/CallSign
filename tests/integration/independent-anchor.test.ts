if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration')throw new Error('INTEGRATION_EXECUTION_BLOCKED');
import {expect,it} from 'vitest';
import postgres from 'postgres';
import {signPayload} from '../../packages/protocol/src/index.js';
import {postgresAuthorityStore} from '../../services/api/src/finals-store.js';
import {httpConsumptionAnchor} from '../../services/api/src/consumption-anchor.js';
import {serviceFixture} from '../unit/service-fixture.js';
// Single-use external fixture: the independently administered anchor must already contain a zero record.
// No init/reset API, provider mock, automatic service startup or automatic migration is used.
it('rejects an actual PostgreSQL rollback against a separately running HTTPS anchor',async()=>{
 const url=process.env.TEST_DATABASE_URL,anchorUrl=process.env.ANCHOR_INTEGRATION_URL,token=process.env.ANCHOR_INTEGRATION_TOKEN,deployment=process.env.ANCHOR_INTEGRATION_DEPLOYMENT,institutionId=process.env.ANCHOR_INTEGRATION_INSTITUTION;
 if(!url||!anchorUrl||!token||!deployment||!institutionId?.startsWith('anchor-test:')||deployment===process.env.DEPLOYMENT_ID)throw new Error('SEPARATE_SINGLE_USE_TEST_DATABASE_AND_ANCHOR_REQUIRED');
 const anchor=httpConsumptionAnchor({url:anchorUrl,token,deployment}),initial=await anchor.read(institutionId);
 if(initial.sequence!=='0'||initial.epoch!=='1'||initial.hash!=='0'.repeat(64))throw new Error('UNUSED_ZERO_ANCHOR_FIXTURE_REQUIRED');
 const sql=postgres(url,{max:2}),store=postgresAuthorityStore(url,{anchor,deployment}),f=await serviceFixture(),record=await f.store.read(f.institution.institutionId);record.id=institutionId;
 const receipt=await f.consume(),payload={...receipt.payload,institutionId},jws=await signPayload(payload,f.issuer);
 try{
  await sql`INSERT INTO issuer_v2.institutions(id,state) VALUES(${institutionId},${sql.json(record as unknown as postgres.JSONValue)})`;await sql`INSERT INTO issuer_v2.recovery_gate(institution_id,status) VALUES(${institutionId},'blocked')`;
  await store.verifyRecovery(institutionId);
  await store.transact(institutionId,async r=>{r.serviceV3!.consumptions[payload.authorizationId]={payload,jws};});expect((await anchor.read(institutionId)).sequence).toBe('2');
  // These deletions are scoped exclusively to the new disposable fixture, simulating its old DB backup.
  await sql.begin(async tx=>{await tx`DELETE FROM issuer_v2.consumption_journal WHERE institution_id=${institutionId}`;await tx`DELETE FROM issuer_v2.approval_consumptions WHERE institution_id=${institutionId}`;await tx`UPDATE issuer_v2.institutions SET state=${tx.json(record as unknown as postgres.JSONValue)} WHERE id=${institutionId}`;});
  await expect(store.verifyRecovery(institutionId)).rejects.toThrow('CONSUMPTION_HISTORY_RECOVERY_REQUIRED');expect((await sql`SELECT status FROM issuer_v2.recovery_gate WHERE institution_id=${institutionId}`)[0]!.status).toBe('blocked');
 }finally{await store.close();await sql`DELETE FROM issuer_v2.consumption_journal WHERE institution_id=${institutionId}`;await sql`DELETE FROM issuer_v2.approval_consumptions WHERE institution_id=${institutionId}`;await sql`DELETE FROM issuer_v2.recovery_gate WHERE institution_id=${institutionId}`;await sql`DELETE FROM issuer_v2.institutions WHERE id=${institutionId}`;await sql.end();}
 // The remote anchor is intentionally retained; this fixture cannot be reused or rolled backwards.
});
