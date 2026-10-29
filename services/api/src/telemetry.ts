import type { FastifyInstance,FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requirePermission,type Actor,type AuthorityStore } from './finals-model.js';
export const stages=['authorization','verification','pbx','ice','media-ready','revocation-ui','revocation-reclaim','worker','stt','llm','warning-ui','quota','http'] as const;
export type MeasurementStage=typeof stages[number];
type Outcome='success'|'failure'|'retry';
const bounds=[10,50,100,250,500,1000,2500,5000,10000,60000];
export class Measurements {
 private readonly values=new Map<string,{stage:MeasurementStage;source:'server'|'browser';outcome:Outcome;count:number;sumMs:number;buckets:number[]}>();
 observe(stage:MeasurementStage,outcome:Outcome,ms:number,source:'server'|'browser'='server'){
  if(!stages.includes(stage)||!['success','failure','retry'].includes(outcome)||!['server','browser'].includes(source)||!Number.isFinite(ms)||ms<0||ms>3600000)throw new Error('INVALID_MEASUREMENT');
  const key=`${source}:${stage}:${outcome}`,v=this.values.get(key)??{stage,source,outcome,count:0,sumMs:0,buckets:bounds.map(()=>0)};v.count++;v.sumMs+=ms;bounds.forEach((b,i)=>{if(ms<=b)v.buckets[i]=v.buckets[i]!+1;});this.values.set(key,v);
 }
 async measure<T>(stage:MeasurementStage,fn:()=>Promise<T>){const start=performance.now();try{const result=await fn();this.observe(stage,'success',performance.now()-start);return result;}catch(error){this.observe(stage,'failure',performance.now()-start);throw error;}}
 snapshot(){return {scope:'process-local-cumulative; browser reports are untrusted observations',durationClock:'same-process-monotonic',boundsMs:bounds,values:[...this.values.values()].map(v=>({...v,buckets:[...v.buckets]}))};}
}
export const measurements=new Measurements();
export function registerRequestTiming(app:FastifyInstance){
 const starts=new WeakMap<FastifyRequest,number>();
 app.addHook('onRequest',async(r,reply)=>{starts.set(r,performance.now());const incoming=r.headers['x-correlation-id'],id=typeof incoming==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(incoming)?incoming:randomUUID();r.headers['x-correlation-id']=id;reply.header('x-correlation-id',id);});
 app.addHook('onResponse',async(r,reply)=>{const start=starts.get(r);if(start!==undefined)measurements.observe('http',reply.statusCode>=400?'failure':'success',performance.now()-start);});
}
export function registerMeasurements(app:FastifyInstance,o:{actorFor(r:FastifyRequest,write?:boolean):Promise<Actor>;store:AuthorityStore}){
 app.post('/v3/measurements',async r=>{await o.actorFor(r,true);const b=z.object({stage:z.enum(['verification','pbx','ice','media-ready','revocation-ui','warning-ui']),outcome:z.enum(['success','failure']),durationMs:z.number().finite().min(0).max(3600000)}).strict().parse(r.body);measurements.observe(b.stage,b.outcome,b.durationMs,'browser');return {recorded:true,source:'untrusted-browser-observation'};});
 app.get('/v3/management/measurements',async r=>{const actor=await o.actorFor(r);requirePermission(await o.store.read(actor.institutionId),actor,'institution.recover');return measurements.snapshot();});
}
