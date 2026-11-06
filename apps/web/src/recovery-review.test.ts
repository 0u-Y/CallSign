import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {RecoveryReviewPanel} from './components/RecoveryReviewPanel.js';
it('shows registered keys and honest preparation without granting an approver submission authority',()=>{
 const state={status:'suspended',epoch:'2',chainId:'20260914',registryAddress:`0x${'1'.repeat(40)}`,institutionKey:`0x${'a'.repeat(64)}`,approvers:[1,2,3].map(n=>`0x${String(n).repeat(40)}`)},post=async<T>()=>({} as T);
 const html=renderToStaticMarkup(createElement(RecoveryReviewPanel,{state,permissions:['governance.approve'],action:async fn=>{await fn();},post,reload:async()=>{}}));
 expect(html).toContain('등록 승인키 1');expect(html).toContain('등록 승인키 3');expect(html).toContain('복구 요청 검토 전');
 expect(html).toContain('로그인 세션이 특정 승인키의 소유자라는 뜻은 아닙니다');
 expect(html).not.toContain('검증한 공동 복구 요청 제출');expect(html).not.toContain('<textarea');
});
