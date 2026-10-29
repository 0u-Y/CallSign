import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
const digest=z.string().regex(/^[0-9a-f]{64}$/),id=z.string().min(1).max(200);
export const anchorSchema=z.object({deployment:id,institutionId:id,sequence:z.string().regex(/^\d+$/),hash:digest,epoch:z.string().regex(/^\d+$/)}).strict();
export type Anchor=z.infer<typeof anchorSchema>;
export interface ConsumptionAnchor {read(institutionId:string):Promise<Anchor>;advance(previous:Anchor,next:Anchor):Promise<void>}
export function httpConsumptionAnchor(options:{url:string;token:string;deployment:string;fetcher?:typeof fetch}):ConsumptionAnchor{
 const origin=new URL(options.url);if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||options.token.length<32)throw new Error('ANCHOR_CONFIG_INVALID');
 const request=async(path:string,body?:unknown)=>{const response=await (options.fetcher??fetch)(new URL(path,origin),{method:body?'POST':'GET',headers:{authorization:`Bearer ${options.token}`,'content-type':'application/json'},signal:AbortSignal.timeout(2500),redirect:'error',...(body?{body:JSON.stringify(body)}:{})});const raw=await response.text();if(!response.ok||raw.length>8192)throw new Error('INDEPENDENT_ANCHOR_UNAVAILABLE_OR_CONFLICT');return JSON.parse(raw);};
 const read=async(institutionId:string)=>anchorSchema.parse(await request(`/anchor?deployment=${encodeURIComponent(options.deployment)}&institutionId=${encodeURIComponent(institutionId)}`));
 return {read,advance:async(previous,next)=>{if(previous.deployment!==options.deployment||next.deployment!==options.deployment||previous.institutionId!==next.institutionId)throw new Error('ANCHOR_DOMAIN_MISMATCH');try{assertAnchorMatches(next,anchorSchema.parse(await request('/anchor',{previous,next})));}catch{try{assertAnchorMatches(next,await read(next.institutionId));}catch{throw new Error('INDEPENDENT_ANCHOR_OUTCOME_UNKNOWN');}}}};
}
export function assertAnchorMatches(local:Anchor,remote:Anchor){if(Object.entries(local).some(([k,v])=>remote[k as keyof Anchor]!==v))throw new Error('CONSUMPTION_HISTORY_RECOVERY_REQUIRED');}
// Host this authority in a separate failure/backup domain. No initialization or rollback API is exposed.
export function registerAnchorService(app:FastifyInstance,options:{databaseUrl:string;token:string}){
 const sql=postgres(options.databaseUrl,{max:2,prepare:false,connect_timeout:3,connection:{statement_timeout:5000,lock_timeout:2000}});
 app.addHook('onClose',()=>sql.end({timeout:3}));
 app.addHook('preHandler',async request=>{const value=request.headers.authorization??'',expected=`Bearer ${options.token}`;if(Buffer.byteLength(value)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(value),Buffer.from(expected)))throw Object.assign(new Error('ANCHOR_AUTH_REQUIRED'),{statusCode:401});});
 app.get('/anchor',async r=>{const q=z.object({deployment:id,institutionId:id}).strict().parse(r.query),rows=await sql`SELECT state FROM callsign_anchors WHERE deployment=${q.deployment} AND institution_id=${q.institutionId}`;if(!rows[0])throw Object.assign(new Error('ANCHOR_NOT_PROVISIONED'),{statusCode:409});return anchorSchema.parse(rows[0].state);});
 app.post('/anchor',async r=>{const {previous,next}=z.object({previous:anchorSchema,next:anchorSchema}).strict().parse(r.body);
  if(previous.deployment!==next.deployment||previous.institutionId!==next.institutionId||BigInt(next.sequence)!==BigInt(previous.sequence)+1n||BigInt(next.epoch)<BigInt(previous.epoch))throw new Error('ANCHOR_TRANSITION_INVALID');
  return sql.begin(async tx=>{const rows=await tx`SELECT state FROM callsign_anchors WHERE deployment=${previous.deployment} AND institution_id=${previous.institutionId} FOR UPDATE`;if(!rows[0])throw new Error('ANCHOR_NOT_PROVISIONED');const current=anchorSchema.parse(rows[0].state);
   if(current.sequence===next.sequence&&current.hash===next.hash&&current.epoch===next.epoch)return current;
   assertAnchorMatches(previous,current);await tx`UPDATE callsign_anchors SET state=${tx.json(next)},updated_at=now() WHERE deployment=${next.deployment} AND institution_id=${next.institutionId}`;return next;
  });
 });
}
