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
  { to: "/kanban",   icon: KanbanSquare,    label: "Kanban" },
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
      className={`${collapsed ? "w-[70px]" : "w-[220px]"} shrink-0 min-h-screen flex flex-col transition-all duration-200 relative`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        {collapsed ? (
          /* Ícone colapsado — M minimalista */
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 18V4L11 13L20 4V18" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        ) : (
          /* Wordmark expandido */
          <div className="overflow-hidden flex items-center gap-3">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 18V4L11 13L20 4V18" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div>
              <span
                className="text-white tracking-widest uppercase text-sm font-light"
                style={{ letterSpacing: "0.2em" }}
              >
                MITTENS
              </span>
              <div className="h-px w-full mt-1" style={{ background: "rgba(255,255,255,0.2)" }} />
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 mt-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group ${
                isActive
                  ? "text-white"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`
            }
            style={({ isActive }) => isActive ? { background: "var(--sidebar-active)" } : {}}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="text-sm font-medium">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-white/10 space-y-0.5">
        <button
          onClick={() => { logout(queryClient); navigate("/login"); }}
          title={collapsed ? "Sair" : undefined}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all duration-150"
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Sair</span>}
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
