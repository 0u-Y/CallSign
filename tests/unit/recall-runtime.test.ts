import {expect,it,vi} from 'vitest';
import {serviceFixture} from './service-fixture.js';
import {PbxRuntime} from '../../services/api/src/pbx-runtime.js';
import type {AsteriskBridge} from '../../services/api/src/asterisk.js';
import {recallSnapshot} from '../../services/api/src/recall-status.js';
it('persists retry versus PBX absence and cannot revive a terminal call with duplicate or late events',async()=>{
 const f=await serviceFixture();await f.store.transact(f.institution.institutionId,async r=>{const t=r.serviceV3!.attempts[f.attempt.id]!;t.status='cancelled';t.pbx={bridgeId:'b',senderChannelId:'s',recipientChannelId:'r',senderEndpoint:'cs-s',recipientEndpoint:'cs-r',state:'bridged',reports:{},credentials:{}};f.authority.event(r,f.institution,'call.cleanup',t.id);});
 const destroy=vi.fn().mockRejectedValueOnce(new Error('controlled ARI failure')).mockResolvedValue(undefined),remove=vi.fn(async()=>{});
 const runtime=new PbxRuntime({authority:f.authority,institutionId:f.institution.institutionId,bridge:{ari:{destroy}} as unknown as AsteriskBridge,endpoints:{remove},sessionsAlive:async()=>true});runtime.ready=true;
 try{await runtime.tick();let state=recallSnapshot(await f.store.read(f.institution.institutionId),f.institution,f.authority.now());expect(state.attempts[0]?.media).toBe('retry');expect(remove).not.toHaveBeenCalled();await runtime.tick();state=recallSnapshot(await f.store.read(f.institution.institutionId),f.institution,f.authority.now());expect(state.attempts[0]?.media).toBe('pbx-absent');expect(state.attempts[0]?.audioInterruption).toBe('not-observed');await runtime.event({type:'ChannelDestroyed',channel:{id:'s'}});await runtime.event({type:'StasisEnd',channel:{id:'r'}});expect((await f.store.read(f.institution.institutionId)).serviceV3!.attempts[f.attempt.id]!.status).toBe('cancelled');expect(destroy).toHaveBeenCalledTimes(2);}finally{runtime.close();}
});
it('limits operational rows and rejects a record from another institution even if a storage adapter returns it',async()=>{const f=await serviceFixture(),record=await f.store.read(f.institution.institutionId),original=record.serviceV3!.attempts[f.attempt.id]!;for(let n=0;n<110;n++)record.serviceV3!.attempts['copy-'+n]={...original,id:'copy-'+n};const snapshot=recallSnapshot(record,f.institution,f.authority.now());expect(snapshot.attempts).toHaveLength(100);expect(snapshot.truncated).toBe(true);expect(()=>recallSnapshot(record,{...f.institution,institutionId:'other'},f.authority.now())).toThrow('OBJECT_FORBIDDEN');});
it('distinguishes ledger receipt confirmation from server terminal and retry observations using durable records',async()=>{
 const f=await serviceFixture(),record=await f.store.read(f.institution.institutionId);record.audit=[];
 const audit=[{id:'revoke',event:'credential.revoke',objectId:f.vc.digest,at:f.authority.now(),actor:'not-returned'}];
 const jobs=[{id:'revoke',kind:'credential.revoke',objectId:f.vc.digest,status:'processing',attempts:1,error:null,receiptBlock:null}];
 let view=recallSnapshot(record,f.institution,f.authority.now(),undefined,{audit,jobs});expect(view.consistentRead).toBe(true);expect(view.changes[0]?.ledger).toBe('pending');
 jobs[0]!.status='done';view=recallSnapshot(record,f.institution,f.authority.now(),undefined,{audit,jobs});expect(view.changes[0]?.ledger).toBe('pending');
 const confirmed={...jobs[0]!,receiptBlock:'42'};view=recallSnapshot(record,f.institution,f.authority.now(),undefined,{audit,jobs:[confirmed]});expect(view.changes[0]?.ledger).toBe('confirmed');expect(view.attempts[0]?.audioInterruption).toBe('not-observed');expect(JSON.stringify(view)).not.toContain('not-returned');
});
it('includes operational indexes in the guarded migration plan without changing old migration sources',async()=>{
 const {readFile}=await import('node:fs/promises');const migration=await readFile('services/api/drizzle/0010_operation_lookup_indexes.sql','utf8'),runner=await readFile('scripts/migrate-finals.ts','utf8');expect(runner).toContain('0010_operation_lookup_indexes');expect(migration).toContain('institution_id, recorded_at DESC');expect(migration).toContain('institution_id, created_at DESC');expect(migration).not.toMatch(/DELETE|DROP|TRUNCATE|GRANT/);
});
