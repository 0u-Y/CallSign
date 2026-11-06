export {nextTranscript} from '../lib/transcript.js';
import {RISK_CRITERIA,serviceAnalysisEventSchema,type TranscriptRevision,type ServiceAnalysisEvent} from '@callsign/protocol';
export function nextAnalysis(previous:ServiceAnalysisEvent|undefined,value:unknown){
 const event=serviceAnalysisEventSchema.parse(value);
 if(previous&&event.streamId===previous.streamId&&(event.contextRevision<previous.contextRevision||event.eventSequence<=previous.eventSequence))return previous;
 return event;
}
export function ServiceAnalysisPanel({event,compact=false}:{event?:ServiceAnalysisEvent|undefined;compact?:boolean}){
 const state=!event?'아직 분석 전입니다. 동의와 제공자 상태를 확인하세요.':event.status==='withdrawn'?'분석 철회 또는 종료':event.status==='partial'||event.status==='analyzing'?'분석 중':event.status==='unavailable'?'분석 실패 또는 제공자 미설정 · 아래 규칙 결과와 구분하세요.':'분석 완료';
 const current=event?.analyzerVersion==='risk-context-2'?event:undefined;
 const assessment=(a:NonNullable<typeof current>['assessments'][number])=><article key={a.source+a.code}><strong>{({OTP:'인증 비밀 요구',TRANSFER:'자금 이체 요구',REMOTE_CONTROL:'원격제어 요구',SECRECY:'독립 확인 차단'} as const)[a.code]}</strong> · {a.source==='rules'?'규칙':'AI'} · {a.result==='detected'?'요구 탐지':a.result==='not-detected'?'현재 분석 구간에서 미탐지':'판단 불가'}
 {a.evaluatedContextRevision!==undefined&&a.evaluatedContextRevision!==current?.contextRevision&&<p>이전 문맥에서 확인한 요구 · 근거 전사는 유지 중이며 최신 분석 완료를 뜻하지 않습니다.</p>}<p>{a.explanation}</p>{a.evidence.map((e,i)=><div key={e.segmentId+':'+e.revision+':'+i}><q>{e.quote}</q>{e.state==='withdrawn'&&<p>요구 발생 후 명시적 철회 발언 확인 · 과거 요구가 없었던 것은 아닙니다.<br/><q>{e.withdrawal?.quote}</q></p>}</div>)}
 <details><summary>적용 기준·근거 정보</summary><p>{a.code}: {RISK_CRITERIA[a.code]}</p>{a.evidence.map((e,i)=><small key={i}>{e.segmentId} · 전사 수정 {e.revision} </small>)}</details></article>;
 const detected=current?.assessments.filter(a=>a.result==='detected')??[];
 const other=current?.assessments.filter(a=>a.result!=='detected')??[];
 return <section className={"service-analysis"+(event?.signals.length?' has-warning':'')}><h2>위험 요구 분석</h2><p role="status">{state}</p>
 {event&&!current&&<p>이전 분석 형식입니다. 현재 네 가지 위험 요구 분석 결과로 해석하지 마세요.</p>}
 {detected.map(assessment)}
 {other.length>0&&<details className="analysis-other-results"><summary>미탐지·판단 불가 결과 {other.length}건{other.some(a=>a.result==='undetermined')?' · 판단 불가 포함':''}</summary>{other.map(assessment)}</details>}
 {(!compact||event)&&<p>최근 상대 발화의 네 가지 요구만 분석합니다. 미탐지는 통화 안전 보장이 아닙니다. 목적 이탈은 분석하지 않으며 기관의 연락 승인과 별개입니다. 규칙과 AI는 독립 결과이며 합의를 뜻하지 않습니다.</p>}
 {current&&<small>정책 {current.policyVersion} · 문맥 수정 {current.contextRevision}</small>}
 {(!compact||event)&&<p className="service-safety-action">민감한 요구는 수행하지 말고 <a href="/official">별도 인증한 공식 업무 화면</a>에서 확인하세요.</p>}</section>;
}

export function ServiceTranscript({segments}:{segments:TranscriptRevision[]}){
 const render=(s:TranscriptRevision)=><p key={s.segmentId}><span>{s.final?'확정':'인식 중'}</span>{s.text||'발화 내용 없음'}</p>;
 return <section className="demo-transcript" aria-label="상대 음성 전사"><h2>실시간 전사</h2>{segments.length?<>{segments.slice(-3).map(render)}{segments.length>3&&<details><summary>이전 전사 {segments.length-3}개</summary>{segments.slice(0,-3).map(render)}</details>}</>:<p>수신자의 분석 동의 후 상대 음성을 표시합니다.</p>}</section>;
}
