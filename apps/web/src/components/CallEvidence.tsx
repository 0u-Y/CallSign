import {useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import type {CallContext} from '../lib/serviceCall.js';
export function CallEvidence({attemptId}:{attemptId:string}){
 const [snapshot,setSnapshot]=useState<{value:CallContext;at:number}>(),[error,setError]=useState('');
 useEffect(()=>{const abort=new AbortController();void api<CallContext>(`/v3/call-context?attemptId=${encodeURIComponent(attemptId)}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(5000)])}).then(value=>{if(!abort.signal.aborted)setSnapshot({value,at:Date.now()});}).catch(()=>{if(!abort.signal.aborted)setError('연락 근거 조회 실패 · 이전 성공으로 대신하지 않습니다.');});return()=>abort.abort();},[attemptId]);
 if(!snapshot)return <p role="status">{error||'선택 통화의 서버 근거 조회 중'}</p>;
 const c=snapshot.value;
 return <section><h3>선택 통화의 서버 기록</h3><p>조회 {new Date(snapshot.at).toLocaleTimeString('ko-KR')}의 기록입니다. 현재 유효성 검증은 통화 controller가 계속 수행합니다.</p><dl><dt>시도</dt><dd>{c.attempt.id}</dd><dt>일회 소비 영수증</dt><dd>{c.receipt?'서버 기록 있음':'미관측'}</dd><dt>실제 연결 binding</dt><dd>{c.attempt.binding?'서버 기록 있음':'미관측'}</dd><dt>통화 유지 허가 Lease</dt><dd>{c.attempt.lease?'서버 기록 있음 · 만료·세대는 원문 참조':'미관측'}</dd></dl><details><summary>승인·binding·영수증·Lease 원문</summary><pre>{JSON.stringify({authorization:c.authorization,binding:c.attempt.binding,receipt:c.receipt,lease:c.attempt.lease},null,2)}</pre></details></section>;
}
