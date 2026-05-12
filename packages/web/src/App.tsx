import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/store/auth";
import { Sidebar } from "@/components/Sidebar";
import { SSEProvider } from "@/components/SSEProvider";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Inbox } from "@/pages/Inbox";
import { Leads } from "@/pages/Leads";
import { LeadDetail } from "@/pages/LeadDetail";
import { Kanban } from "@/pages/Kanban";
import { Agents } from "@/pages/Agents";
import { AgentChat } from "@/pages/AgentChat";
import { Imoveis } from "@/pages/Imoveis";
import { Settings } from "@/pages/Settings";
import { PublicShare } from "@/pages/PublicShare";

function ProtectedLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  // Ouvir evento de logout para navegar sem hard-reload (essencial no iOS PWA)
  useEffect(() => {
    const handler = () => {
      logout(queryClient);
      navigate("/login", { replace: true });
    };
    window.addEventListener("mittens:logout", handler);
    return () => window.removeEventListener("mittens:logout", handler);
  }, [logout, navigate]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <SSEProvider />
      <Sidebar />
      <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg)" }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/leads/:id" element={<LeadDetail />} />
          <Route path="/pipeline" element={<Kanban />} />
          <Route path="/kanban" element={<Navigate to="/pipeline" replace />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/:id/chat" element={<AgentChat />} />
          <Route path="/imoveis" element={<Imoveis />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/share/:token" element={<PublicShare />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
