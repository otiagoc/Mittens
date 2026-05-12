import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock } from "lucide-react";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { token } = await authApi.login(password);
      login(token);
      navigate("/");
    } catch {
      setError("Password incorreta. Tenta novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: "#f7f9f8" }}
    >
      {/* Decorative blob */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "-120px",
          right: "-100px",
          width: "380px",
          height: "380px",
          borderRadius: "50%",
          background: "radial-gradient(circle, #c8dcd8 0%, #e8efed 60%, transparent 100%)",
          opacity: 0.5,
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "fixed",
          bottom: "-80px",
          left: "-60px",
          width: "260px",
          height: "260px",
          borderRadius: "50%",
          background: "radial-gradient(circle, #c8dcd8 0%, #e8efed 60%, transparent 100%)",
          opacity: 0.35,
          pointerEvents: "none",
        }}
      />

      <div className="relative w-full max-w-xs flex flex-col gap-10">

        {/* Brand */}
        <div className="flex flex-col items-center gap-4">
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: "#2c4d46",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 32px rgba(44,77,70,0.25)",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 22 22" fill="none">
              <path d="M2 18V4L11 13L20 4V18" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="text-center">
            <p
              style={{
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "#1a1a1a",
                margin: 0,
                lineHeight: 1,
              }}
            >
              Mittens
            </p>
            <p
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "#8bb5a8",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginTop: 6,
              }}
            >
              Property Consultants
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Password input */}
          <div
            className="flex items-center gap-3 px-4"
            style={{
              background: "white",
              borderRadius: 16,
              border: error ? "1.5px solid #f87171" : "1.5px solid #e2e8e6",
              boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
              height: 56,
              transition: "border-color 0.15s",
            }}
            onFocus={() => {}}
          >
            <Lock size={16} style={{ color: "#8bb5a8", flexShrink: 0 }} />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Password"
              autoFocus
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 15,
                color: "#1a1a1a",
                fontFamily: "inherit",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{ color: "#adc5c0", flexShrink: 0, lineHeight: 0 }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <p style={{ fontSize: 12, color: "#ef4444", paddingLeft: 4 }}>
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              height: 56,
              borderRadius: 16,
              background: password && !loading ? "#2c4d46" : "#94b5ae",
              color: "white",
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: password && !loading ? "pointer" : "default",
              transition: "background 0.2s",
              marginTop: 4,
            }}
          >
            {loading ? "A entrar..." : "Entrar"}
          </button>
        </form>

        {/* Footer */}
        <p
          className="text-center"
          style={{ fontSize: 11, color: "#b0c4c0", letterSpacing: "0.04em" }}
        >
          Nº1 da Europa em Agentes IA Imobiliários
        </p>
      </div>
    </div>
  );
}
