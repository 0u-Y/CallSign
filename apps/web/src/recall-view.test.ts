import {expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {serviceFixture} from '../../../tests/unit/service-fixture.js';
import {recallSnapshot} from '../../../services/api/src/recall-status.js';
it('shows confirmed authority independently of missing media and clears stale success',async()=>{
 vi.stubGlobal('sessionStorage',{getItem:()=>null});
 try{
 const {RecallStatusView}=await import('./components/ServiceRecallStatus.js');
 const f=await serviceFixture(),now=f.authority.now(),snapshot=recallSnapshot(await f.store.read(f.institution.institutionId),f.institution,now);
 const fresh=renderToStaticMarkup(createElement(RecallStatusView,{snapshot,now}));expect(fresh).toContain('운영 중');expect(fresh).toContain('실제 상대 음성 중단은 별도 검증 필요');
 const stale=renderToStaticMarkup(createElement(RecallStatusView,{snapshot,now:now+snapshot.freshForSeconds+1}));expect(stale).toContain('새로 조회하세요');expect(stale).not.toContain('운영 중');
 const failed=renderToStaticMarkup(createElement(RecallStatusView,{snapshot,now,error:'조회 권한 없음'}));expect(failed).toContain('조회 권한 없음');expect(failed).not.toContain('운영 중');
 }finally{vi.unstubAllGlobals();}
});

it('classifies real API error objects without exposing provider messages',async()=>{
 vi.stubGlobal('sessionStorage',{getItem:()=>null});
 try{
 const {recallLookupError}=await import('./components/ServiceRecallStatus.js');const {ApiError}=await import('./lib/api.js');
 expect(recallLookupError(new ApiError(401,'SESSION_EXPIRED','internal fixture detail'))).toContain('다시 로그인');
 expect(recallLookupError(new ApiError(403,'OBJECT_FORBIDDEN','internal fixture detail'))).toContain('권한이 없습니다');
 for(const error of [new ApiError(503,'DEPENDENCY_UNAVAILABLE','internal fixture detail'),new Error('internal fixture detail')]){
 expect(recallLookupError(error)).toContain('확인할 수 없습니다');expect(recallLookupError(error)).not.toContain('internal fixture detail');
 }
 }finally{vi.unstubAllGlobals();}
});
