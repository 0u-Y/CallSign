import {EventEmitter} from 'node:events';
import {afterEach,expect,it,vi} from 'vitest';
import {analysisSmokeBudget} from '../../services/api/src/provider-configuration.js';
import {registerServiceAudio,type AudioProviders} from '../../services/api/src/service-audio.js';
import {SessionConnections} from '../../services/api/src/session-connections.js';
import type {QuotaStore} from '../../services/api/src/quota.js';
import {serviceFixture} from './service-fixture.js';

const budget={id:'approved-test-only',expiresAt:1800000060,sttSeconds:30,connections:1,llmRequests:4};
afterEach(()=>vi.unstubAllEnvs());
async function fixture(reserve=vi.fn<QuotaStore['reserve']>(async()=>{}),institution='mock-bank-institution'){
 const f=await serviceFixture(institution);await f.consume();await f.lease(1);await f.authority.consent(f.receiver,f.id(),f.attempt.id,true);
 const hooks:Array<()=>Promise<void>>=[];let open!:(socket:any,request:any)=>Promise<void>;
 const app={log:{warn:vi.fn()},addHook:(_name:string,fn:()=>Promise<void>)=>hooks.push(fn),get:(_path:string,_opts:unknown,handler:typeof open)=>{open=handler;}} as unknown as Parameters<typeof registerServiceAudio>[0];
 class Socket extends EventEmitter{readyState=1;bufferedAmount=0;sent:any[]=[];send(raw:string){this.sent.push(JSON.parse(raw));}close(){if(this.readyState===3)return;this.readyState=3;this.emit('close');}}
 const socket=new Socket(),connections=new SessionConnections(),settle=vi.fn<QuotaStore['settle']>(async()=>{}),stream=vi.fn<AudioProviders['stream']>(options=>({connect(){options.onReady?.();},push(){},stop(){}})),analyze=vi.fn<NonNullable<AudioProviders['analyze']>>(async()=>{throw new Error('synthetic provider timeout');});
 await registerServiceAudio(app,{authority:f.authority,actorFor:async()=>f.receiver,sessionId:async()=> 'session',connections,origin:'https://test.example',quota:{reserve,settle,close:async()=>{}},providers:{stream,analyze}});
 await open(socket,{query:{attemptId:f.attempt.id},headers:{origin:'https://test.example'}});
 return {...f,socket,settle,reserve,stream,analyze,start:()=>socket.emit('message',Buffer.from(JSON.stringify({type:'consent',consent:true})),false),close:async()=>{await hooks[0]!();connections.close();}};
}
it('accepts only a complete finite smoke contract and leaves the ordinary profile unchanged',()=>{
 expect(analysisSmokeBudget({})).toBeUndefined();expect(analysisSmokeBudget({CALLSIGN_ANALYSIS_SMOKE_BUDGET:JSON.stringify(budget)})).toEqual(budget);
 for(const value of [{...budget,connections:0},{...budget,llmRequests:21},{...budget,sttSeconds:30.5},{...budget,id:'unsafe:id'},{...budget,expiresAt:Number.MAX_SAFE_INTEGER+1},{...budget,extra:'ignored'},{}])expect(()=>analysisSmokeBudget({CALLSIGN_ANALYSIS_SMOKE_BUDGET:JSON.stringify(value)})).toThrow('ANALYSIS_SMOKE_BUDGET_INVALID');
});
it('reserves approval-wide connection and audio caps before opening the bounded stream',async()=>{
 vi.stubEnv('CALLSIGN_ANALYSIS_SMOKE_BUDGET',JSON.stringify(budget));const f=await fixture();
 try{f.start();await vi.waitFor(()=>expect(f.stream).toHaveBeenCalledOnce());expect(f.stream.mock.calls[0]![0].maxDurationMs).toBe(30000);
  expect(f.reserve.mock.calls[0]).toMatchObject({2:'stt-connections',3:1,4:[{key:'provider-smoke:approved-test-only:stt-connections',limit:1}],5:budget.expiresAt});
  expect(f.reserve.mock.calls[1]![3]).toBe(30);expect(f.reserve.mock.calls[1]![4]).toContainEqual({key:'provider-smoke:approved-test-only:stt-seconds',limit:30});
  await f.close();expect(f.settle.mock.calls.find(([id])=>id.startsWith('stt-connection:'))?.[1]).toBe(1);
 }finally{await f.close();}
});
it('uses the same durable approval scope across actors, attempts and server registrations, refusing a spent connection before any provider',async()=>{
 vi.stubEnv('CALLSIGN_ANALYSIS_SMOKE_BUDGET',JSON.stringify(budget));const reserve=vi.fn<QuotaStore['reserve']>(async()=>{throw new Error('QUOTA_EXHAUSTED');});
 for(const institution of ['institution-one','institution-two']){const f=await fixture(reserve,institution);try{f.start();await vi.waitFor(()=>expect(f.socket.readyState).toBe(3));expect(f.stream).not.toHaveBeenCalled();}finally{await f.close();}}
 expect(reserve).toHaveBeenCalledTimes(2);expect(reserve.mock.calls[0]![4]).toEqual(reserve.mock.calls[1]![4]);expect(reserve.mock.calls[0]![0]).not.toBe(reserve.mock.calls[1]![0]);
});
it('blocks expired approvals and checks expiry again before a later model invocation',async()=>{
 vi.stubEnv('CALLSIGN_ANALYSIS_SMOKE_BUDGET',JSON.stringify({...budget,expiresAt:1799999999}));const expired=await fixture();try{expired.start();await vi.waitFor(()=>expect(expired.socket.readyState).toBe(3));expect(expired.socket.sent).toContainEqual({type:'unavailable',code:'ANALYSIS_LIMIT'});expect(expired.reserve).not.toHaveBeenCalled();expect(expired.stream).not.toHaveBeenCalled();}finally{await expired.close();}
 vi.stubEnv('CALLSIGN_ANALYSIS_SMOKE_BUDGET',JSON.stringify({...budget,expiresAt:1800000005}));const f=await fixture();
 try{f.start();await vi.waitFor(()=>expect(f.stream).toHaveBeenCalledOnce());expect(f.stream.mock.calls[0]![0].maxDurationMs).toBe(5000);f.setTime(1800000006);
  const options=f.stream.mock.calls[0]![0];options.onRevision({streamId:options.streamId,segmentId:'one',revision:1,final:true,text:'합성 시험 발화',source:'remote'});
  await vi.waitFor(()=>expect(f.socket.readyState).toBe(3));expect(f.analyze).not.toHaveBeenCalled();expect(f.reserve.mock.calls.some(c=>c[2]==='llm-requests')).toBe(false);
 }finally{await f.close();}
});
it('keeps a failed model attempt charged to the same global approval and does not retry it',async()=>{
 vi.stubEnv('CALLSIGN_ANALYSIS_SMOKE_BUDGET',JSON.stringify(budget));const f=await fixture();
 try{f.start();await vi.waitFor(()=>expect(f.stream).toHaveBeenCalledOnce());const options=f.stream.mock.calls[0]![0];options.onRevision({streamId:options.streamId,segmentId:'one',revision:1,final:true,text:'합성 시험 발화',source:'remote'});
  await vi.waitFor(()=>expect(f.analyze).toHaveBeenCalledOnce());await vi.waitFor(()=>expect(f.settle.mock.calls.some(([id,n])=>id.startsWith('llm:')&&n===1)).toBe(true));
  const reservation=f.reserve.mock.calls.find(c=>c[2]==='llm-requests')!;expect(reservation[4]).toContainEqual({key:'provider-smoke:approved-test-only:llm-requests',limit:4});expect(reservation[5]).toBe(budget.expiresAt);expect(f.analyze).toHaveBeenCalledOnce();
 }finally{await f.close();}
});

it('releases a connection reservation if shutdown wins before external invocation',async()=>{
 vi.stubEnv('CALLSIGN_ANALYSIS_SMOKE_BUDGET',JSON.stringify(budget));let entered!:()=>void,release!:()=>void;const waiting=new Promise<void>(r=>{entered=r;}),held=new Promise<void>(r=>{release=r;});
 const reserve=vi.fn<QuotaStore['reserve']>(async()=>{entered();await held;}),f=await fixture(reserve);
 try{f.start();await waiting;const closing=f.close();release();await closing;expect(f.stream).not.toHaveBeenCalled();expect(reserve).toHaveBeenCalledOnce();expect(f.settle.mock.calls).toHaveLength(1);expect(f.settle.mock.calls[0]![1]).toBe(0);}finally{release();await f.close();}
});

it('reports provider-off without exposing credentials or opening a stream',async()=>{
 for(const key of ['DEEPGRAM_API_KEY','DEEPGRAM_API_KEY_FILE','DEEPGRAM_MODEL','OPENAI_API_KEY','OPENAI_API_KEY_FILE','ANTHROPIC_API_KEY','ANTHROPIC_API_KEY_FILE','CALLSIGN_ANALYSIS_SMOKE_BUDGET'])vi.stubEnv(key,'');
 vi.stubEnv('CALLSIGN_ANALYSIS_PROVIDER','disabled');
 const f=await serviceFixture();const app={addHook:vi.fn(),get:vi.fn()} as unknown as Parameters<typeof registerServiceAudio>[0];
 const status=await registerServiceAudio(app,{authority:f.authority,actorFor:async()=>f.receiver,sessionId:async()=> 'session',connections:new SessionConnections(),origin:'https://test.example',quota:{reserve:vi.fn(),settle:vi.fn(),close:async()=>{}}});
 expect(status()).toEqual({mode:'disabled',speech:false,model:false});
});

it('leaves subsequent filming connections their share without changing the shared total',async()=>{
 vi.stubEnv('CALLSIGN_ANALYSIS_SMOKE_BUDGET',JSON.stringify({...budget,sttSeconds:180,connections:3,llmRequests:12,expiresAt:1800000300}));
 let used=0,reserved=0;
 const reserve=vi.fn<QuotaStore['reserve']>(async(_id,_institution,unit,amount)=>{if(unit==='stt-seconds'){if(used+reserved+amount>180)throw Error('QUOTA_EXHAUSTED');reserved+=amount;}});
 for(let i=0;i<3;i++){
  const f=await fixture(reserve);try{f.start();await vi.waitFor(()=>expect(f.stream).toHaveBeenCalledOnce());expect(f.stream.mock.calls[0]![0].maxDurationMs).toBe(60000);
   const call=f.reserve.mock.calls.filter(c=>c[2]==='stt-seconds').at(-1)!;expect(call[3]).toBe(60);expect(call[4]).toContainEqual({key:'provider-smoke:approved-test-only:stt-seconds',limit:180});
  }finally{await f.close();reserved-=60;used+=15;}
 }
 expect(used).toBe(45);expect(reserved).toBe(0);
});
it('does not let one stream spend later connections model requests',async()=>{
 vi.stubEnv('CALLSIGN_ANALYSIS_SMOKE_BUDGET',JSON.stringify({...budget,connections:2,llmRequests:2}));const f=await fixture();
 try{f.start();await vi.waitFor(()=>expect(f.stream).toHaveBeenCalledOnce());const options=f.stream.mock.calls[0]![0];
  options.onRevision({streamId:options.streamId,segmentId:'one',revision:1,final:true,text:'합성 첫 발화',source:'remote'});
  await vi.waitFor(()=>expect(f.analyze).toHaveBeenCalledOnce());await vi.waitFor(()=>expect(f.settle.mock.calls.some(([id])=>id.startsWith('llm:'))).toBe(true));
  options.onRevision({streamId:options.streamId,segmentId:'two',revision:1,final:true,text:'합성 다음 발화',source:'remote'});
  await vi.waitFor(()=>expect(f.socket.sent.some(e=>e.type==='risk'&&e.event?.status==='unavailable')).toBe(true));expect(f.analyze).toHaveBeenCalledOnce();
 }finally{await f.close();}
});
