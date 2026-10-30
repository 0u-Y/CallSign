import type postgres from 'postgres';
// Shared transaction locks cover the external CAS as well as SQL commit on every replica.
export const backupLock = 1129534291;
export async function enterBackupWrite(tx:postgres.TransactionSql,safety=false){
 const lock=await tx`SELECT pg_try_advisory_xact_lock_shared(${backupLock}) AS acquired`;
 if(!lock[0]?.acquired)throw Object.assign(new Error('BACKUP_SNAPSHOT_BUSY_RETRY'),{statusCode:503,code:'BACKUP_SNAPSHOT_BUSY_RETRY'});
 const row=(await tx`SELECT phase FROM issuer_v2.backup_control WHERE singleton`)[0];
 if(!row||row.phase==='fenced'||(row.phase==='draining'&&!safety))throw Object.assign(new Error('BACKUP_WRITES_DRAINING'),{statusCode:503,code:'BACKUP_WRITES_DRAINING'});
}
