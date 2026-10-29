// Privileged operator-only account onboarding; no service startup or IdP API calls.
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure')throw new Error('MEMBER_PROVISIONING_EXECUTION_BLOCKED');
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import postgres from 'postgres';
import {provisioningAccountsSchema,type InstitutionRecord} from '../services/api/src/finals-model.js';
const path=process.argv[2],institutionId=process.env.INSTITUTION_ID,url=process.env.MIGRATOR_DATABASE_URL;
if(!path||!institutionId||!url||!process.env.OIDC_ISSUER)throw new Error('ACCOUNTS_INSTITUTION_ID_MIGRATOR_AND_OIDC_ISSUER_REQUIRED');
const accounts=provisioningAccountsSchema.parse(JSON.parse(await readFile(path,'utf8')));
if(!accounts.length||accounts.length>100||new Set(accounts.map(a=>a.id)).size!==accounts.length||accounts.some(a=>!a.id.startsWith(`${process.env.OIDC_ISSUER}|`)||a.id.length<=process.env.OIDC_ISSUER!.length+1||(['gateway','recipient'].includes(a.role)&&a.permissions.length)))throw new Error('ONBOARDING_ACCOUNT_SCOPE_INVALID');
const serviceUri=process.env.SERVICE_URI,sql=postgres(url,{max:1,prepare:false,connect_timeout:3});
try{await sql.begin(async tx=>{
 const rows=await tx`SELECT state FROM issuer_v2.institutions WHERE id=${institutionId} FOR UPDATE`;if(!rows[0])throw new Error('INSTITUTION_NOT_PROVISIONED');const record=rows[0].state as InstitutionRecord;
 if(record.authorityCheckpointVersion===1)throw new Error('SERVICE_ACCOUNTS_REQUIRE_AUTHENTICATED_MANAGEMENT');
 if(record.status!=='active')throw new Error('INSTITUTION_NOT_ACTIVE');
 if(accounts.some(a=>a.role==='gateway')&&(!serviceUri||!record.services[serviceUri]?.active))throw new Error('REGISTERED_ACTIVE_CALL_CENTER_REQUIRED');
 for(const a of accounts){if(record.members[a.id])throw new Error('EXISTING_MEMBER_REQUIRES_AUTHENTICATED_MANAGEMENT');await tx`INSERT INTO public.users(id,display_name,role,demo_code) VALUES(${a.id},${a.displayName},${a.role},${`disabled-${randomUUID()}`})`;await tx`INSERT INTO issuer_v2.identity_links(user_id,institution_id) VALUES(${a.id},${institutionId})`;record.members[a.id]={role:a.role,active:true,permissions:a.permissions,...(a.role==='gateway'?{serviceDid:serviceUri!}:{})};}
 await tx`UPDATE issuer_v2.institutions SET state=${tx.json(record as unknown as postgres.JSONValue)},revision=revision+1 WHERE id=${institutionId}`;
 for(const a of accounts)await tx`INSERT INTO issuer_v2.audit(id,institution_id,event) VALUES(${randomUUID()},${institutionId},${tx.json({event:'member.provisioned',actor:'operator:provision-member',objectId:a.id,at:Math.floor(Date.now()/1000),role:a.role})})`;
});process.stdout.write('New pre-registered IdP subjects added atomically. Existing accounts and roles were not replaced.\n');}finally{await sql.end({timeout:3});}
