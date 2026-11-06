import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Brand } from "./Brand.js";
import { publicPreview } from "../config.js";

export function Shell() {
  const demo=useLocation().pathname.startsWith('/demo');
  return (
    <div className={`app-shell${publicPreview ? " public-preview" : ""}${demo?" demo-shell":""}`}>
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>
      <header className="site-header">
        <NavLink to="/" className="brand-link"><Brand /></NavLink>
        <nav aria-label="주요 탐색"><NavLink to="/demo/work">업무 관리</NavLink><NavLink to="/demo/call">연락 검증</NavLink><NavLink to="/demo/governance">공동 관리</NavLink></nav>
      </header>
      {publicPreview && <aside className="public-preview-banner" aria-label="공개 배포 범위">
        <strong>프런트엔드 미리보기</strong><span>API 미연결 · 로그인과 실제 통화는 사용할 수 없습니다. <a href="https://github.com/0u-Y/CallSign/blob/main/docs/RUNBOOK.md">실제 서비스 배포 안내</a></span>
      </aside>}
      <main id="main"><Outlet /></main>
      <footer className="site-footer"><Brand compact /><p>모의 금융기관의 연락 확인 서비스를 개발하고 있습니다. 실제 금융기관·통신사와 연동되지 않았습니다.</p></footer>
    </div>
  );
}
