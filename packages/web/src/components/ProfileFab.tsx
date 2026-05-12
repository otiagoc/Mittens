import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, LogOut } from "lucide-react";
import { settingsApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export function ProfileFab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);

  const { data: profile } = useQuery({
    queryKey: ["agent-profile"],
    queryFn: () => settingsApi.getProfile(),
    staleTime: 60_000,
  });

  const initials = profile?.name
    ? profile.name.split(" ").filter(Boolean).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "M";

  return (
    <>
      {/* Avatar flutuante — só mobile */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed z-40"
        style={{
          top: "calc(env(safe-area-inset-top) + 10px)",
          right: 16,
          width: 38,
          height: 38,
          borderRadius: "50%",
          overflow: "hidden",
          background: profile?.photoUrl ? "transparent" : "#2c4d46",
          border: "2.5px solid white",
          boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        {profile?.photoUrl ? (
          <img
            src={profile.photoUrl}
            alt="Perfil"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: "white", lineHeight: 1 }}>
            {initials}
          </span>
        )}
      </button>

      {/* Sheet + backdrop */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.25)" }}
            onClick={() => setOpen(false)}
          />

          {/* Action sheet — mesmo estilo da ilha */}
          <div
            className="md:hidden fixed z-50"
            style={{
              left: 16,
              right: 16,
              bottom: "calc(96px + env(safe-area-inset-bottom))",
              background: "white",
              borderRadius: 20,
              overflow: "hidden",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            }}
          >
            {/* Cabeçalho com info do perfil */}
            <div
              style={{
                padding: "16px 18px 14px",
                borderBottom: "1px solid #f0f0f0",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: profile?.photoUrl ? "transparent" : "#2c4d46",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {profile?.photoUrl ? (
                  <img src={profile.photoUrl} alt="Perfil" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 16, fontWeight: 700, color: "white" }}>{initials}</span>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {profile?.name ?? "Agente"}
                </p>
                {profile?.email && (
                  <p style={{ fontSize: 11, color: "#8bb5a8", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {profile.email}
                  </p>
                )}
              </div>
            </div>

            {/* Opções */}
            <div style={{ padding: "6px" }}>
              <SheetBtn
                icon={<Settings size={18} />}
                label="Definições & Perfil"
                onClick={() => { setOpen(false); navigate("/settings"); }}
              />
              <SheetBtn
                icon={<LogOut size={18} />}
                label="Sair"
                danger
                onClick={() => {
                  setOpen(false);
                  logout(queryClient);
                  navigate("/login");
                }}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function SheetBtn({
  icon, label, onClick, danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "13px 14px",
        borderRadius: 14,
        background: "transparent",
        color: danger ? "#ef4444" : "#1a1a1a",
        border: "none",
        cursor: "pointer",
        transition: "background 0.12s",
        fontSize: 14,
        fontWeight: 600,
        fontFamily: "inherit",
      }}
      onTouchStart={(e) => { e.currentTarget.style.background = danger ? "#fff5f5" : "#f5f5f5"; }}
      onTouchEnd={(e) => { e.currentTarget.style.background = "transparent"; }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? "#fff5f5" : "#f5f5f5"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ color: danger ? "#ef4444" : "#2c4d46", lineHeight: 0, flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}
