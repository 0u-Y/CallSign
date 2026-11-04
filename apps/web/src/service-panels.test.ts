import {expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ServiceAnalysisPanel,nextAnalysis} from './components/ServiceAnalysisPanel.js';
import {RecallStatusView} from './components/ServiceRecallStatus.js';
import {serviceAnalysisEventSchema} from '@callsign/protocol';
import {recallSnapshot} from '../../../services/api/src/recall-status.js';
import {serviceFixture} from '../../../tests/unit/service-fixture.js';
vi.hoisted(()=>vi.stubGlobal('sessionStorage',{getItem:()=>null}));
const event=serviceAnalysisEventSchema.parse({streamId:'one',segmentId:'segment',revision:1,contextRevision:1,eventSequence:2,contextId:'c'.repeat(64),dependencies:[{segmentId:'segment',revision:1}],policyHash:'a'.repeat(64),policyVersion:1,analyzerVersion:'purpose-context-1',status:'unavailable',engine:'rules-fallback',signals:[{category:'인증번호 요구',evidenceSpan:'OTP를 알려주세요',explanation:'공식 경로 확인'}],purpose:{relation:'undetermined',evidenceSpan:'',reason:'모델 응답 없음'}});
it('shows unavailable purpose analysis alongside retained rule warnings and only a fixed official action',()=>{const html=renderToStaticMarkup(createElement(ServiceAnalysisPanel,{event}));expect(html).toContain('목적 분석 불가');expect(html).toContain('인증번호 요구');expect(html).toContain('판단 불가');expect(html).toContain('href="/official"');expect(html).not.toContain('안전한 상담원');});
it('ignores reverse analysis events in the same context and does not announce every normal utterance',()=>{expect(nextAnalysis(event,{...event,status:'analyzing',eventSequence:1})).toEqual(event);const html=renderToStaticMarkup(createElement(ServiceAnalysisPanel,{event:{...event,signals:[],status:'analyzed',purpose:{relation:'not-detected',evidenceSpan:'',reason:'범위 내 미탐지'}}}));expect(html).toContain('안전 판정 아님');expect(html).toContain('aria-live="polite" aria-atomic="true"></div>');});
it('withdraws old recall success on query error or stale snapshot and distinguishes absent PBX from real audio silence',async()=>{
 const f=await serviceFixture();await f.store.transact(f.institution.institutionId,async r=>{r.serviceV3!.attempts[f.attempt.id]!.status='cancelled';});const snapshot=recallSnapshot(await f.store.read(f.institution.institutionId),f.institution,1800000000);
 const html=renderToStaticMarkup(createElement(RecallStatusView,{snapshot,now:1800000000}));expect(html).toContain('서버 종료 상태 반영됨');expect(html).toContain('실제 상대 음성 중단은 별도 검증 필요');
 for(const props of [{snapshot,now:1800000011},{snapshot,now:1800000000,error:'조회 실패'}]){const failed=renderToStaticMarkup(createElement(RecallStatusView,props));expect(failed).not.toContain('서버 종료 상태 반영됨');}
});

it('keeps selected task context distinct from call verification and handles unknown or terminal work',async()=>{
 const {ServiceContactSummary}=await import('./components/ServiceContactSummary.js');
 const f=await serviceFixture(),policy=(await f.store.read(f.institution.institutionId)).policy;
 const intent={id:'work-current',status:'open',recipientId:'recipient-account',agentId:'agent-account'};
 const render=(extra:Partial<Parameters<typeof ServiceContactSummary>[0]>={})=>renderToStaticMarkup(createElement(ServiceContactSummary,{institutionUri:'https://institution.example',policy,intent,attempt:{id:'attempt-current',status:'accepted'},role:'recipient',...extra}));
 const html=render();expect(html).toContain('수락됨 · 연결은 별도 확인');expect(html).toContain('요약만으로 승인이 확인된 것은 아닙니다');expect(html).toContain('기관·업무 확인 근거');expect(html).toContain('recipient-account');
 expect(render({intent:{...intent,status:'cancelled'}})).toContain('종료된 업무');
 const unknown=render({intent:{...intent,status:'INTERNAL_STATE'}});expect(unknown).toContain('새로 조회');expect(unknown).not.toContain('INTERNAL_STATE');expect(unknown).not.toContain('종료된 업무');
 expect(render({intent:undefined,attempt:undefined})).toContain('선택 전 · 연결되지 않음');
 expect(render({active:true})).toContain('현재 통화의 권한과 연결 상태를 확인하세요');expect(render({active:false})).toContain('확인한 뒤 수락하세요');
});


it('separates official authentication, permission and lookup failures without exposing internal errors',async()=>{
 const {officialLookupError}=await import('./lib/officialError.js');const {ApiError}=await import('./lib/api.js');
 for(const [status,text] of [[401,'다시 로그인'],[403,'권한이 없습니다'],[409,'상태가 변경'],[429,'요청 한도'],[503,'이전 목록은 최신 결과가 아닙니다']] as const){
  const message=officialLookupError(new ApiError(status,'PRIVATE_INTERNAL_CODE','private diagnostic'));expect(message).toContain(text);expect(message).not.toContain('PRIVATE_INTERNAL_CODE');
 }
 expect(officialLookupError(new Error('private diagnostic'))).not.toContain('private diagnostic');
});
