import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('./lib/api.js',()=>({api:mock.api}));
import {completeLogin} from './lib/loginCompletion.js';
beforeEach(()=>mock.api.mockReset());
it('joins concurrent mounts once and releases failed callback before a code-less remount',async()=>{
 let reject!:(e:Error)=>void;mock.api.mockImplementation(()=>new Promise((_r,j)=>{reject=j;}));
 const first=completeLogin('code','state');expect(completeLogin()).toBe(first);expect(completeLogin('code','state')).toBe(first);expect(mock.api).toHaveBeenCalledTimes(1);
 reject(new Error('callback failed'));await expect(first).rejects.toThrow('callback failed');expect(completeLogin()).toBeUndefined();
 mock.api.mockResolvedValue({official:false});await expect(completeLogin('new-code','new-state')).resolves.toEqual({official:false});expect(mock.api).toHaveBeenCalledTimes(2);expect(completeLogin()).toBeUndefined();
});
it('releases successful exchange without resending a consumed code on remount',async()=>{mock.api.mockResolvedValue({official:true});const p=completeLogin('official-code','state');expect(completeLogin()).toBe(p);await p;expect(completeLogin()).toBeUndefined();expect(mock.api).toHaveBeenCalledTimes(1);});
