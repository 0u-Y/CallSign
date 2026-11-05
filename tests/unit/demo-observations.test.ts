import {it,expect} from 'vitest';
import {compareObservedHeads,observationFresh} from '../../apps/web/src/lib/ledgerObservations.js';
import {inspectLedgerNodes} from '../../services/api/src/ledger-health.js';
it('only compares fresh, same-height observations and never turns missing evidence into success',()=>{
 expect(compareObservedHeads([])).toContain('비교 관측 없음');
 expect(compareObservedHeads([{node:1,status:'current',height:'1',hash:'a'},{node:2,status:'current',height:'2',hash:'b'}])).toContain('비교 관측 없음');
 expect(compareObservedHeads([{node:1,status:'current',height:'1',hash:'a'},{node:2,status:'stale',height:'1',hash:'b'}])).toContain('비교 관측 없음');
 expect(compareObservedHeads([{node:1,status:'current',height:'1',hash:'a'},{node:2,status:'current',height:'1',hash:'b'}])).toContain('불일치');
 expect(compareObservedHeads([{node:1,status:'current',height:'1',hash:'a'},{node:2,status:'current',height:'1',hash:'a'}])).toContain('투표 증거 아님');
});
it('returns verified RPC head hash without publishing RPC endpoints and rejects malformed hashes',async()=>{
 const hash='0x'+'ab'.repeat(32);
 const run=(value:string)=>inspectLedgerNodes({urls:['1','2','3','4'],networkId:'1',genesisHash:'genesis',now:100,fetcher:(async()=>new Response(JSON.stringify([{id:1,result:'0x1'},{id:2,result:{number:'0x1',timestamp:'0x64',hash:value}},{id:3,result:false},{id:4,result:'0x3'},{id:5,result:{hash:'genesis'}}]))) as typeof fetch});
 expect((await run(hash))[0]).toMatchObject({status:'current',height:'1',hash});
 expect((await run('invalid'))[0]).toEqual({node:1,status:'unavailable'});
});

it('expires node observations on a local monotonic clock and rejects clock resets or missing samples',()=>{expect(observationFresh(1000,11000)).toBe(true);for(const now of [11001,999,NaN,Infinity])expect(observationFresh(1000,now)).toBe(false);expect(observationFresh(undefined,1000)).toBe(false);});
