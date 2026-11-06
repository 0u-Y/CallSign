import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SigningKeyPair, RuntimePolicy } from '../../packages/protocol/src/index.js';
import type { ServiceTrust } from '../../packages/verifier/src/index.js';
const mocked=vi.hoisted(()=>({context:{} as Record<string,unknown>,requests:[] as string[],ids:[] as unknown[],failClaim:false,holdOutcome:undefined as Promise<void>|undefined}));
vi.mock('../../apps/web/src/lib/api.js',()=>({ApiError:class extends Error{},api:vi.fn(async(path:string,init?:RequestInit)=>{mocked.requests.push(path);if(path==='/v3/outcome'&&mocked.holdOutcome)await mocked.holdOutcome;if(path==='/v3/claim'){mocked.ids.push((init?.headers as Record<string,string>)?.['idempotency-key']);if(mocked.failClaim){mocked.failClaim=false;throw new TypeError('response lost');}}return path.startsWith('/v3/call-context')?mocked.context:{};})}));
import {hashSdp,extractSingleSdpFingerprint} from '../../packages/protocol/src/index.js';
import { ServiceCall } from '../../apps/web/src/lib/serviceCall.js';
describe('product controller identity pinning before SIP enrollment',()=>{
 beforeEach(()=>{mocked.requests=[];mocked.ids=[];mocked.failClaim=false;mocked.holdOutcome=undefined;mocked.context={attempt:{id:'attempt',intentId:'intent',agentId:'agent',sessionId:'session'},authorization:{payload:{recipientId:'recipient'}}};});
 function controller(){return new ServiceCall({role:'recipient',attemptId:'attempt',intentId:'intent',recipientId:'recipient',agentId:'agent',key:{} as SigningKeyPair,trust:{} as ServiceTrust,runtimePolicy:{} as RuntimePolicy,status:()=>{},remote:()=>{},risk:()=>{}});}
 it('rejects an authorization for another recipient instead of using its recipient as the expectation',async()=>{
  const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});mocked.context.authorization={payload:{recipientId:'someone-else'}};
  await expect(controller().connect()).rejects.toThrow('CALL_CONTEXT_IDENTITY_CHANGED');
  expect(mocked.requests).not.toContain('/v3/pbx/endpoint');expect(mocked.requests).not.toContain('/v3/enroll');expect(warning).toHaveBeenCalledWith('CallSign call verification failed','CALL_CONTEXT_IDENTITY_CHANGED');warning.mockRestore();
 });
 it('rejects context moved to a different assigned task before opening media',async()=>{
  mocked.context.attempt={id:'attempt',intentId:'another-intent',agentId:'agent',sessionId:'session'};
  await expect(controller().connect()).rejects.toThrow('CALL_CONTEXT_IDENTITY_CHANGED');
  expect(mocked.requests).not.toContain('/v3/pbx/endpoint');
 });
 it('retries an uncertain write with the same request ID before rejecting unrelated context',async()=>{mocked.failClaim=true;mocked.context.authorization={payload:{recipientId:'someone-else'}};await expect(controller().connect()).rejects.toThrow('CALL_CONTEXT_IDENTITY_CHANGED');expect(mocked.ids).toHaveLength(2);expect(mocked.ids[0]).toBe(mocked.ids[1]);expect(mocked.requests).not.toContain('/v3/pbx/endpoint');});

 it('keeps accepted media muted while native transport is connecting, bounded by the initial connection window',async()=>{
  const now=Math.floor(Date.now()/1000),sdp='v=0\r\na=fingerprint:sha-256 '+Array(32).fill('AA').join(':')+'\r\n';
  const binding={recipientSdpHash:hashSdp(sdp),recipientFingerprint:extractSingleSdpFingerprint(sdp)};
  mocked.context={attempt:{id:'attempt',intentId:'intent',agentId:'agent',sessionId:'session',status:'accepted',firstConnectBy:now+60,callEndBy:now+180,binding,pbx:{reports:{sender:{},recipient:{}}},lease:{payload:{expiresAt:now+30}}},authorization:{payload:{recipientId:'recipient'}},credential:{},receipt:{}};
  const c=controller(),pause=vi.fn(),peer={connectionState:'connecting',localDescription:{sdp},remoteDescription:{sdp},getStats:vi.fn(async()=>new Map())};
  Object.assign(c,{completed:new Set(['invitation']),sip:{callId:'call',media:{peer},pause}});
  const tick=Reflect.get(c,'tick').bind(c) as ()=>Promise<void>;
  await tick();expect(pause).toHaveBeenCalledOnce();expect(mocked.requests.some(p=>p.includes('/pbx/evidence'))).toBe(false);expect(mocked.requests).not.toContain('/v3/outcome');
  peer.connectionState='failed';await expect(tick()).rejects.toThrow('PBX_TRANSPORT_NOT_CONNECTED');
  peer.connectionState='connected';await expect(tick()).rejects.toThrow('DTLS_STATS_NOT_CONNECTED');
  peer.connectionState='connecting';(mocked.context.attempt as {firstConnectBy:number}).firstConnectBy=now-1;
  await expect(tick()).rejects.toThrow('CALL_WINDOW_EXPIRED');
 });

 it('sends one terminal request and stops verification while explicit termination is pending',async()=>{
  let release!:()=>void;mocked.holdOutcome=new Promise<void>(resolve=>{release=resolve;});
  const c=controller();Object.assign(c,{context:{attempt:{status:'accepted'}},sip:{pause:vi.fn(),close:vi.fn()}});
  const first=c.end();await Promise.resolve();const second=c.end();await Promise.resolve();
  try{expect(mocked.requests.filter(p=>p==='/v3/outcome')).toHaveLength(1);await (Reflect.get(c,'tick').bind(c) as ()=>Promise<void>)();expect(mocked.requests.filter(p=>p.startsWith('/v3/call-context'))).toHaveLength(0);}finally{release();await Promise.all([first,second]);}
 });

});
