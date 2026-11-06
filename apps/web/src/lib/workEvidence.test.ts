import {it,expect} from 'vitest';
import type {Workspace} from './serviceWorkspace.js';
import {workEvidence} from './workEvidence.js';
const intent={id:'work',agentId:'agent',recipientId:'recipient',status:'open',serviceDid:'center',expiresAt:9999999999};
const w={intents:[intent],attempts:[],authorizations:[],credentials:[{digest:'old',state:'revoked',vc:{credentialSubject:{id:'center'}}},{digest:'candidate',state:'registered',vc:{credentialSubject:{id:'center'}}}]} as unknown as Workspace;
it('separates registered candidates, past revocation and unverified current authority',()=>{
 const e=workEvidence(w,intent);expect(e.candidates.map(c=>c.digest)).toEqual(['candidate']);expect(e.historical.map(c=>c.digest)).toEqual(['old']);expect(e.delegation).toContain('미확인');expect(e.authorization).toBe('개별 승인 전');expect(e.call).toBe('연결 전');
});
it('does not turn attempt counts or accepted state into live media proof',()=>{
 expect(workEvidence({...w,attempts:[{id:'a',intentId:'work',status:'accepted'}]},intent).call).toBe('연결 상태 확인 필요');
 expect(workEvidence({...w,attempts:[{id:'a',intentId:'work',status:'ended'}]},intent).call).toBe('종료 기록 있음');
});
it('preserves history while denying new contact for cancelled or expired work',()=>{
 expect(workEvidence(w,{...intent,status:'cancelled'}).permission).toContain('새 연락 불가');expect(workEvidence(w,{...intent,expiresAt:1}).permission).toContain('만료');
});
