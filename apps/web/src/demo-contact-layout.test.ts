import {expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {bankPolicy} from '@callsign/protocol';
import {ServiceContactSummary} from './components/ServiceContactSummary.js';
import {ServiceAnalysisPanel} from './components/ServiceAnalysisPanel.js';
import {DemoWorkspace} from './components/DemoWorkspace.js';
vi.hoisted(()=>vi.stubGlobal('sessionStorage',{getItem:()=>null}));
it('uses an honest short address label while preserving full identity and prohibited requests in details',()=>{
 const uri='https://callsign-demo.example/institutions/demo-bank';
 const html=renderToStaticMarkup(createElement(ServiceContactSummary,{institutionUri:uri,policy:bankPolicy,role:'recipient',compact:true,active:true,intent:{id:'work',agentId:'agent',recipientId:'recipient',status:'open'},attempt:{id:'attempt',status:'accepted'}}));
 const header=html.slice(0,html.indexOf('</header>'));
 expect(header).toContain('등록 주소 식별명 · demo-bank');expect(header).not.toContain('https://');
 expect(html.indexOf(uri)).toBeGreaterThan(html.indexOf('<details'));
 const visible=html.slice(0,html.indexOf('<details'));
 expect(html.slice(html.indexOf('<details'))).toContain('인증번호 요구');expect(visible).toContain('분석은 별도 동의');
 expect(html).toContain('href="/official"');
 expect(html).toContain('확인된 기관 표시명을 대신하지 않습니다');expect(html).toContain('업무 식별자');
});
it('keeps compact empty analysis distinct from completed results',()=>{
 const html=renderToStaticMarkup(createElement(ServiceAnalysisPanel,{compact:true}));
 expect(html).toContain('아직 분석 전입니다.');expect(html).toContain('동의와 제공자 상태를 확인');
 expect(html).not.toContain('안전한 통화');
});
it('keeps actual verification before recipient analysis and phone controls',()=>{
 const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(DemoWorkspace,{role:'recipient',roleName:'수신자',account:null,notice:null,queue:null,contact:null,verification:createElement('div',{'data-check':'verification'}),controls:createElement('button',{'data-check':'phone-controls'},'통화 종료'),analysis:createElement('section',{'data-check':'analysis'}),operations:null,notifications:null,audio:null,governance:false,connected:true,connection:'검증된 실제 상태',end:()=>{},canObserve:false,identity:'scoped-work',stale:false})));
 expect(html.indexOf('data-check="verification"')).toBeLessThan(html.indexOf('data-check="phone-controls"'));
 expect(html.indexOf('data-check="analysis"')).toBeLessThan(html.indexOf('data-check="phone-controls"'));
 expect(html).toContain('인증된 역할: 수신자');expect(html).toContain('진행 통화 종료');
});
