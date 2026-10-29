import postgres from 'postgres';
import { z } from 'zod';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import type { Actor,InstitutionRecord } from './finals-model.js';
export function notificationRecipients(record:InstitutionRecord,event:{kind:string;objectId:string}){
 const attempt=record.serviceV3?.attempts[event.objectId],authorization=record.serviceV3?.authorizations[event.objectId];
 const intent=record.intents[attempt?.intentId??authorization?.payload.intentId??event.objectId];
 const recognized=['intent.created','intent.cancelled','authorization.issued','attempt.ended','attempt.failed','attempt.cancelled','attempt.declined','attempt.no-answer','institution.suspend','configuration.activated'];
 if(!recognized.includes(event.kind))return [];
 const ids=intent?[intent.agentId,intent.recipientId]:Object.keys(record.members).filter(id=>record.members[id]?.permissions?.includes('institution.recover'));
 return [...new Set(ids)].filter(id=>record.members[id]&&record.members[id]!.active!==false);
}
export function registerNotifications(app:FastifyInstance,o:{databaseUrl:string;actorFor(r:FastifyRequest,write?:boolean):Promise<Actor>}){
 const sql=postgres(o.databaseUrl,{max:1,prepare:false,connect_timeout:3,connection:{statement_timeout:5000,lock_timeout:2000}});app.addHook('onClose',()=>sql.end({timeout:3}));
 app.get('/v3/notifications',async r=>{const a=await o.actorFor(r),pref=await sql`SELECT enabled FROM issuer_v2.notification_preferences WHERE institution_id=${a.institutionId} AND user_id=${a.userId}`;const enabled=pref[0]?.enabled!==false;const items=enabled?await sql`SELECT id,code,created_at,acknowledged_at FROM issuer_v2.notifications WHERE institution_id=${a.institutionId} AND user_id=${a.userId} AND expires_at>now() ORDER BY created_at DESC LIMIT 50`:[];return {enabled,items,channel:'in-app',actionPath:'/service',externalDelivery:'not-configured'};});
 app.post('/v3/notifications/read',async r=>{const a=await o.actorFor(r,true),b=z.object({id:z.string().min(1).max(300)}).strict().parse(r.body);await sql`UPDATE issuer_v2.notifications SET acknowledged_at=COALESCE(acknowledged_at,now()) WHERE institution_id=${a.institutionId} AND user_id=${a.userId} AND id=${b.id}`;return {acknowledged:true};});
 app.post('/v3/notifications/preferences',async r=>{const a=await o.actorFor(r,true),b=z.object({enabled:z.boolean()}).strict().parse(r.body);await sql`INSERT INTO issuer_v2.notification_preferences VALUES(${a.institutionId},${a.userId},${b.enabled}) ON CONFLICT(institution_id,user_id) DO UPDATE SET enabled=EXCLUDED.enabled`;return b;});
}
