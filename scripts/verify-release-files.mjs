// Offline verification only. Download into a NEW directory before invoking this script.
import {readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const publicReleaseFiles=['deployment-files.tar','observer-tests.tar','images.json','publication-audit.json'];
export async function verifyReleaseFiles(directory){
 const root=resolve(directory),checksum=resolve(root,'SHA256SUMS'),info=await lstat(checksum);
 if(!info.isFile()||info.isSymbolicLink()||info.size>4096)throw new Error('INVALID_RELEASE_CHECKSUM_FILE');
 const rows=(await readFile(checksum,'utf8')).trim().split('\n'),expected=new Map();
 for(const row of rows){const match=/^([0-9a-f]{64})  ([a-z0-9.-]+)$/.exec(row);if(!match||!publicReleaseFiles.includes(match[2])||expected.has(match[2]))throw new Error('INVALID_RELEASE_CHECKSUM_ENTRY');expected.set(match[2],match[1]);}
 if(expected.size!==publicReleaseFiles.length)throw new Error('INCOMPLETE_RELEASE_CHECKSUMS');
 const files=[];
 for(const name of publicReleaseFiles){
  const path=resolve(root,name),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>10*1024*1024)throw new Error('INVALID_RELEASE_ASSET');
  const sha256=createHash('sha256').update(await readFile(path)).digest('hex');if(sha256!==expected.get(name))throw new Error('RELEASE_CHECKSUM_MISMATCH');files.push({name,bytes:stat.size,sha256});
 }
 return {status:'PASS',scope:'local bytes/checksums only; not proof of a network download, image publication or AWS deployment',files};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length!==3)throw new Error('Usage: node scripts/verify-release-files.mjs NEW_DOWNLOAD_DIRECTORY');
 const result=await verifyReleaseFiles(process.argv[2]);process.stdout.write(JSON.stringify(result)+'\n');
}
