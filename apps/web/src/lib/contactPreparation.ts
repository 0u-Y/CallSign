import {contactWorkState} from './workPresentation.js';
import type {Workspace} from './serviceWorkspace.js';
export function contactChoices(w:Workspace,intentId:string,now=Math.floor(Date.now()/1000)){
 const intent=w.intents.find(i=>i.id===intentId);
 const related=w.attempts.filter(a=>a.intentId===intentId);
 const usable=(a:Workspace['attempts'][number])=>['created','authorized','consumed','accepted'].includes(a.status)&&(!a.callEndBy||a.callEndBy>now)&&(!a.firstConnectBy||a.status==='accepted'||a.firstConnectBy>now);
 return {credentials:w.credentials.filter(c=>intent&&c.vc.credentialSubject.id===intent.serviceDid),attempts:related.filter(usable),history:related.filter(a=>!usable(a))};
}
export function contactPreparation(w:Workspace,intentId:string,attemptId:string,digest:string){
 const intent=w.intents.find(i=>i.id===intentId);
 if(!intent||intent.status!=='open')throw new Error('진행 중인 업무를 선택하세요. 취소된 업무로 연락할 수 없습니다.');
 if(contactWorkState(intent)==='expired')throw new Error('업무 유효기간이 만료됐습니다. 기관 담당자가 새 업무를 생성·배정한 뒤 다시 선택하세요.');
 if(!['gateway','recipient'].includes(w.actor.role)||(w.actor.role==='gateway'?intent.agentId:intent.recipientId)!==w.actor.userId)throw new Error('본인에게 배정된 연락만 준비할 수 있습니다.');
 const choices=contactChoices(w,intent.id),candidates=choices.attempts;
 if(attemptId&&!candidates.some(a=>a.id===attemptId))throw new Error('선택한 통화는 현재 업무의 활성 시도가 아닙니다. 새로 선택하세요.');
 const attempt=candidates.find(a=>a.id===attemptId)??(candidates.length===1?candidates[0]:undefined);
 if(candidates.length>1&&!attempt)throw new Error('진행 중인 통화 시도가 여러 개입니다. 연결 준비 상세에서 선택하세요.');
 if(w.actor.role==='recipient'&&(!attempt||attempt.status==='created'))throw new Error('상담원의 연락 승인을 기다린 뒤 다시 준비하세요.');
 const credentials=choices.credentials.filter(c=>c.state==='registered');
 const credential=credentials.find(c=>c.digest===digest)??(credentials.length===1?credentials[0]:undefined);
 if(w.actor.role==='gateway'&&!credential)throw new Error(credentials.length?'위임이 여러 개입니다. 연결 준비 상세에서 사용할 위임을 선택하세요.':'등록된 위임이 없습니다. 기관 담당자에게 위임 상태를 확인하세요.');
 return {intent,attempt,credential};
}
