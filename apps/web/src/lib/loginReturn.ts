const key='callsign-login-return';
const paths=new Set(['/service','/demo','/demo/work','/demo/call','/demo/governance','/demo/filming']);
// Keep return navigation in this tab and bind it to the actual OIDC request state.
export function rememberLoginReturn(url:string,path:string,storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,now=Date.now()){
 const state=new URL(url).searchParams.get('state');
 storage.removeItem(key);
 if(state&&paths.has(path))storage.setItem(key,JSON.stringify({state,path,created:now}));
}
export function takeLoginReturn(state:string|null,storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,now=Date.now()){
 const raw=storage.getItem(key);storage.removeItem(key);
 try{const value=JSON.parse(raw??'null');return state&&value?.state===state&&paths.has(value.path)&&typeof value.created==='number'&&now>=value.created&&now-value.created<600000?value.path as string:undefined;}catch{return undefined;}
}
