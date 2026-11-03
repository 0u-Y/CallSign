if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration')throw new Error('INTEGRATION_EXECUTION_BLOCKED');
import {it,expect} from 'vitest';
import postgres from 'postgres';
// Read-only audit between suites on the newly provisioned, exclusively owned HTTP test database.
it('leaves no HTTP fixture authorities, sessions, outbox or unsettled quota after same-database reruns',async()=>{
 const url=process.env.TEST_DATABASE_URL;
 if(!url||!/^\/callsign_test_/.test(new URL(url).pathname)||process.env.CALLSIGN_HTTP_AUDIT_CONFIRMATION!=='NO_ACTIVE_HTTP_FIXTURES')throw new Error('EXCLUSIVE_DISPOSABLE_HTTP_AUDIT_REQUIRED');
 const sql=postgres(url,{max:1});try{
  for(const table of ['issuer_v2.institutions','issuer_v2.audit','issuer_v2.outbox','issuer_v2.approval_consumptions','issuer_v2.consumption_journal','issuer_v2.recovery_gate','issuer_v2.identity_links','issuer_v2.account_requests','issuer_v2.notifications','issuer_v2.notification_preferences','issuer_v2.configuration_history','issuer_v2.worker_status','issuer_v2.event_cursor','issuer_v2.processed_chain_events','issuer_v2.usage_reservations','public.users','public.sessions','public.oidc_login_uses']){
   expect(Number((await sql`SELECT count(*) AS rows FROM ${sql(table)}`)[0]!.rows),table).toBe(0);
  }
  expect(Number((await sql`SELECT count(*) AS rows FROM issuer_v2.quota_balances WHERE reserved<>0`)[0]!.rows)).toBe(0);
 }finally{await sql.end();}
});
