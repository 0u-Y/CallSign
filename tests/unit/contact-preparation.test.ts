import {expect,it} from 'vitest';
import {contactPreparation} from '../../apps/web/src/lib/contactPreparation.js';
import type {Workspace} from '../../apps/web/src/lib/serviceWorkspace.js';
const workspace=()=>({actor:{role:'gateway',userId:'agent',institutionId:'bank'},intents:[{id:'work',status:'open',agentId:'agent',recipientId:'recipient',serviceDid:'service'}],attempts:[],credentials:[{digest:'one',state:'registered',vc:{credentialSubject:{id:'service'}}}]} as unknown as Workspace);
it('selects the sole matching registered credential without treating authorization as connection',()=>{
 const w=workspace();w.credentials.push({digest:'other',state:'registered',vc:{credentialSubject:{id:'other-service'}}});
 expect(contactPreparation(w,'work','','').credential?.digest).toBe('one');expect(contactPreparation(w,'work','','').attempt).toBeUndefined();
});
it('requires explicit choice for ambiguous credentials and attempts',()=>{
 const w=workspace();w.credentials.push({...w.credentials[0]!,digest:'two'});
 expect(()=>contactPreparation(w,'work','','')).toThrow('여러 개');
 w.attempts=[{id:'a',intentId:'work',status:'created'},{id:'b',intentId:'work',status:'authorized'}];
 expect(()=>contactPreparation(w,'work','','one')).toThrow('여러 개');
 expect(contactPreparation(w,'work','b','two').attempt?.id).toBe('b');
});
it('rejects cancelled or reassigned work and requires an approved attempt for recipients',()=>{
 const w=workspace();w.intents[0]!.status='cancelled';expect(()=>contactPreparation(w,'work','','')).toThrow('취소');
 w.intents[0]!.status='open';w.actor.userId='other';expect(()=>contactPreparation(w,'work','','')).toThrow('본인');
 w.actor={role:'recipient',userId:'recipient',institutionId:'bank'};expect(()=>contactPreparation(w,'work','','')).toThrow('승인');
 w.attempts=[{id:'a',intentId:'work',status:'authorized'}];w.credentials=[];
 expect(contactPreparation(w,'work','','').attempt?.id).toBe('a');
});
