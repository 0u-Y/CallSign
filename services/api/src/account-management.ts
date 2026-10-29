import { z } from 'zod';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import { requirePermission,type Actor,type InstitutionRecord } from './finals-model.js';
import { HttpError } from './auth.js';
import type { AuthorityStore } from './finals-model.js';
const permissions=z.array(z.enum(['contact.manage','delegation.manage','institution.suspend','institution.recover','key.activate'])).max(5);
export const accountSchema=z.object({issuer:z.url().max(200).refine(v=>!v.includes('|')),subject:z.string().min(1).max(255).regex(/^[^\s]+$/),displayName:z.string().trim().min(1).max(100),role:z.enum(['institution','gateway','recipient']),active:z.boolean(),permissions,serviceUri:z.string().max(300).optional()}).strict();
export function accountInput(record:InstitutionRecord,actor:Actor,body:unknown,issuer:string){
 requirePermission(record,actor,'institution.recover');
 if(actor.role!=='institution')throw new HttpError(403,'ACCOUNT_MANAGER_REQUIRED');
 const b=accountSchema.parse(body),userId=`${b.issuer}|${b.subject}`,prior=record.members[userId];
 if(b.issuer!==issuer||userId.length>200||userId===actor.userId||prior?.role==='approver'||prior?.permissions?.includes('governance.approve'))throw new HttpError(403,'ACCOUNT_SCOPE_INVALID');
 if(b.permissions.some(p=>!record.members[actor.userId]!.permissions?.includes(p))||(b.role!=='institution'&&b.permissions.length)||(b.role==='gateway'?(!b.serviceUri||!record.services[b.serviceUri]?.active):!!b.serviceUri))throw new HttpError(403,'ACCOUNT_PERMISSION_OR_SERVICE_INVALID');
 return {...b,userId,actorGeneration:actor.membershipGeneration??0,permissions:[...new Set(b.permissions)].sort()};
}
export function registerAccountManagement(app:FastifyInstance,o:{issuer:string;store:AuthorityStore;actorFor(r:FastifyRequest,write?:boolean):Promise<Actor>}){

 app.post('/v3/management/accounts',async r=>{
  const actor=await o.actorFor(r,true),request=z.string().regex(/^[A-Za-z0-9:._-]{8,200}$/).parse(r.headers['idempotency-key']);
  const b=accountInput(await o.store.read(actor.institutionId),actor,r.body,o.issuer);
  try{if(!o.store.manageAccount)throw new HttpError(503,'DURABLE_ACCOUNT_STORE_REQUIRED');return await o.store.manageAccount(actor.institutionId,actor.userId,request,b);}
  catch(error){const code=(error as {message?:string}).message;if(code&&/^(AUTHORITY_METADATA|CONSUMPTION_HISTORY|INDEPENDENT_ANCHOR)/.test(code))throw new HttpError(503,'CONSUMPTION_HISTORY_RECOVERY_REQUIRED');if(code&&/^(ACCOUNT_|IDEMPOTENCY_)/.test(code))throw new HttpError(409,code.slice(0,100));throw error;}
 });
}
export function assertMembershipGeneration(session:{membershipGeneration?:number},member:{sessionGeneration?:number}){
 if((session.membershipGeneration??0)!==(member.sessionGeneration??0))throw new HttpError(401,'MEMBERSHIP_SESSION_REVOKED');
}
