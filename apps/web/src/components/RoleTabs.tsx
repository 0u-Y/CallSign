import { NavLink } from "react-router-dom";

const roles = [
  ["/institution", "기관 담당자"],
  ["/gateway", "위탁센터"],
  ["/governance", "공동 운영"],
] as const;

export function RoleTabs() {
  return <nav className="role-tabs" aria-label="운영 역할">{roles.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav>;
}
