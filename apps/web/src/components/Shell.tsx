import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Brand } from "./Brand.js";

export function Shell() {
  const location = useLocation();
  const operating = ["/institution", "/gateway", "/governance", "/official"].some((path) => location.pathname.startsWith(path));
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>
      <header className="site-header">
        <NavLink to="/" className="brand-link"><Brand /></NavLink>
        <nav aria-label="주요 탐색">
          <NavLink to="/demo" className={({ isActive }) => isActive || location.pathname === "/receiver" ? "active" : ""}>체험하기</NavLink>
          <NavLink to="/institution" className={() => operating ? "active" : ""}>기관 운영</NavLink>
          <NavLink to="/evidence" className={({ isActive }) => isActive || location.pathname === "/compare" ? "active" : ""}>검증 근거</NavLink>
        </nav>
      </header>
      <main id="main"><Outlet /></main>
      <footer className="site-footer"><Brand compact /><p>모의 기관과 합성 데이터로 실행하는 해커톤 개념검증입니다. 정부·기관·통신사의 참여를 뜻하지 않습니다.</p></footer>
    </div>
  );
}
