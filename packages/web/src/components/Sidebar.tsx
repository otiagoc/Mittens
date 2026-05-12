import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, MessageSquare, Users, Bot,
  KanbanSquare, LogOut, ChevronLeft, ChevronRight, Home, Settings as SettingsIcon
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const navItems = [
  { to: "/",         icon: LayoutDashboard, label: "Dashboard" },
  { to: "/inbox",    icon: MessageSquare,   label: "Inbox" },
  { to: "/pipeline", icon: KanbanSquare,    label: "Pipeline" },
  { to: "/leads",    icon: Users,           label: "Leads" },
  { to: "/imoveis",  icon: Home,            label: "Imóveis" },
  { to: "/agents",   icon: Bot,             label: "Agentes" },
  { to: "/settings", icon: SettingsIcon,    label: "Definições" },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return (
    <aside
      style={{ background: "var(--sidebar-bg)" }}
      className={`${collapsed ? "w-[70px]" : "w-[240px]"} shrink-0 min-h-screen hidden md:flex flex-col transition-all duration-200 relative`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
        {collapsed ? (
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 18V4L11 13L20 4V18" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        ) : (
          <div className="overflow-hidden flex flex-col gap-1">
            <div className="flex items-baseline gap-1">
              <span className="text-white uppercase text-xs font-bold tracking-wider">MITTENS</span>
            </div>
            <div className="h-px w-8" style={{ background: "rgba(255,255,255,0.5)" }} />
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 mt-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors duration-150 group text-xs font-medium uppercase tracking-wide ${
                isActive
                  ? "text-white bg-white/15"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`
            }
          >
            <Icon size={16} className="shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 space-y-1" style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
        <button
          onClick={() => { logout(queryClient); navigate("/login"); }}
          title={collapsed ? "Sair" : undefined}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-2xl text-xs font-medium uppercase tracking-wide text-white/70 hover:text-white hover:bg-white/10 transition-colors duration-150"
        >
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm hover:shadow transition-shadow z-10"
        title={collapsed ? "Expandir" : "Colapsar"}
      >
        {collapsed
          ? <ChevronRight size={12} className="text-gray-500" />
          : <ChevronLeft size={12} className="text-gray-500" />
        }
      </button>
    </aside>
  );
}
