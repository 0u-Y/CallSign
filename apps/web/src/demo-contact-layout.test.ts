import {expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {bankPolicy} from '@callsign/protocol';
import {ServiceContactSummary} from './components/ServiceContactSummary.js';
import {ServiceAnalysisPanel} from './components/ServiceAnalysisPanel.js';
import {DemoWorkspace} from './components/DemoWorkspace.js';
vi.hoisted(()=>vi.stubGlobal('sessionStorage',{getItem:()=>null}));
it('uses an honest short address label while preserving full identity and visible prohibited requests',()=>{
 const uri='https://callsign-demo.example/institutions/demo-bank';
 const html=renderToStaticMarkup(createElement(ServiceContactSummary,{institutionUri:uri,policy:bankPolicy,role:'recipient',compact:true,active:true,intent:{id:'work',agentId:'agent',recipientId:'recipient',status:'open'},attempt:{id:'attempt',status:'accepted'}}));
 const header=html.slice(0,html.indexOf('</header>'));
 expect(header).toContain('등록 주소 식별명 · demo-bank');expect(header).not.toContain('https://');
 expect(html.indexOf(uri)).toBeGreaterThan(html.indexOf('<details'));
 const visible=html.slice(0,html.indexOf('<details'));
 expect(visible).toContain('인증번호 요구');expect(visible).toContain('분석은 별도 동의');
 expect(html).toContain('확인된 기관 표시명을 대신하지 않습니다');expect(html).toContain('업무 식별자');
});
it('keeps the compact empty analysis honest and its authenticated official action available',()=>{
 const html=renderToStaticMarkup(createElement(ServiceAnalysisPanel,{compact:true}));
 expect(html).toContain('아직 분석 결과 없음');expect(html).toContain('href="/official"');expect(html).toContain('민감한 요구는 수행하지 말고');
 expect(html).not.toContain('안전한 통화');
});
it('puts actual verification and recipient controls before supporting analysis without changing role scope',()=>{
 const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(DemoWorkspace,{role:'recipient',roleName:'수신자',account:null,notice:null,queue:null,contact:null,verification:createElement('div',{'data-check':'verification'}),controls:createElement('button',{'data-check':'phone-controls'},'통화 종료'),analysis:createElement('section',{'data-check':'analysis'}),operations:null,notifications:null,audio:null,governance:false,connected:true,connection:'검증된 실제 상태',end:()=>{},canObserve:false,identity:'scoped-work',stale:false})));
 expect(html.indexOf('data-check="verification"')).toBeLessThan(html.indexOf('data-check="phone-controls"'));
 expect(html.indexOf('data-check="phone-controls"')).toBeLessThan(html.indexOf('data-check="analysis"'));
 expect(html).toContain('현재 역할의 조회 범위');expect(html).toContain('진행 통화 종료');
});
