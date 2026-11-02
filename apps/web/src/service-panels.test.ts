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
