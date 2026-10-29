import { expect,it } from 'vitest';
import net from 'node:net';
import dgram from 'node:dgram';
import { readFileSync } from 'node:fs';
it('blocks fetch, TCP, server listen and UDP before any service can start',()=>{
 expect(()=>fetch('https://unreachable.invalid')).toThrow('LIGHT_NETWORK_FORBIDDEN');
 expect(()=>new net.Socket().connect(1,'127.0.0.1')).toThrow('LIGHT_TCP_FORBIDDEN');
 expect(()=>net.createServer().listen(0)).toThrow('LIGHT_SERVER_FORBIDDEN');
 const socket=dgram.createSocket('udp4');try{expect(()=>socket.send(Buffer.from('test'),1,'127.0.0.1')).toThrow('LIGHT_UDP_FORBIDDEN');}finally{socket.close();}
 expect(readFileSync('vitest.config.ts','utf8')).toContain('maxWorkers: 2');
});

it.each(['infrastructure','integration','chain','media','performance'])('keeps the %s entrypoint blocked without explicit execution authorization',async category=>{
 const {spawnSync}=await import('node:child_process');
 // The child can only exit. Even a broken guard cannot start infrastructure or access a provider.
 const result=spawnSync(process.execPath,['scripts/restricted.mjs',category,process.execPath,'-e','process.exit(0)'],{env:{},encoding:'utf8'});
 expect(result.status).toBe(78);expect(result.stderr).toContain('BLOCKED');
});

it('runs source hygiene with Git alone on PATH, without requiring ripgrep on CI',async()=>{
 const {mkdtemp,symlink,rm}=await import('node:fs/promises');const {existsSync}=await import('node:fs');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const {execFileSync}=await import('node:child_process');
 const git=(process.env.PATH??'').split(':').map(dir=>join(dir,'git')).find(path=>existsSync(path));if(!git)throw new Error('GIT_REQUIRED_FOR_CHECKOUT');
 const directory=await mkdtemp(join(tmpdir(),'callsign-git-only-'));try{await symlink(git,join(directory,'git'));const output=execFileSync(process.execPath,['scripts/check-source.mjs'],{env:{...process.env,PATH:directory},encoding:'utf8',timeout:10000});expect(output).toContain('Source hygiene and JavaScript syntax passed');}finally{await rm(directory,{recursive:true});}
});
