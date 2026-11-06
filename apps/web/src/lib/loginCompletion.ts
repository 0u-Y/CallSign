import {api} from './api.js';
let pending:Promise<{official:boolean}>|undefined;
// A remount joins only the in-flight exchange; the URL code is consumed by the caller.
export function completeLogin(code?:string|null,state?:string|null){
 if(!pending&&code&&state){
  const request=api<{official:boolean}>('/v3/auth/callback',{method:'POST',body:JSON.stringify({code,state})});
  const completion=request.finally(()=>{if(pending===completion)pending=undefined;});
  pending=completion;
 }
 return pending;
}
