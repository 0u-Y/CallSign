import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {CallConsentKeypad} from './components/CallConsentKeypad.js';
it('renders explicit choices and external processing details without creating consent',()=>{
 const consent=vi.fn();const html=renderToStaticMarkup(createElement(CallConsentKeypad,{active:true,connected:true,available:true,withdrawn:false,onEnd:vi.fn(),onConsent:consent}));
 expect(html).toContain('안내문 보기');expect(html).toContain('aria-haspopup="dialog"');expect(html).toContain('aria-label="키패드"');expect(consent).not.toHaveBeenCalled();
});
it('keeps withdrawal available during a temporary media pause and provider outage',()=>{
 const html=renderToStaticMarkup(createElement(CallConsentKeypad,{active:false,connected:true,available:false,withdrawn:false,onEnd:vi.fn(),onConsent:vi.fn()}));
 expect(html).toContain('현재 사용할 수 없습니다');expect(html).toMatch(/<button class="button quiet call-analysis">분석 동의 철회·삭제<\/button>/);
});
it('keeps disconnected handset free of inactive media and consent controls',()=>{
 const html=renderToStaticMarkup(createElement(CallConsentKeypad,{active:false,connected:false,available:true,withdrawn:false,onEnd:vi.fn(),onConsent:vi.fn()}));
 expect(html).toContain('통화 연결 후');expect(html).not.toContain('<button');
});
