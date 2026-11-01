if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration')throw new Error('INTEGRATION_EXECUTION_BLOCKED');
import {expect,it} from 'vitest';
import postgres from 'postgres';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
// No startup/migration hooks. A separately provisioned, disposable callsign_test_* DB is mandatory.
it('checks applied migration order and real auth-login least privilege, rather than file presence',async()=>{
 const url=process.env.TEST_DATABASE_URL,authUrl=process.env.TEST_AUTH_DATABASE_URL;if(!url||!authUrl||!/^\/callsign_test_/.test(new URL(url).pathname)||new URL(authUrl).username===new URL(url).username)throw new Error('DISPOSABLE_DATABASE_AND_DISTINCT_AUTH_LOGIN_REQUIRED');
 const owner=postgres(url,{max:1}),auth=postgres(authUrl,{max:1});try{
 const expected=['0000_initial','0001_finals_authority','0002_session_scopes','0003_service_runtime','0004_worker_recovery','0005_account_management','0006_backup_drain','0007_pbx_lease_locks','0008_pjsip_contact_qualification','0009_pjsip_boolean_fields'];const applied=await owner`SELECT id,source_hash FROM public.callsign_migrations ORDER BY id`;expect(applied.map(v=>v.id)).toEqual(expected);
 const role=(await auth`SELECT current_user AS name`)[0]!.name;
 const grants=(await owner`SELECT has_table_privilege(${role},'public.users','SELECT') AS users_read,has_table_privilege(${role},'public.users','UPDATE') AS users_write,has_table_privilege(${role},'public.sessions','DELETE') AS sessions_delete,has_table_privilege(${role},'issuer_v2.institutions','UPDATE') AS authority_write`)[0]!;
 await auth`SELECT id FROM public.users LIMIT 0`;
 await auth`DELETE FROM public.sessions WHERE false`;
 await expect(auth`UPDATE public.users SET display_name='forbidden-fixture' WHERE false`).rejects.toMatchObject({code:'42501'});
 await expect(auth`UPDATE issuer_v2.institutions SET revision=revision WHERE false`).rejects.toMatchObject({code:'42501'});
 expect(grants.users_read).toBe(true);expect(grants.users_write).toBe(false);expect(grants.sessions_delete).toBe(true);expect(grants.authority_write).toBe(false);
 // The owner confirms all source migration files correspond to the expected sequence; hashes are in runner evidence.
 for(const name of expected)expect(applied.find(v=>v.id===name)!.source_hash).toBe(createHash('sha256').update(await readFile(`services/api/drizzle/${name}.sql`)).digest('hex'));
 }finally{await Promise.all([owner.end(),auth.end()]);}
});

it('allows PBX row locks for issuer/worker while denying other lease-field updates and PBX identity reads',async()=>{
 const urls=[process.env.TEST_ISSUER_DATABASE_URL,process.env.TEST_WORKER_DATABASE_URL,process.env.TEST_PBX_DATABASE_URL];if(urls.some(u=>!u)||new Set(urls.map(u=>new URL(u!).username)).size!==3)throw new Error('DISTINCT_PBX_ROLE_LOGINS_REQUIRED');const owner=new URL(process.env.TEST_DATABASE_URL!);if(!/^\/callsign_test_/.test(owner.pathname)||urls.some(value=>{const role=new URL(value!);return role.hostname!==owner.hostname||role.port!==owner.port||role.pathname!==owner.pathname||role.username===owner.username;}))throw new Error('PBX_ROLES_SAME_DISPOSABLE_DATABASE_REQUIRED');
 for(const url of urls.slice(0,2)){const client=postgres(url!,{max:1});try{await client.begin(async tx=>{await tx`SELECT id FROM pbx.endpoint_leases WHERE false FOR UPDATE`;});await expect(client`UPDATE pbx.endpoint_leases SET expires_at=now() WHERE false`).rejects.toMatchObject({code:'42501'});}finally{await client.end();}}
 const pbx=postgres(urls[2]!,{max:1});try{await pbx`SELECT id FROM pbx.endpoint_leases WHERE false`;await pbx`INSERT INTO pbx.ps_contacts(id,qualify_2xx_only,authenticate_qualify,prune_on_boot) VALUES('callsign-test-realtime-schema','false','false','false')`;await pbx`DELETE FROM pbx.ps_contacts WHERE id='callsign-test-realtime-schema'`;await expect(pbx`SELECT id FROM pbx.endpoint_leases WHERE false FOR UPDATE`).rejects.toMatchObject({code:'42501'});await expect(pbx`SELECT id FROM issuer_v2.institutions WHERE false`).rejects.toMatchObject({code:'42501'});}finally{await pbx.end();}
});
