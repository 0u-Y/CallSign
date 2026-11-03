import {EventEmitter} from 'node:events';
import {expect,it,vi} from 'vitest';
import {registerServiceAudio,type AudioProviders} from '../../services/api/src/service-audio.js';
import {SessionConnections} from '../../services/api/src/session-connections.js';
import type {QuotaStore} from '../../services/api/src/quota.js';
import {serviceFixture} from './service-fixture.js';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
async function fixture(){
 const f=await serviceFixture();await f.consume();await f.lease(1);await f.authority.consent(f.receiver,f.id(),f.attempt.id,true);
 const hooks:Array<()=>Promise<void>>=[];let open!:(socket:any,request:any)=>Promise<void>;
 const app={log:{warn:vi.fn()},addHook:(_name:string,fn:()=>Promise<void>)=>hooks.push(fn),get:(_path:string,_opts:unknown,handler:typeof open)=>{open=handler;}} as unknown as Parameters<typeof registerServiceAudio>[0];
 class Socket extends EventEmitter{readyState=1;bufferedAmount=0;sent:any[]=[];send(raw:string){this.sent.push(JSON.parse(raw));}close(){if(this.readyState===3)return;this.readyState=3;this.emit('close');}}
 const socket=new Socket(),connections=new SessionConnections(),settle=vi.fn<QuotaStore['settle']>(async()=>{}),reserve=vi.fn<QuotaStore['reserve']>(async()=>{}),stream=vi.fn<AudioProviders['stream']>(()=>({connect(){},push(){},stop(){}})),analyze=vi.fn<NonNullable<AudioProviders['analyze']>>();
 const quota:QuotaStore={reserve,settle,close:async()=>{}};
 registerServiceAudio(app,{authority:f.authority,actorFor:async()=>f.receiver,sessionId:async()=> 'session',connections,origin:'https://test.example',quota,providers:{stream,analyze} as AudioProviders});
 await open(socket,{query:{attemptId:f.attempt.id},headers:{origin:'https://test.example'}});expect(socket.sent.some(x=>x.type==='ready')).toBe(true);
 return {...f,socket,connections,settle,reserve,stream,analyze,close:async()=>{await hooks[0]!();connections.close();}};
}
it('does not connect a provider if shutdown wins the consent transaction',async()=>{
 const f=await fixture(),entered=deferred(),release=deferred(),transact=f.store.transact;
 f.store.transact=async(id,op)=>{entered.resolve();await release.promise;return transact(id,op);};
 try{
  f.socket.emit('message',Buffer.from(JSON.stringify({type:'consent',consent:true})),false);await entered.promise;
  const closing=f.close();release.resolve();await closing;
  expect(f.stream).not.toHaveBeenCalled();expect(f.settle).toHaveBeenCalledTimes(1);expect(f.settle.mock.calls[0]![1]).toBe(0);expect(f.socket.readyState).toBe(3);
 }finally{release.resolve();await f.close();}
});
it('releases an uninvoked model reservation when shutdown wins its final authority check',async()=>{
 const f=await fixture(),entered=deferred(),release=deferred();let revision!:Parameters<AudioProviders['stream']>[0]['onRevision'];let modelReserved=false,hold=false;
 f.stream.mockImplementation(options=>{revision=options.onRevision;return {connect(){options.onReady?.();},push(){},stop(){}};});
 f.reserve.mockImplementation(async(_id,_institution,unit)=>{if(unit==='llm-requests')modelReserved=true;});
 const read=f.store.read;f.store.read=async id=>{if(hold&&modelReserved){hold=false;entered.resolve();await release.promise;}return read(id);};
 try{
  f.socket.emit('message',Buffer.from(JSON.stringify({type:'consent',consent:true})),false);await vi.waitFor(()=>expect(f.stream).toHaveBeenCalledOnce());
  hold=true;revision({streamId:(f.stream.mock.calls[0]![0] as Parameters<AudioProviders['stream']>[0]).streamId,segmentId:'one',revision:1,final:true,text:'합성 시험 발화',source:'remote'});await entered.promise;
  const closing=f.close();release.resolve();await closing;
  expect(f.analyze).not.toHaveBeenCalled();expect(f.reserve).toHaveBeenCalledTimes(2);const llm=f.settle.mock.calls.filter(([id])=>String(id).startsWith('llm:'));expect(llm).toHaveLength(1);expect(llm[0]![1]).toBe(0);
 }finally{release.resolve();await f.close();}
});
