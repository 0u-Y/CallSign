import type {Workspace} from './serviceWorkspace.js';
export function contactPreparation(w:Workspace,intentId:string,attemptId:string,digest:string){
 const intent=w.intents.find(i=>i.id===intentId);
 if(!intent||intent.status!=='open')throw new Error('진행 중인 업무를 선택하세요. 취소된 업무로 연락할 수 없습니다.');
 if(!['gateway','recipient'].includes(w.actor.role)||(w.actor.role==='gateway'?intent.agentId:intent.recipientId)!==w.actor.userId)throw new Error('본인에게 배정된 연락만 준비할 수 있습니다.');
 const candidates=w.attempts.filter(a=>a.intentId===intent.id&&['created','authorized','consumed','accepted'].includes(a.status));
 const attempt=candidates.find(a=>a.id===attemptId)??(candidates.length===1?candidates[0]:undefined);
 if(candidates.length>1&&!attempt)throw new Error('진행 중인 통화 시도가 여러 개입니다. 연결 준비 상세에서 선택하세요.');
 if(w.actor.role==='recipient'&&(!attempt||attempt.status==='created'))throw new Error('상담원의 연락 승인을 기다린 뒤 다시 준비하세요.');
 const credentials=w.credentials.filter(c=>c.state==='registered'&&c.vc.credentialSubject.id===intent.serviceDid);
 const credential=credentials.find(c=>c.digest===digest)??(credentials.length===1?credentials[0]:undefined);
 if(w.actor.role==='gateway'&&!credential)throw new Error(credentials.length?'위임이 여러 개입니다. 연결 준비 상세에서 사용할 위임을 선택하세요.':'등록된 위임이 없습니다. 기관 담당자에게 위임 상태를 확인하세요.');
 return {intent,attempt,credential};
}
