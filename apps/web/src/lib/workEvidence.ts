import type {Workspace} from './serviceWorkspace.js';
import {contactWorkState} from './workPresentation.js';

// Workspace is a read model, not a fresh signature/lease verification result.
export function workEvidence(w:Workspace,intent:Workspace['intents'][number]){
 const attempts=w.attempts.filter(a=>a.intentId===intent.id),ids=new Set(attempts.map(a=>a.id));
 const credentials=w.credentials.filter(c=>c.vc.credentialSubject.id===intent.serviceDid);
 const candidates=credentials.filter(c=>c.state==='registered');
 const historical=credentials.filter(c=>c.state!=='registered');
 const authorizations=w.authorizations?.filter(a=>ids.has(a.attemptId));
 const state=contactWorkState(intent);
 const terminal=new Set(['ended','cancelled','failed','declined','no-answer']);
 return {candidates,historical,attempts,authorizations,
  permission:state==='cancelled'?'취소 · 새 연락 불가':state==='expired'?'만료 · 새 연락 불가':state==='completed'?'완료 · 새 연락 불가':'발신 전 권한 확인',
  delegation:candidates.length?`현재 유효성 미확인 · 등록 후보 ${candidates.length}개`:'현재 위임 미확인',
  delegationReason:'목록 응답에는 위임 만료·서명·현재 정책과 기관 상태 검증이 없습니다. 발신 준비에서 확인합니다.',
  authorization:authorizations===undefined?'승인 기록 미조회':authorizations.length?`발급 기록 ${authorizations.length}건 · 현재 유효성 별도 확인`:'개별 승인 전',
  call:!attempts.length?'연결 전':attempts.every(a=>terminal.has(a.status))?'종료 기록 있음':'연결 상태 확인 필요',
 };
}
