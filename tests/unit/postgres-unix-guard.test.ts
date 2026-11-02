import {execFileSync} from 'node:child_process';
import {it,expect} from 'vitest';
it('refuses Unix database transport before any connection without explicit integration ownership',()=>{
 expect(()=>execFileSync(process.execPath,['--import','./tests/integration/postgres-unix.mjs','-e','throw new Error("MUST_NOT_RUN")'],{env:{PATH:process.env.PATH},stdio:'pipe'})).toThrow(/OWNED_POSTGRES_SOCKET_EXECUTION_BLOCKED/);
});
