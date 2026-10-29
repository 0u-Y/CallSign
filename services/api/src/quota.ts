import { measurements } from './telemetry.js';
import postgres from 'postgres';
import { hashCanonical } from '@callsign/protocol';
export interface QuotaScope {key:string;limit:number}
export interface QuotaStore {reserve(id:string,institutionId:string,unit:string,amount:number,scopes:QuotaScope[],expiresAt:number):Promise<void>;settle(id:string,actual:number):Promise<void>;close():Promise<void>}
export function postgresQuotaStore(url:string):QuotaStore&{chargeRequest(institutionId:string,userId:string,now:number,limit:number):Promise<void>}{
 const sql=postgres(url,{max:2,prepare:false,connect_timeout:3,connection:{statement_timeout:5000,lock_timeout:2000}});
 return {
  async chargeRequest(institutionId,userId,now,limit){if(!Number.isSafeInteger(limit)||limit<300||limit>10000)throw new Error('REQUEST_BUDGET_POLICY_INVALID');const key=`api:${institutionId}:${userId}:${Math.floor(now/60)}`;const rows=await sql`INSERT INTO issuer_v2.global_quota(key,used,hard_limit,expires_at) VALUES(${key},1,${limit},to_timestamp(${(Math.floor(now/60)+1)*60})) ON CONFLICT(key) DO UPDATE SET used=issuer_v2.global_quota.used+1 WHERE issuer_v2.global_quota.hard_limit=EXCLUDED.hard_limit AND issuer_v2.global_quota.used<issuer_v2.global_quota.hard_limit RETURNING key`;if(!rows.length)throw Object.assign(new Error('API_REQUEST_QUOTA_EXHAUSTED'),{statusCode:429,code:'API_REQUEST_QUOTA_EXHAUSTED'});},
  async reserve(id,institutionId,unit,amount,scopes,expiresAt){return measurements.measure('quota',async()=>{
   if(!Number.isSafeInteger(amount)||amount<=0||!scopes.length||new Set(scopes.map(s=>s.key)).size!==scopes.length||scopes.some(s=>!Number.isSafeInteger(s.limit)||s.limit<amount))throw new Error('QUOTA_INPUT_INVALID');
   const sorted=[...scopes].sort((a,b)=>a.key.localeCompare(b.key));
   await sql.begin(async tx=>{
    // Serialize reservation ID before locking scopes, including different institutions sharing a global budget.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
    const prior=await tx`SELECT * FROM issuer_v2.usage_reservations WHERE id=${id} FOR UPDATE`;
    if(prior[0]){if(prior[0].institution_id!==institutionId||prior[0].unit!==unit||Number(prior[0].reserved)!==amount||hashCanonical(prior[0].quota_keys)!==hashCanonical(sorted))throw new Error('QUOTA_IDEMPOTENCY_CONFLICT');return;}
    for(const scope of sorted){const rows=await tx`INSERT INTO issuer_v2.quota_balances(key,hard_limit,reserved,expires_at) VALUES(${scope.key},${scope.limit},${amount},to_timestamp(${expiresAt})) ON CONFLICT(key) DO UPDATE SET reserved=issuer_v2.quota_balances.reserved+EXCLUDED.reserved WHERE issuer_v2.quota_balances.hard_limit=EXCLUDED.hard_limit AND issuer_v2.quota_balances.used+issuer_v2.quota_balances.reserved+EXCLUDED.reserved<=issuer_v2.quota_balances.hard_limit RETURNING key`;if(!rows.length)throw new Error('QUOTA_EXHAUSTED');}
    await tx`INSERT INTO issuer_v2.usage_reservations(id,institution_id,unit,quota_keys,reserved,state,expires_at) VALUES(${id},${institutionId},${unit},${tx.json(sorted as unknown as postgres.JSONValue)},${amount},'reserved',to_timestamp(${expiresAt}))`;
   });
  });},
  async settle(id,actual){await sql.begin(async tx=>{
   const rows=await tx`SELECT * FROM issuer_v2.usage_reservations WHERE id=${id} FOR UPDATE`;const row=rows[0];if(!row)throw new Error('QUOTA_RESERVATION_MISSING');
   if(!Number.isSafeInteger(actual)||actual<0||actual>Number(row.reserved))throw new Error('QUOTA_SETTLEMENT_INVALID');
   if(row.state!=='reserved'){if(Number(row.actual)!==actual)throw new Error('QUOTA_SETTLEMENT_CONFLICT');return;}
   for(const scope of row.quota_keys as QuotaScope[])await tx`UPDATE issuer_v2.quota_balances SET reserved=reserved-${row.reserved},used=used+${actual} WHERE key=${scope.key}`;
   await tx`UPDATE issuer_v2.usage_reservations SET actual=${actual},state=${actual===0?'released':'settled'} WHERE id=${id}`;
  });},
  async close(){await sql.end({timeout:3});}
 };
}
export function analysisScopes(institution:string,user:string,attempt:string,unit:string,max:number,now:number):QuotaScope[]{const day=Math.floor(now/86400);return [{key:`call:${attempt}:${unit}`,limit:max},{key:`user:${institution}:${user}:${day}:${unit}`,limit:max*20},{key:`institution:${institution}:${day}:${unit}`,limit:max*100},{key:`global:${day}:${unit}`,limit:max*1000}];}
