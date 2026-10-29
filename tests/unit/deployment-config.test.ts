import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
it.each(['infra/deploy/compose.yml','infra/deploy/compose.pbx.yml'])('documents every deployment variable used by %s without resolving secrets or running Compose',file=>{
 const declared=new Set(readFileSync('.env.example','utf8').split('\n').filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>l.split('=',1)[0]));
 const used=[...readFileSync(file,'utf8').matchAll(/\$\{([A-Z_][A-Z0-9_]*)/g)].map(m=>m[1]!);
 expect([...new Set(used)].filter(name=>!declared.has(name))).toEqual([]);
});
