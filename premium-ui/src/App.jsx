import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPagePremium";
import Dashboard from "./pages/DashboardPremium";
import RequestDetail from "./pages/RequestDetail";
import AdminPanel from "./pages/AdminPanel";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/dashboard/requests" element={<RequestDetail />} />
      <Route path="/dashboard/admin" element={<AdminPanel />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
