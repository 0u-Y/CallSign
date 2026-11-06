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
it('retries an interrupted successful GET body instead of returning an empty workspace',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn().mockResolvedValueOnce({ok:true,status:200,json:()=>Promise.reject(new TypeError('body interrupted'))}).mockResolvedValueOnce(Response.json({actor:{userId:'synthetic'}}));vi.stubGlobal('fetch',fetcher);
 const pending=api('/v3/workspace');await vi.advanceTimersByTimeAsync(250);expect(await pending).toEqual({actor:{userId:'synthetic'}});expect(fetcher).toHaveBeenCalledTimes(2);
});
it('rejects malformed successful JSON and never replays a command with an interrupted body',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,status:200,json:()=>Promise.reject(new SyntaxError('invalid JSON'))});vi.stubGlobal('fetch',fetcher);
 await expect(api('/v3/workspace')).rejects.toThrow('invalid JSON');expect(fetcher).toHaveBeenCalledTimes(1);
 fetcher.mockReset().mockResolvedValue({ok:true,status:200,json:()=>Promise.reject(new TypeError('body interrupted'))});
 await expect(api('/v3/outcome',{method:'POST',body:'{}'})).rejects.toThrow('body interrupted');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('preserves a known HTTP failure even if its error body cannot be read',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:false,status:403,json:()=>Promise.reject(new TypeError('body interrupted'))});vi.stubGlobal('fetch',fetcher);
 await expect(api('/v3/workspace')).rejects.toMatchObject({status:403,code:'REQUEST_FAILED'});expect(fetcher).toHaveBeenCalledTimes(1);
});
