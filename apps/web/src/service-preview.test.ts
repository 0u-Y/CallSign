import {it,expect,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
vi.hoisted(()=>vi.stubGlobal('sessionStorage',{getItem:()=>null}));
vi.mock('./config.js',()=>({publicPreview:true,serviceProfile:false,finalsProfile:false}));
import {ServicePage,ServiceOfficialPage} from './pages/Service.js';
it('renders the real disconnected service surfaces in public preview without claiming authentication or a call',()=>{
 for(const Page of [ServicePage,ServiceOfficialPage]){const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(Page)));expect(html).toContain('미리보기');expect(html).toContain('disabled');expect(html).not.toContain('APPROVAL_VERIFIED');expect(html).not.toContain('3분 데모');}
});

it('does not present an unqueried disconnected official inbox as an empty verified result',()=>{const html=renderToStaticMarkup(createElement(ServiceOfficialPage));expect(html).not.toContain('현재 확인할 공식 업무가 없습니다');expect(html).toContain('공식 업무 조회');});
