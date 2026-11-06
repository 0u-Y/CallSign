import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {CallConsentKeypad} from './components/CallConsentKeypad.js';
it('renders explicit choices and external processing details without creating consent',()=>{
 const consent=vi.fn();const html=renderToStaticMarkup(createElement(CallConsentKeypad,{active:true,connected:true,available:true,withdrawn:false,onEnd:vi.fn(),onConsent:consent}));
 expect(html).toContain('1 동의');expect(html).toContain('2 미동의');expect(html).toContain('9 다시 듣기');expect(html).toContain('Deepgram');expect(html).toContain('OpenAI');expect(consent).not.toHaveBeenCalled();
});
it('keeps withdrawal available during a temporary media pause and provider outage',()=>{
 const html=renderToStaticMarkup(createElement(CallConsentKeypad,{active:false,connected:true,available:false,withdrawn:false,onEnd:vi.fn(),onConsent:vi.fn()}));
 expect(html).toContain('현재 사용할 수 없습니다');expect(html).toMatch(/<button class="button secondary call-analysis">분석 동의 철회·삭제<\/button>/);
});
