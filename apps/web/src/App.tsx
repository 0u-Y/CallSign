import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell.js";
import { ComparePage, DesignSystemPage, EvidencePage, GatewayPage, GovernancePage, InstitutionPage, OfficialPage } from "./pages/Operations.js";
import { DemoPage, LandingPage, ReceiverPage } from "./pages/Experience.js";
import { FinalsPage, FinalsOfficialPage } from "./pages/Finals.js";
import { publicPreview, finalsProfile } from "./config.js";

const localOnly = (element: ReactNode) => publicPreview ? <Navigate to="/demo" replace /> : element;

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<LandingPage />} />
        <Route path="finals" element={localOnly(<FinalsPage />)} />
        <Route path="demo" element={<DemoPage />} />
        <Route path="receiver" element={localOnly(finalsProfile ? <Navigate to="/finals" replace /> : <ReceiverPage />)} />
        <Route path="institution" element={localOnly(finalsProfile ? <Navigate to="/finals" replace /> : <InstitutionPage />)} />
        <Route path="gateway" element={localOnly(finalsProfile ? <Navigate to="/finals" replace /> : <GatewayPage />)} />
        <Route path="governance" element={localOnly(finalsProfile ? <Navigate to="/finals" replace /> : <GovernancePage />)} />
        <Route path="evidence" element={<EvidencePage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="official" element={localOnly(finalsProfile ? <FinalsOfficialPage /> : <OfficialPage />)} />
        <Route path="design-system" element={<DesignSystemPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
