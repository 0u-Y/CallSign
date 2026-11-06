import {expect,it} from 'vitest';
import {contactChoices,contactPreparation} from '../../apps/web/src/lib/contactPreparation.js';
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
it('rejects an open work item whose deadline has passed before preparing an attempt',()=>{
 const w=workspace();w.intents[0]!.expiresAt=Math.floor(Date.now()/1000)-1;
 expect(()=>contactPreparation(w,'work','','')).toThrow('유효기간');
});
it('never substitutes another work or a terminated attempt for an explicit selection',()=>{const w=workspace();w.attempts=[{id:'old',intentId:'work',status:'ended'},{id:'foreign',intentId:'elsewhere',status:'authorized'},{id:'current',intentId:'work',status:'authorized'}];expect(()=>contactPreparation(w,'work','foreign','one')).toThrow('활성 시도');expect(()=>contactPreparation(w,'work','old','one')).toThrow('활성 시도');expect(contactPreparation(w,'work','current','one').attempt?.id).toBe('current');});
it('does not reuse an expired first-connection authorization',()=>{const w=workspace();w.attempts=[{id:'expired',intentId:'work',status:'authorized',firstConnectBy:1}];expect(()=>contactPreparation(w,'work','expired','one')).toThrow('활성 시도');expect(contactPreparation(w,'work','','one').attempt).toBeUndefined();});

it('separates current work attempts and delegation candidates from history',()=>{const w=workspace();w.attempts=[{id:'active',intentId:'work',status:'created'},{id:'ended',intentId:'work',status:'ended'},{id:'expired',intentId:'work',status:'accepted',callEndBy:10},{id:'foreign',intentId:'other',status:'created'}];w.credentials.push({digest:'revoked',state:'revoked',vc:{credentialSubject:{id:'service'}}},{digest:'foreign',state:'registered',vc:{credentialSubject:{id:'other'}}});const c=contactChoices(w,'work',20);expect(c.attempts.map(a=>a.id)).toEqual(['active']);expect(c.history.map(a=>a.id)).toEqual(['ended','expired']);expect(c.credentials.map(x=>x.digest)).toEqual(['one','revoked']);});

it('does not silently replace a revoked explicit delegation with another registered candidate',()=>{const w=workspace();w.credentials.push({digest:'revoked',state:'revoked',vc:{credentialSubject:{id:'service'}}});expect(()=>contactPreparation(w,'work','','revoked')).toThrow('선택 위임');expect(contactPreparation(w,'work','','').credential?.digest).toBe('one');});
