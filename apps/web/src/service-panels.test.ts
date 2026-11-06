import {expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ServiceAnalysisPanel,nextAnalysis} from './components/ServiceAnalysisPanel.js';
import {RecallStatusView} from './components/ServiceRecallStatus.js';
import {serviceAnalysisEventSchema} from '@callsign/protocol';
import {recallSnapshot} from '../../../services/api/src/recall-status.js';
import {serviceFixture} from '../../../tests/unit/service-fixture.js';
vi.hoisted(()=>vi.stubGlobal('sessionStorage',{getItem:()=>null}));
const event=serviceAnalysisEventSchema.parse({streamId:'one',segmentId:'segment',revision:1,contextRevision:1,eventSequence:2,contextId:'c'.repeat(64),dependencies:[{segmentId:'segment',revision:1}],policyHash:'a'.repeat(64),policyVersion:1,analyzerVersion:'risk-context-2',promptVersion:'callsign-risk-2',status:'unavailable',engine:'rules-fallback',signals:[],assessments:[{code:'OTP',result:'detected',source:'rules',explanation:'인증 비밀 전달을 요구했습니다.',evidence:[{segmentId:'segment',revision:1,quote:'<script>인증번호를 알려주세요</script>',state:'active'}]}],action:'별도 확인',limitations:'범위 제한'});
it('separates unavailable analysis, rule evidence and server criteria; escapes quotes',()=>{const html=renderToStaticMarkup(createElement(ServiceAnalysisPanel,{event,compact:true}));expect(html).toContain('분석 실패 또는 제공자 미설정');expect(html).toContain('인증 비밀 요구');expect(html).toContain('규칙');expect(html).toContain('적용 기준');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).toContain('href="/official"');});
it('ignores reverse events and never equates no signals with safety',()=>{expect(nextAnalysis(event,{...event,status:'analyzing',eventSequence:1})).toEqual(event);const html=renderToStaticMarkup(createElement(ServiceAnalysisPanel,{event:serviceAnalysisEventSchema.parse({...event,signals:[],status:'analyzed'})}));expect(html).toContain('안전 보장이 아닙니다');expect(html).toContain('목적 이탈은 분석하지');});
it('withdraws old recall success on query error or stale snapshot and distinguishes absent PBX from real audio silence',async()=>{
 const f=await serviceFixture();await f.store.transact(f.institution.institutionId,async r=>{r.serviceV3!.attempts[f.attempt.id]!.status='cancelled';});const snapshot=recallSnapshot(await f.store.read(f.institution.institutionId),f.institution,1800000000);
 const html=renderToStaticMarkup(createElement(RecallStatusView,{snapshot,now:1800000000}));expect(html).toContain('서버 종료 상태 반영됨');expect(html.indexOf('서버 종료 상태 반영됨')).toBeGreaterThan(html.indexOf('<details'));expect(html).toContain('명령·통화별 실제 회수 근거');expect(html).toContain('실제 상대 음성 중단은 별도 검증 필요');
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
 const staleCall=render({active:true,stale:true});expect(staleCall).toContain('최신 업무 조회 미확인');expect(staleCall).toContain('https://institution.example');expect(staleCall).toContain('work-current');expect(staleCall).not.toContain('로그인하면');
 expect(render({active:true})).toContain('현재 통화의 권한과 연결 상태를 확인하세요');expect(render({active:false})).toContain('확인한 뒤 수락하세요');
});


it('separates official authentication, permission and lookup failures without exposing internal errors',async()=>{
 const {officialLookupError}=await import('./lib/officialError.js');const {ApiError}=await import('./lib/api.js');
 for(const [status,text] of [[401,'다시 로그인'],[403,'권한이 없습니다'],[409,'상태가 변경'],[429,'요청 한도'],[503,'이전 목록은 최신 결과가 아닙니다']] as const){
  const message=officialLookupError(new ApiError(status,'PRIVATE_INTERNAL_CODE','private diagnostic'));expect(message).toContain(text);expect(message).not.toContain('PRIVATE_INTERNAL_CODE');
 }
 expect(officialLookupError(new Error('private diagnostic'))).not.toContain('private diagnostic');
});
