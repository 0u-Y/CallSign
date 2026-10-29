if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration')throw new Error('INTEGRATION_EXECUTION_BLOCKED');
import {expect,it} from 'vitest';
import postgres from 'postgres';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
// No startup/migration hooks. A separately provisioned, disposable callsign_test_* DB is mandatory.
it('checks applied migration order and real auth-login least privilege, rather than file presence',async()=>{
 const url=process.env.TEST_DATABASE_URL,authUrl=process.env.TEST_AUTH_DATABASE_URL;if(!url||!authUrl||!/^\/callsign_test_/.test(new URL(url).pathname)||new URL(authUrl).username===new URL(url).username)throw new Error('DISPOSABLE_DATABASE_AND_DISTINCT_AUTH_LOGIN_REQUIRED');
 const owner=postgres(url,{max:1}),auth=postgres(authUrl,{max:1});try{
 const expected=['0000_initial','0001_finals_authority','0002_session_scopes','0003_service_runtime','0004_worker_recovery','0005_account_management'];const applied=await owner`SELECT id,source_hash FROM public.callsign_migrations ORDER BY id`;expect(applied.map(v=>v.id)).toEqual(expected);
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
