import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {toFunctionSelector,type Abi} from 'viem';
import {serviceRegistryAbi} from '../../services/api/src/worker-ledger.js';
it('keeps actual compiled management ABI and worker encoding in sync, including the disabled legacy selector',async()=>{
 const artifact=JSON.parse(await readFile('artifacts/service-registry-build-20261027.json','utf8')) as {abi:Abi;sourceHashes:Record<string,string>};
 for(const fn of serviceRegistryAbi.filter(fn=>fn.type==='function')){const actual=artifact.abi.find(v=>v.type==='function'&&v.name===fn.name);expect(actual?.type).toBe('function');if(actual?.type==='function')expect(toFunctionSelector(actual)).toBe(toFunctionSelector(fn));}
 expect(artifact.abi.filter(v=>v.type==='function'&&v.name==='updateDirectory')).toHaveLength(1);
 for(const [path,hash] of Object.entries(artifact.sourceHashes))expect(createHash('sha256').update(await readFile(path)).digest('hex')).toBe(hash);
});
