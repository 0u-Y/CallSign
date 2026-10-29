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
