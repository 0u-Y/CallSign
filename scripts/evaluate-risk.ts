// Offline rules only. No model, provider, microphone or service is initialized.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { analyzeWithRules } from '../services/api/src/risk.js';
const fixture=JSON.parse(await readFile(new URL('../tests/fixtures/korean-risk-evaluation.json',import.meta.url),'utf8')) as {provenance:string;cases:Array<{id:string;text:string;expected:string[]}>};
assert.equal(typeof fixture.provenance,'string');assert(Array.isArray(fixture.cases)&&fixture.cases.length<=1000);
let falsePositive=0,falseNegative=0;
for(const c of fixture.cases){assert.equal(typeof c.id,'string');assert.equal(typeof c.text,'string');assert(Array.isArray(c.expected)&&c.expected.every(s=>typeof s==='string'));const actual=new Set<string>(analyzeWithRules(c.text).signals.map(s=>s.category));for(const x of actual)if(!c.expected.includes(x))falsePositive++;for(const x of c.expected)if(!actual.has(x))falseNegative++;}
process.stdout.write(JSON.stringify({engine:'rules-development-fixture',cases:fixture.cases.length,falsePositive,falseNegative,provenance:fixture.provenance,providerCalls:0})+'\n');
