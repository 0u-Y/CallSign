import {it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {verifyReleaseFiles,publicReleaseFiles} from '../../scripts/verify-release-files.mjs';

it('checks every received public asset and rejects mismatches, traversal and symlink substitution',async()=>{
 const root=await mkdtemp(join(tmpdir(),'callsign-publication-'));
 try{
  const rows=[];for(const name of publicReleaseFiles){const data=Buffer.from('unit fixture '+name);await writeFile(join(root,name),data);rows.push(createHash('sha256').update(data).digest('hex')+'  '+name);}
  await writeFile(join(root,'SHA256SUMS'),rows.join('\n')+'\n');expect((await verifyReleaseFiles(root)).files).toHaveLength(4);
  await writeFile(join(root,'images.json'),'changed');await expect(verifyReleaseFiles(root)).rejects.toThrow('CHECKSUM_MISMATCH');
  await writeFile(join(root,'SHA256SUMS'),rows.join('\n')+'\n'+'1'.repeat(64)+'  ../outside\n');await expect(verifyReleaseFiles(root)).rejects.toThrow('INVALID_RELEASE_CHECKSUM_ENTRY');
  await writeFile(join(root,'SHA256SUMS'),rows.join('\n')+'\n');await rm(join(root,'images.json'));await symlink(join(root,'deployment-files.tar'),join(root,'images.json'));await expect(verifyReleaseFiles(root)).rejects.toThrow('INVALID_RELEASE_ASSET');
 }finally{await rm(root,{recursive:true,force:true});}
});

it('audits earlier image layers and decoded history even when later layers delete the material',()=>{
 const program=`import importlib.util,io,json,tarfile,tempfile,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('audit','scripts/audit-image-archive.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
def tar(entries):
 result=io.BytesIO()
 with tarfile.open(fileobj=result,mode='w') as archive:
  for name,data in entries.items():
   info=tarfile.TarInfo(name);info.size=len(data);archive.addfile(info,io.BytesIO(data))
 return result.getvalue()
def image(path,layers,history=''):
 names=[hashlib.sha256(v).hexdigest()+'/layer.tar' for v in layers]
 config=json.dumps({'rootfs':{'diff_ids':['sha256:'+hashlib.sha256(v).hexdigest() for v in layers]},'history':[{'created_by':history}]}).encode();name=hashlib.sha256(config).hexdigest()+'.json'
 entries={name:config,'manifest.json':json.dumps([{'Config':name,'Layers':names}]).encode()};entries.update(dict(zip(names,layers)));path.write_bytes(tar(entries))
with tempfile.TemporaryDirectory() as directory:
 path=Path(directory)/'image.tar';secret=b'unit-only-protected-marker-1234567890'
 image(path,[tar({'app/readme':b'public source'})]);assert module.audit_archive(path,[secret])['status']=='PASS'
 image(path,[tar({'app/input':secret}),tar({'app/.wh.input':b''})]);result=module.audit_archive(path,[secret]);assert result['status']=='BLOCKED' and result['findingCount']==1 and result['findings'][0]['kind']=='known-protected-input'
 image(path,[tar({'app/readme':b'public source'})],secret.decode());assert module.audit_archive(path,[secret])['status']=='BLOCKED'
 pem=b'-----BEGIN PRIVATE KEY-----\\n'+b'A'*88+b'\\n-----END PRIVATE KEY-----\\n'
 image(path,[tar({'app/key':pem})]);assert module.audit_archive(path)['findings'][0]['kind']=='private-key-material'
`;
 expect(()=>execFileSync('python3',['-c',program],{stdio:'pipe'})).not.toThrow();
});

it('keeps packaged links local and pins omitted source references without changing executable examples',async()=>{
 const {pinReleaseDocumentation}=await import('../../scripts/release-documentation.js'),sha='a'.repeat(40),included=new Set(['docs/RUNBOOK.md']),tracked=new Set(['docs/RUNBOOK.md','docs/guide/README.md','artifacts/proof.json']);
 const input='[local](RUNBOOK.md#prepare) [guide](guide/README.md) [proof](../artifacts/proof.json)\n```bash\n[example](../not-a-link)\n```\n`[literal](../not-a-link)`';
 const result=pinReleaseDocumentation(input,'docs/LOCAL-VALIDATION.md',sha,included,tracked);
 expect(result).toContain('[local](RUNBOOK.md#prepare)');expect(result).toContain('https://github.com/0u-Y/CallSign/blob/'+sha+'/docs/guide/README.md');expect(result).toContain('https://github.com/0u-Y/CallSign/blob/'+sha+'/artifacts/proof.json');expect(result).toContain('```bash\n[example](../not-a-link)\n```');expect(result).toContain('`[literal](../not-a-link)`');
 expect(()=>pinReleaseDocumentation('[outside](../../secret)','docs/RUNBOOK.md',sha,included,tracked)).toThrow('OUTSIDE_REPOSITORY');expect(()=>pinReleaseDocumentation('[missing](missing.md)','docs/RUNBOOK.md',sha,included,tracked)).toThrow('TARGET_MISSING');
});
