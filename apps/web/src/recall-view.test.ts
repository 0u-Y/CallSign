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
