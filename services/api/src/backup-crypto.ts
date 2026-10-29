import { createCipheriv,createDecipheriv,createHash,createHmac,hkdfSync,timingSafeEqual,randomBytes } from 'node:crypto';
import { canonicalBytes } from '@callsign/protocol';
import { open } from 'node:fs/promises';
import { createReadStream,createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
const magic=Buffer.from('CSBACKUP1');
export async function encryptBackup(input:NodeJS.ReadableStream,key:Buffer,path:string){
 if(key.length!==32)throw new Error('BACKUP_KEY_INVALID');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),output=createWriteStream(path,{flags:'wx',mode:0o600});output.write(Buffer.concat([magic,iv]));await pipeline(input,cipher,output);return cipher.getAuthTag();
}
export async function decryptBackup(input:string,key:Buffer,tag:Buffer,output:string){
 if(key.length!==32||tag.length!==16)throw new Error('BACKUP_KEY_OR_TAG_INVALID');const handle=await open(input,'r'),header=Buffer.alloc(21);try{const r=await handle.read(header,0,21,0);if(r.bytesRead!==21||!header.subarray(0,9).equals(magic))throw new Error('BACKUP_HEADER_INVALID');}finally{await handle.close();}
 const cipher=createDecipheriv('aes-256-gcm',key,header.subarray(9));cipher.setAuthTag(tag);await pipeline(createReadStream(input,{start:21}),cipher,createWriteStream(output,{flags:'wx',mode:0o600}));
}
export async function hashFile(path:string){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
export function backupManifestMac(manifest:unknown,key:Buffer){if(key.length!==32)throw new Error('BACKUP_KEY_INVALID');const derived=hkdfSync('sha256',key,Buffer.alloc(0),Buffer.from('CallSign backup manifest authentication v1'),32);return createHmac('sha256',Buffer.from(derived)).update(canonicalBytes(manifest)).digest('hex');}
export function verifyBackupManifest(input:unknown,key:Buffer){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('BACKUP_MANIFEST_INVALID');
 const {authentication,...manifest}=input as Record<string,unknown>;
 if(typeof authentication!=='string'||!/^[0-9a-f]{64}$/.test(authentication)||!timingSafeEqual(Buffer.from(authentication,'hex'),Buffer.from(backupManifestMac(manifest,key),'hex')))throw new Error('BACKUP_MANIFEST_AUTHENTICATION_REQUIRED');
 return manifest;
}
export function validateArchiveListing(names:string,verbose:string){
 const entries=names.trim().split('\n'),types=verbose.trim().split('\n');
 if(!names.trim()||entries.length>10000||entries.length!==types.length||entries.some(n=>!n||n.startsWith('/')||n.split('/').includes('..')||/[\x00-\x1f]/.test(n))||types.some(line=>!/^[-d]/.test(line)))throw new Error('ARCHIVE_PATH_OR_TYPE_INVALID');
}
