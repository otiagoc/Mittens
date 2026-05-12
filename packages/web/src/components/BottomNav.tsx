import { NavLink } from "react-router-dom";
import { LayoutDashboard, MessageSquare, Users, Home, KanbanSquare } from "lucide-react";

const navItems = [
  { to: "/",         icon: LayoutDashboard, label: "Início"   },
  { to: "/inbox",    icon: MessageSquare,   label: "Inbox"    },
  { to: "/leads",    icon: Users,           label: "Leads"    },
  { to: "/imoveis",  icon: Home,            label: "Imóveis"  },
  { to: "/pipeline", icon: KanbanSquare,    label: "Pipeline" },
];

export function BottomNav() {
  return (
    <nav
      className="md:hidden fixed z-40 flex items-center"
      style={{
        left: 16,
        right: 16,
        bottom: "calc(16px + env(safe-area-inset-bottom))",
        background: "#2c4d46",
        borderRadius: 20,
        boxShadow: "0 8px 32px rgba(44,77,70,0.35)",
        height: 64,
        padding: "0 4px",
      }}
    >
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className="flex-1 flex flex-col items-center justify-center gap-1 h-full"
        >
          {({ isActive }) => (
            <>
              <div
                style={{
                  width: 40,
                  height: 34,
                  borderRadius: 12,
                  background: isActive ? "rgba(255,255,255,0.18)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.15s",
                }}
              >
                <Icon size={18} color={isActive ? "white" : "rgba(255,255,255,0.45)"} />
              </div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: isActive ? "white" : "rgba(255,255,255,0.45)",
                  lineHeight: 1,
                }}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
