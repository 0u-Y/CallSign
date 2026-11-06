import {useEffect,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Brand } from "./Brand.js";
import { publicPreview } from "../config.js";

export function Shell() {
  const path=useLocation().pathname;const demo=path.startsWith('/demo');
  const [recording,setRecording]=useState(false),[guide,setGuide]=useState(false);
  useEffect(()=>{if(!demo)return;const down=(event:KeyboardEvent)=>{if(event.defaultPrevented||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;if(event.target instanceof Element&&event.target.closest('input,select,textarea,button,a,summary,[contenteditable]:not([contenteditable="false"]),[role="dialog"]'))return;if(document.querySelector('[role="dialog"]'))return;if(event.key.toLowerCase()==='f'){event.preventDefault();setRecording(v=>!v);}else if(event.key==='Escape')setRecording(false);};document.addEventListener('keydown',down);return()=>document.removeEventListener('keydown',down);},[demo]);
  return (
    <div id={demo?'callsign-recording':undefined} className={`app-shell${publicPreview ? " public-preview" : ""}${demo?` demo-shell ${recording?'recording':''} ${path==='/demo/call'?'callpage':path==='/demo/work'?'workpage':'govpage'}`:""}`}>
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>
      <header className={demo?"site-header top":"site-header"}>
        <NavLink to="/" className="brand-link"><Brand compact={demo} recording={demo}/></NavLink>
        <nav className={demo?"topnav":undefined} aria-label="주요 탐색"><NavLink to="/demo/work">업무 관리</NavLink><NavLink to="/demo/call">연락 검증</NavLink><NavLink to="/demo/governance">공동 관리</NavLink></nav>
        {demo&&<div className="recording-toolbar"><button className="button quiet" onClick={()=>setGuide(true)}>촬영 가이드</button><button className="button quiet" aria-pressed={recording} onClick={()=>setRecording(v=>!v)}>{recording?'편집 화면':'촬영 화면'}</button></div>}
      </header>
      {demo&&<Dialog.Root open={guide} onOpenChange={setGuide}><Dialog.Portal><Dialog.Overlay className="demo-drawer-overlay"/><Dialog.Content className="demo-evidence-drawer recording-guide"><Dialog.Title>역할별 창으로 촬영하기</Dialog.Title><Dialog.Description>독립 브라우저 프로필의 실제 계정과 배정 업무를 사용합니다. 촬영 화면 전환은 안내만 숨기며 서비스 상태를 바꾸지 않습니다.</Dialog.Description><ol><li>기관: 업무 관리에서 업무를 선택하고 상세를 확인합니다.</li><li>상담원: 같은 업무를 선택하고 연락 준비·발신을 진행합니다.</li><li>수신자: 수락 후 키패드에서 분석 동의 여부를 직접 선택합니다.</li><li>기관: 취소·정지는 영향 범위를 확인한 뒤 별도 승인된 실행에서만 진행합니다.</li><li>공동 승인자: 같은 요청의 독립 서명 파일을 검토합니다. 클릭만으로 서명이 생성되지 않습니다.</li></ol><p>F: 촬영 화면 전환 · Escape: 안내 닫기 또는 편집 화면 복귀 · Space: 연락 화면에서 현재 역할의 다음 행동. 입력창에서는 단축키를 실행하지 않습니다.</p><p>장면 선택은 화면 안내만 변경합니다. 새 시연은 새 업무로 준비하며 과거 승인·통화·DB를 초기화하지 않습니다. 분석 OFF에서는 실제 AI 결과가 나오지 않습니다.</p><Dialog.Close asChild><button className="button primary">가이드 닫기</button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>}
      {publicPreview && <aside className="public-preview-banner" aria-label="공개 배포 범위">
        <strong>프런트엔드 미리보기</strong><span>API 미연결 · 로그인과 실제 통화는 사용할 수 없습니다. <a href="https://github.com/0u-Y/CallSign/blob/main/docs/RUNBOOK.md">실제 서비스 배포 안내</a></span>
      </aside>}
      <main id="main"><Outlet /></main>
      <footer className="site-footer">{demo?<><span>{publicPreview?'합성 기관 · API 미연결':'합성 기관 · 역할별 인증'}</span><span>기관 승인은 통화 내용의 안전 보장이 아닙니다.</span></>:<><Brand compact /><p>모의 금융기관의 연락 확인 서비스를 개발하고 있습니다. 실제 금융기관·통신사와 연동되지 않았습니다.</p></>}</footer>
    </div>
  );
}
