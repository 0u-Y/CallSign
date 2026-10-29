import { expect,it } from 'vitest';
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { encryptBackup,decryptBackup,backupManifestMac,verifyBackupManifest,validateArchiveListing } from '../../services/api/src/backup-crypto.js';
it('authenticates encrypted backup bytes and refuses wrong keys, tampered data and overwritten targets',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'callsign-backup-unit-')),key=Buffer.alloc(32,1),path=join(directory,'backup.enc');
 try{const tag=await encryptBackup(Readable.from(['test configuration; no real key or database']),key,path);await decryptBackup(path,key,tag,join(directory,'plain'));expect((await readFile(join(directory,'plain'))).toString()).toContain('test configuration');
 await expect(decryptBackup(path,Buffer.alloc(32,2),tag,join(directory,'wrong-key'))).rejects.toThrow();
 await expect(decryptBackup(path,key,tag,join(directory,'plain'))).rejects.toThrow();
 const bytes=await readFile(path);bytes[22]=bytes[22]!^1;await writeFile(join(directory,'tampered'),bytes);await expect(decryptBackup(join(directory,'tampered'),key,tag,join(directory,'bad-data'))).rejects.toThrow();
 }finally{await rm(directory,{recursive:true,force:true});}
});
it('authenticates backup checkpoint and file inventory, and rejects archive links before extraction',()=>{
 const key=Buffer.alloc(32,7),manifest={format:1,checkpoint:{epoch:'3',sequence:'9'},files:{'database.dump.enc':'a'.repeat(64)}};
 const signed={...manifest,authentication:backupManifestMac(manifest,key)};expect(verifyBackupManifest(signed,key)).toEqual(manifest);
 expect(()=>verifyBackupManifest({...signed,checkpoint:{epoch:'1',sequence:'0'}},key)).toThrow('BACKUP_MANIFEST_AUTHENTICATION_REQUIRED');expect(()=>verifyBackupManifest(manifest,key)).toThrow('BACKUP_MANIFEST_AUTHENTICATION_REQUIRED');expect(()=>verifyBackupManifest(signed,Buffer.alloc(32,8))).toThrow();
 expect(()=>validateArchiveListing('issuer/\nissuer/key.json\n','drwx------ owner issuer/\n-rw------- owner issuer/key.json\n')).not.toThrow();
 expect(()=>validateArchiveListing('issuer/key.json\n','lrwx------ owner issuer/key.json -> /etc/passwd\n')).toThrow('ARCHIVE_PATH_OR_TYPE_INVALID');expect(()=>validateArchiveListing('../outside\n','-rw------- owner ../outside\n')).toThrow();
});
