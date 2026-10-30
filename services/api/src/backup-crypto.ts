import { createCipheriv,createDecipheriv,createHash,createHmac,hkdfSync,timingSafeEqual,randomBytes } from 'node:crypto';
import { canonicalBytes } from '@callsign/protocol';
import { open,lstat,rm } from 'node:fs/promises';
import {z} from 'zod';
import { createReadStream,createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
const magic=Buffer.from('CSBACKUP1');
export async function encryptBackup(input:NodeJS.ReadableStream,key:Buffer,path:string){
 if(key.length!==32)throw new Error('BACKUP_KEY_INVALID');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),output=createWriteStream(path,{flags:'wx',mode:0o600});output.write(Buffer.concat([magic,iv]));await pipeline(input,cipher,output);return cipher.getAuthTag();
}
export async function decryptBackup(input:string,key:Buffer,tag:Buffer,output:string){
 if(key.length!==32||tag.length!==16)throw new Error('BACKUP_KEY_OR_TAG_INVALID');const handle=await open(input,'r'),header=Buffer.alloc(21);try{const r=await handle.read(header,0,21,0);if(r.bytesRead!==21||!header.subarray(0,9).equals(magic))throw new Error('BACKUP_HEADER_INVALID');}finally{await handle.close();}
 const cipher=createDecipheriv('aes-256-gcm',key,header.subarray(9));cipher.setAuthTag(tag);let created=false;const target=createWriteStream(output,{flags:'wx',mode:0o600});target.once('open',()=>{created=true;});try{await pipeline(createReadStream(input,{start:21}),cipher,target);}catch(error){if(created)await rm(output,{force:true});throw error;}
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

export const backupPayloads=(scope:'full'|'application')=>['database.dump.enc','configuration.tar.enc','deployment.env.enc',...(scope==='full'?['chain.snapshot.enc']:[])];
export async function regularBackupFile(path:string,maxBytes=68719476736){const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>maxBytes)throw new Error('BACKUP_REGULAR_FILE_REQUIRED');return info;}
export function backupInventory(input:unknown){
 const m=z.object({format:z.literal(1),scope:z.enum(['full','application']),createdAt:z.string().datetime(),checkpoint:z.unknown(),files:z.record(z.string(),z.string().regex(/^[a-f0-9]{64}$/)),sizes:z.record(z.string(),z.number().int().nonnegative().max(68719476736)),migrations:z.record(z.string().regex(/^\d{4}_[a-z_]+$/),z.string().regex(/^[a-f0-9]{64}$/))}).strict().parse(input);
 const expected=backupPayloads(m.scope).flatMap(name=>[name,`${name}.tag`]).sort();
 if(JSON.stringify(Object.keys(m.files).sort())!==JSON.stringify(expected)||JSON.stringify(Object.keys(m.sizes).sort())!==JSON.stringify(expected)||!Object.keys(m.migrations).length)throw new Error('BACKUP_INVENTORY_INCOMPLETE');return m;
}
