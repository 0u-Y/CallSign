// Test-process transport only: real PostgreSQL, LOGINs and SQL; no published port or TCP relay.
import { registerHooks, createRequire } from 'node:module';
const postgres=createRequire(import.meta.url)('../../node_modules/postgres/cjs/src/index.js');
import { realpathSync, statSync, lstatSync } from 'node:fs';
import { resolve, sep } from 'node:path';
const root=process.env.CALLSIGN_HTTP_TEST_ROOT,socket=process.env.CALLSIGN_TEST_PG_SOCKET;
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration'||!root||!socket)throw new Error('OWNED_POSTGRES_SOCKET_EXECUTION_BLOCKED');
const owned=realpathSync(root),directory=realpathSync(socket);
if(!directory.startsWith(owned+sep)||statSync(owned).uid!==process.getuid()||(statSync(owned).mode&0o077)!==0||!lstatSync(resolve(directory,'.s.PGSQL.5432')).isSocket())throw new Error('OWNED_POSTGRES_SOCKET_REQUIRED');
function connect(url,options){
 const target=new URL(url);
 if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||!/^\/callsign_test_[a-z0-9_]+$/.test(target.pathname)||target.search||target.hash||target.port&&target.port!=='5432')throw new Error('DISPOSABLE_SOCKET_DATABASE_REQUIRED');
 return postgres(url,{...options,host:directory});
}
Object.assign(connect,postgres);
export default connect;
registerHooks({resolve(specifier,context,next){return specifier==='postgres'?{url:import.meta.url,shortCircuit:true}:next(specifier,context);}});
