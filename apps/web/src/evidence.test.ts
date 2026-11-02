import {afterEach,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {EvidencePage} from './pages/Operations.js';
import report from '../../../artifacts/test-results.json';
const preview=vi.hoisted(()=>{vi.stubGlobal('sessionStorage',{getItem:()=>null});return {enabled:false};});
vi.mock('./config.js',()=>({get publicPreview(){return preview.enabled;}}));
afterEach(()=>{preview.enabled=false;});
const current={status:'ready',nodeCount:4,witnessCount:4,witnessThreshold:3,sameBlockHash:true,registryCodePresent:true,commonBlockNumber:'100'};
function render(client:QueryClient){return renderToStaticMarkup(createElement(QueryClientProvider,{client},createElement(MemoryRouter,null,createElement(EvidencePage))));}
it('labels archived PASS results with their original time/scope without inventing live preview observations',()=>{
 preview.enabled=true;const client=new QueryClient();const html=render(client);
 expect(html).toContain(report.generatedAt);expect(html).toContain('과거 시연 시험 기록');expect(html).toContain('현재 서비스·권한·안전·AWS 배포의 판정 근거가 아닙니다');
 expect(html).not.toContain('4/4 기록');expect(html).not.toContain('LIVE ·');expect(html).not.toContain('최근 테스트');client.clear();
});
it('keeps historical results separate and withdraws cached live readiness after a query failure',()=>{
 const client=new QueryClient();client.setQueryData(['latest-evidence'],{readiness:current,report});
 const success=render(client);expect(success).toContain('LIVE ·');expect(success).toContain(report.generatedAt);
 expect(success.split('class="evidence-summary"')[1]!.split('</section>')[0]).not.toContain('PASS');
 client.getQueryCache().find({queryKey:['latest-evidence']})!.setState({status:'error',error:new Error('fixture-readiness-unavailable')});
 const failure=render(client);expect(failure).toContain('현재 관측 조회 실패');expect(failure).not.toContain('LIVE ·');expect(failure).not.toContain('4/4 노드');client.clear();
});
