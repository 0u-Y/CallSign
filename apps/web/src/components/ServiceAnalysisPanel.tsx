export {nextTranscript} from '../lib/transcript.js';
import {serviceAnalysisEventSchema,type TranscriptRevision,type ServiceAnalysisEvent} from '@callsign/protocol';
export function nextAnalysis(previous:ServiceAnalysisEvent|undefined,value:unknown){
 const event=serviceAnalysisEventSchema.parse(value);
 if(previous&&event.streamId===previous.streamId&&(event.contextRevision<previous.contextRevision||event.eventSequence<=previous.eventSequence))return previous;
 return event;
}
export function ServiceAnalysisPanel({event}:{event?:ServiceAnalysisEvent|undefined}){
 const state=!event?'아직 표시할 분석 결과가 없습니다. 실행 상태는 음성 분석 항목을 확인하세요.':event.status==='withdrawn'?'분석 중단':event.status==='partial'||event.status==='analyzing'?'분석 중':event.status==='unavailable'?'목적 분석 불가 · 규칙 근거는 별도 표시':'현재 분석 범위의 결과';
 const relation=event?.purpose.relation;
 return <section className={"service-analysis"+((event?.signals.length||event?.purpose.relation==='suspected')?' has-warning':'')}><h2>위험 요구·승인 목적 안내</h2><p>{state}</p><div role="status" aria-live="polite" aria-atomic="true">{event&&(event.signals.length>0||relation==='suspected')?'위험 근거 또는 승인 목적 이탈 의심이 있습니다. 아래 발언과 공식 경로를 확인하세요.':''}</div><p>승인 목적: 이상거래 확인. AI는 통화를 제어하거나 통화 전체의 안전을 판정하지 않습니다.</p>
 {event?.signals.map((s,n)=><p key={s.category+n}><strong>{s.category}</strong> · <q>{s.evidenceSpan}</q> · {s.explanation}</p>)}
 {event&&<><p>{relation==='suspected'?'승인 목적 이탈 의심':relation==='not-detected'?'분석 범위에서 목적 이탈 근거 미탐지 · 안전 판정 아님':'목적 관계 판단 불가'}</p>{event.purpose.evidenceSpan&&<p><q>{event.purpose.evidenceSpan}</q></p>}<p>{event.purpose.reason}</p><small>정책 {event.policyVersion} · 문맥 수정 {event.contextRevision} · 최근 상대 음성만 분석</small></>}
 <p className="service-safety-action">할 수 있는 행동: 민감한 요구는 수행하지 말고 <a href="/official">별도 인증한 공식 업무 화면</a>에서 확인하세요.</p></section>;
}

export function ServiceTranscript({segments}:{segments:TranscriptRevision[]}){
 return <section className="demo-transcript" aria-label="상대 음성 전사"><h2>실시간 전사</h2>{segments.length?segments.map(s=><p key={s.segmentId}><span>{s.final?'확정':'인식 중'}</span>{s.text||'발화 내용 없음'}</p>):<p>수신자의 분석 동의 후 상대 음성을 표시합니다.</p>}</section>;
}
