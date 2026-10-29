import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {contractInteropVector} from '../../scripts/contract-interop.js';
it('keeps the executed Solidity fixture tied to current application typed-data and ABI implementations',async()=>{
 const fixture=JSON.parse(await readFile('artifacts/contract-interop-fixture-20261030.json','utf8'));
 expect(await contractInteropVector()).toEqual(fixture);
});
