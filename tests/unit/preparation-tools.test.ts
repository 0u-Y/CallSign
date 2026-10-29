import {expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hashTypedData} from 'viem';
import {hashCanonical,bankPolicy,policyHash,configurationTypedData} from '../../packages/protocol/src/index.js';
it('all preparation entrypoints default to inspection without touching key/config output or starting infrastructure',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'callsign-fixture-dry-run-'));try{const commands=[['scripts/prepare-finals.ts','keys',join(dir,'keys')],['scripts/prepare-finals.ts','approval-key',dir,join(dir,'new-manifest.json')],['scripts/prepare-pbx.ts',join(dir,'pbx')],['scripts/prepare-service-network.ts',join(dir,'network.json')],['scripts/prepare-besu-peers.ts',dir],['scripts/migrate-finals.ts'],['scripts/provision-finals.ts'],['scripts/deploy-service-registry.ts']];
 for(const args of commands){const value=execFileSync(process.execPath,['--import','tsx',...args],{encoding:'utf8',env:process.env,timeout:10000});expect(JSON.parse(value).mode).toBe('dry-run');}expect(await readdir(dir)).toEqual([]);
 }finally{await rm(dir,{recursive:true});}
});
it('inspects a public signing proposal without opening the supplied private-key path',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'callsign-fixture-review-'));try{const contents={directory:[{path:'/official',title:'업무'}],policy:bankPolicy},request={institutionId:`0x${'a'.repeat(64)}`,expectedEpoch:'1',expectedDirectoryHash:`0x${'1'.repeat(64)}`,expectedDirectoryVersion:'1',expectedPolicyVersion:'1',expectedPolicyHash:`0x${policyHash(bankPolicy)}`,newDirectoryHash:`0x${hashCanonical(contents.directory)}`,newDirectoryVersion:'2',newPolicyVersion:'1',newPolicyHash:`0x${policyHash(bankPolicy)}`,nonce:`0x${'b'.repeat(64)}`,deadline:String(Math.floor(Date.now()/1000)+300)},registry=`0x${'1'.repeat(40)}` as const,chain=20260914,digest=hashTypedData(configurationTypedData(chain,registry,request)),path=join(dir,'proposal.json');
 await writeFile(path,JSON.stringify({format:'callsign-configuration-review',version:1,operation:hashCanonical(request),chainId:chain,registryAddress:registry,institutionId:request.institutionId,digest,request,contents}));
 const value=execFileSync(process.execPath,['--import','tsx','scripts/sign-recovery.ts',path,'/private-key-must-not-be-opened',digest,'configuration'],{encoding:'utf8',timeout:10000,env:{...process.env,NETWORK_ID:String(chain),REGISTRY_ADDRESS:registry}});const report=JSON.parse(value);expect(report.mode).toBe('dry-run');expect(report.privateKeyRead).toBe(false);expect(report.digest).toBe(digest);
 }finally{await rm(dir,{recursive:true});}
});
