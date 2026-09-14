import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell.js";
import { ComparePage, DesignSystemPage, EvidencePage, GatewayPage, GovernancePage, InstitutionPage, OfficialPage } from "./pages/Operations.js";
import { DemoPage, LandingPage, ReceiverPage } from "./pages/Experience.js";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<LandingPage />} />
        <Route path="demo" element={<DemoPage />} />
        <Route path="receiver" element={<ReceiverPage />} />
        <Route path="institution" element={<InstitutionPage />} />
        <Route path="gateway" element={<GatewayPage />} />
        <Route path="governance" element={<GovernancePage />} />
        <Route path="evidence" element={<EvidencePage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="official" element={<OfficialPage />} />
        <Route path="design-system" element={<DesignSystemPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
