import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Brand } from "./Brand.js";
import { publicPreview,serviceProfile } from "../config.js";

export function Shell() {
  const location = useLocation();
  const operating = ["/institution", "/gateway", "/governance", "/official"].some((path) => location.pathname.startsWith(path));
  return (
    <div className={`app-shell${publicPreview ? " public-preview" : ""}`}>
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>
      <header className="site-header">
        <NavLink to="/" className="brand-link"><Brand /></NavLink>
        <nav aria-label="주요 탐색">
          <NavLink to="/demo" className={({ isActive }) => isActive || location.pathname === "/receiver" ? "active" : ""}>체험하기</NavLink>
          {!publicPreview && <NavLink to={serviceProfile ? "/service" : "/finals"}>{serviceProfile ? "기관 승인 연락" : "직접 통화 호환"}</NavLink>}
          {!publicPreview && <NavLink to="/institution" className={() => operating ? "active" : ""}>기관 운영</NavLink>}
          <NavLink to="/evidence" className={({ isActive }) => isActive || location.pathname === "/compare" ? "active" : ""}>검증 근거</NavLink>
        </nav>
      </header>
      {publicPreview && <aside className="public-preview-banner" aria-label="공개 배포 범위">
        <strong>PUBLIC · PRESENTATION DEMO</strong>
        <span>고정 시험 데이터와 저장된 과거 증거를 보여주는 미리보기입니다. DB·체인·교환기 전체 서비스의 실행 결과는 아닙니다. 실제 환경 준비는 <a href="https://github.com/0u-Y/CallSign#실행" target="_blank" rel="noreferrer">GitHub 실행 안내</a>에서 재현합니다.</span>
      </aside>}
      <main id="main"><Outlet /></main>
      <footer className="site-footer"><Brand compact /><p>모의 금융기관의 연락 확인 서비스를 개발하고 있습니다. 실제 금융기관·통신사와 연동되지 않았습니다.</p></footer>
    </div>
  );
}
