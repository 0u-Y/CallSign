import {expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hashTypedData} from 'viem';
import {hashCanonical,bankPolicy,policyHash,configurationTypedData} from '../../packages/protocol/src/index.js';
it.each([
 ['service keys',(dir:string)=>['scripts/prepare-finals.ts','keys',join(dir,'keys')]],
 ['separate management keys',(dir:string)=>['scripts/prepare-finals.ts','management-keys',join(dir,'keys')]],
 ['approval key',(dir:string)=>['scripts/prepare-finals.ts','approval-key',dir,join(dir,'new-manifest.json')]],
 ['PBX',(dir:string)=>['scripts/prepare-pbx.ts',join(dir,'pbx')]],
 ['service network',(dir:string)=>['scripts/prepare-service-network.ts',join(dir,'network.json')]],
 ['Besu peers',(dir:string)=>['scripts/prepare-besu-peers.ts',dir]],
 ['migration',()=>['scripts/migrate-finals.ts']],
 ['account provisioning',()=>['scripts/provision-finals.ts']],
 ['contract deployment',()=>['scripts/deploy-service-registry.ts']],
] as const)('inspects %s without touching key/config output or starting infrastructure',async(_name,args)=>{
 const dir=await mkdtemp(join(tmpdir(),'callsign-fixture-dry-run-'));try{
 const value=execFileSync(process.execPath,['--import','tsx',...args(dir)],{encoding:'utf8',env:process.env,timeout:10000});expect(JSON.parse(value).mode).toBe('dry-run');expect(await readdir(dir)).toEqual([]);
 }finally{await rm(dir,{recursive:true});}
});
it('inspects a public signing proposal without opening the supplied private-key path',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'callsign-fixture-review-'));try{const contents={directory:[{path:'/official',title:'업무'}],policy:bankPolicy},request={institutionId:`0x${'a'.repeat(64)}`,expectedEpoch:'1',expectedDirectoryHash:`0x${'1'.repeat(64)}`,expectedDirectoryVersion:'1',expectedPolicyVersion:'1',expectedPolicyHash:`0x${policyHash(bankPolicy)}`,newDirectoryHash:`0x${hashCanonical(contents.directory)}`,newDirectoryVersion:'2',newPolicyVersion:'1',newPolicyHash:`0x${policyHash(bankPolicy)}`,nonce:`0x${'b'.repeat(64)}`,deadline:String(Math.floor(Date.now()/1000)+300)},registry=`0x${'1'.repeat(40)}` as const,chain=20260914,digest=hashTypedData(configurationTypedData(chain,registry,request)),path=join(dir,'proposal.json');
 await writeFile(path,JSON.stringify({format:'callsign-configuration-review',version:1,operation:hashCanonical(request),chainId:chain,registryAddress:registry,institutionId:request.institutionId,digest,request,contents}));
 const value=execFileSync(process.execPath,['--import','tsx','scripts/sign-recovery.ts',path,'/private-key-must-not-be-opened',digest,'configuration'],{encoding:'utf8',timeout:10000,env:{...process.env,NETWORK_ID:String(chain),REGISTRY_ADDRESS:registry}});const report=JSON.parse(value);expect(report.mode).toBe('dry-run');expect(report.privateKeyRead).toBe(false);expect(report.digest).toBe(digest);
 }finally{await rm(dir,{recursive:true});}
});

it('refuses the offline media package recipe before any host install when owned-container authorization is absent',()=>{
 try{execFileSync('bash',['infra/deploy/build-media.sh'],{encoding:'utf8',env:{PATH:process.env.PATH},timeout:3000});throw new Error('BUILD_GUARD_MISSING');}catch(error){expect((error as {status:number}).status).toBe(78);}
});
it('blocks the final-image media driver before Docker or test preparation without explicit integration authorization',()=>{
 try{execFileSync('python3',['tests/integration/runtime-media-driver.py'],{encoding:'utf8',env:{PATH:process.env.PATH},timeout:3000});throw new Error('MEDIA_DRIVER_GUARD_MISSING');}catch(error){expect((error as {status:number;stderr:Buffer}).status).toBe(1);expect(String((error as {stderr:Buffer}).stderr)).toContain('INTEGRATION_EXECUTION_BLOCKED');}
});
