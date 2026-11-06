import {afterEach,expect,it,vi} from 'vitest';
vi.hoisted(()=>vi.stubGlobal('sessionStorage',{getItem:()=>null}));
import {api,ApiError} from './lib/api.js';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('retries a transient GET once and preserves credentials and request options',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(Response.json({ok:true}));vi.stubGlobal('fetch',fetcher);
 const signal=new AbortController().signal,pending=api('/v3/public-trust',{signal});await vi.advanceTimersByTimeAsync(250);expect(await pending).toEqual({ok:true});expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[1]![1]).toMatchObject({credentials:'include',signal});
});
it('does not replay commands or HTTP authorization failures',async()=>{
 const fetcher=vi.fn().mockRejectedValue(new TypeError('network'));vi.stubGlobal('fetch',fetcher);await expect(api('/v3/cancel',{method:'POST',body:'{}'})).rejects.toThrow('network');expect(fetcher).toHaveBeenCalledTimes(1);
 fetcher.mockReset().mockResolvedValue(Response.json({error:{code:'UNAUTHORIZED'}},{status:401}));await expect(api('/v3/auth/me')).rejects.toBeInstanceOf(ApiError);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('stops after one read retry',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn().mockRejectedValue(new TypeError('network'));vi.stubGlobal('fetch',fetcher);const pending=expect(api('/v3/workspace')).rejects.toThrow('network');await vi.advanceTimersByTimeAsync(250);await pending;expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not retry after cancellation while waiting',async()=>{
 vi.useFakeTimers();const controller=new AbortController(),fetcher=vi.fn().mockRejectedValue(new TypeError('network'));vi.stubGlobal('fetch',fetcher);
 const pending=expect(api('/v3/workspace',{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});await vi.advanceTimersByTimeAsync(1);controller.abort();await vi.advanceTimersByTimeAsync(250);await pending;expect(fetcher).toHaveBeenCalledTimes(1);
});
