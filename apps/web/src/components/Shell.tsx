import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Brand } from "./Brand.js";
import { publicPreview } from "../config.js";

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
          {!publicPreview && <NavLink to="/institution" className={() => operating ? "active" : ""}>기관 운영</NavLink>}
          <NavLink to="/evidence" className={({ isActive }) => isActive || location.pathname === "/compare" ? "active" : ""}>검증 근거</NavLink>
        </nav>
      </header>
      {publicPreview && <aside className="public-preview-banner" aria-label="공개 배포 범위">
        <strong>PUBLIC · UI PREVIEW</strong>
        <span>브라우저 내 서명·검증 fixture를 체험할 수 있습니다. QBFT·WebRTC LIVE 실행은 <a href="https://github.com/0u-Y/CallSign#실행" target="_blank" rel="noreferrer">GitHub 실행 안내</a>에서 재현합니다.</span>
      </aside>}
      <main id="main"><Outlet /></main>
      <footer className="site-footer"><Brand compact /><p>모의 기관과 합성 데이터로 실행하는 해커톤 개념검증입니다. 정부·기관·통신사의 참여를 뜻하지 않습니다.</p></footer>
    </div>
  );
}
