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
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
      style={{
        background: "#2c4d46",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
              isActive ? "text-white" : "text-white/50"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div
                className="flex items-center justify-center w-8 h-8 rounded-xl transition-colors"
                style={{ background: isActive ? "rgba(255,255,255,0.15)" : "transparent" }}
              >
                <Icon size={18} />
              </div>
              <span
                className="text-[9px] font-bold uppercase tracking-wide leading-none"
                style={{ color: isActive ? "white" : "rgba(255,255,255,0.5)" }}
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
