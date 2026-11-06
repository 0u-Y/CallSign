import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {callScene,DemoCallFlow} from './components/DemoCallFlow.js';
const idle={connection:'연결 전',authority:'미확인',analysis:'동의 전',active:false};
it('does not equate a controller or an invitation with connected media',()=>{
 expect(callScene(idle,false,false).id).toBe('ready');
 expect(callScene({...idle,invitationVerified:true},false,false).id).toBe('ready');
 expect(callScene({...idle,incoming:true},false,false).id).toBe('incoming');
 expect(callScene({...idle,active:true},false,false).id).toBe('connected');
});
it('keeps failure and ended state distinct from retained warning data',()=>{
 expect(callScene({...idle,terminal:true},true,true).id).toBe('ended');
 expect(callScene({...idle,error:'연결 실패'},true,false).id).toBe('error');
 expect(callScene({...idle,active:true},false,true).id).toBe('unavailable');
});
it('renders observational flow without a command or timer-driven success',()=>{
 const html=renderToStaticMarkup(createElement(DemoCallFlow,{status:idle,risk:false,unavailable:false,verification:'실제 상태',transcript:'전사 없음'}));
 expect(html).toContain('기관 승인 확인 전');expect(html).not.toContain('기관 승인 서명 확인됨');expect(html).not.toContain('<button');expect(html).toContain('안전 보장은 아닙니다');
});

it('does not turn acceptance, withdrawal, or termination pending into a fresh incoming call',()=>{
 expect(callScene({...idle,incoming:false,accepting:true},false,false).id).toBe('accepting');
 expect(callScene({...idle,active:true,analysisWithdrawn:true},false,false).id).toBe('withdrawn');
 expect(callScene({...idle,ending:true},true,true).id).toBe('ending');
 expect(callScene({...idle,ending:false,terminal:true,analysisWithdrawn:true},true,true).id).toBe('ended');
});

it('distinguishes actual transcript processing and completed events from media connection',()=>{
 expect(callScene({...idle,active:true,analysis:'상대 음성 전사 수신'},false,false).id).toBe('analyzing');
 expect(callScene({...idle,active:true,analysis:'상대 발화 분석 결과 수신'},false,false).id).toBe('analyzed');
 expect(callScene({...idle,active:true,analysis:'상대 발화 분석 결과 수신',analysisWithdrawn:true},false,false).id).toBe('withdrawn');
});
