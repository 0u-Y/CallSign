import {it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
it('retains pressure and reserve stops, counts the complete deployment and expires without a restart',()=>{
 const check=`import ast,pathlib
source=ast.parse(pathlib.Path('scripts/monitor-deployment.py').read_text());function=next(n for n in source.body if isinstance(n,ast.FunctionDef)and n.name=='resource_reason');scope={};exec(compile(ast.Module(body=[function],type_ignores=[]),'<monitor>','exec'),scope);check=scope['resource_reason'];gib=1024**3
sample={'stop':None,'memAvailableBytes':20*gib,'monotonicNs':10}
assert check(sample,16*gib,20)is None
assert check(sample,16*gib+1,20)=='DEPLOYMENT_16_GIB_BUDGET'
assert check(dict(sample,memAvailableBytes=16*gib-1),1,20)=='HOST_16_GIB_RESERVE'
assert check(dict(sample,stop={'reason':'SUSTAINED_SWAP_OUT'}),1,20)=='SUSTAINED_SWAP_OUT'
assert check(sample,1,10)=='APPROVED_PERIOD_ENDED'
`;
 expect(()=>execFileSync('python3',['-c',check],{stdio:'pipe'})).not.toThrow();
});
