import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SigningKeyPair, RuntimePolicy } from '../../packages/protocol/src/index.js';
import type { ServiceTrust } from '../../packages/verifier/src/index.js';
const mocked=vi.hoisted(()=>({context:{} as Record<string,unknown>,requests:[] as string[],ids:[] as unknown[],failClaim:false}));
vi.mock('../../apps/web/src/lib/api.js',()=>({ApiError:class extends Error{},api:vi.fn(async(path:string,init?:RequestInit)=>{mocked.requests.push(path);if(path==='/v3/claim'){mocked.ids.push((init?.headers as Record<string,string>)?.['idempotency-key']);if(mocked.failClaim){mocked.failClaim=false;throw new TypeError('response lost');}}return path.startsWith('/v3/call-context')?mocked.context:{};})}));
import { ServiceCall } from '../../apps/web/src/lib/serviceCall.js';
describe('product controller identity pinning before SIP enrollment',()=>{
 beforeEach(()=>{mocked.requests=[];mocked.ids=[];mocked.failClaim=false;mocked.context={attempt:{id:'attempt',intentId:'intent',agentId:'agent',sessionId:'session'},authorization:{payload:{recipientId:'recipient'}}};});
 function controller(){return new ServiceCall({role:'recipient',attemptId:'attempt',intentId:'intent',recipientId:'recipient',agentId:'agent',key:{} as SigningKeyPair,trust:{} as ServiceTrust,runtimePolicy:{} as RuntimePolicy,status:()=>{},remote:()=>{},risk:()=>{}});}
 it('rejects an authorization for another recipient instead of using its recipient as the expectation',async()=>{
  mocked.context.authorization={payload:{recipientId:'someone-else'}};
  await expect(controller().connect()).rejects.toThrow('CALL_CONTEXT_IDENTITY_CHANGED');
  expect(mocked.requests).not.toContain('/v3/pbx/endpoint');expect(mocked.requests).not.toContain('/v3/enroll');
 });
 it('rejects context moved to a different assigned task before opening media',async()=>{
  mocked.context.attempt={id:'attempt',intentId:'another-intent',agentId:'agent',sessionId:'session'};
  await expect(controller().connect()).rejects.toThrow('CALL_CONTEXT_IDENTITY_CHANGED');
  expect(mocked.requests).not.toContain('/v3/pbx/endpoint');
 });
 it('retries an uncertain write with the same request ID before rejecting unrelated context',async()=>{mocked.failClaim=true;mocked.context.authorization={payload:{recipientId:'someone-else'}};await expect(controller().connect()).rejects.toThrow('CALL_CONTEXT_IDENTITY_CHANGED');expect(mocked.ids).toHaveLength(2);expect(mocked.ids[0]).toBe(mocked.ids[1]);expect(mocked.requests).not.toContain('/v3/pbx/endpoint');});

});
