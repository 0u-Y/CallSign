import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {ConfigurationReviewPanel,type ConfigurationManagement} from './components/ConfigurationReviewPanel.js';
const render=(state:ConfigurationManagement|undefined,loadError=false)=>renderToStaticMarkup(createElement(ConfigurationReviewPanel,{state,loadError,permissions:[],action:async()=>{},post:async<T,>()=>({} as T),reload:async()=>{}}));
it('distinguishes loading, failure and a successful empty collection',()=>{
 expect(render(undefined)).toContain('조회하고 있습니다');expect(render(undefined)).not.toContain('요청이 없습니다');
 expect(render(undefined,true)).toContain('조회하지 못했습니다');expect(render(undefined,true)).not.toContain('요청이 없습니다');
 expect(render({configurationProposals:[]} as unknown as ConfigurationManagement)).toContain('요청이 없습니다');
});
