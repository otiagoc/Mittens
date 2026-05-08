import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
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
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#2c4d46" }}>
      <div className="w-full max-w-sm">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-12">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-sm mb-6"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            <svg width="28" height="28" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 18V4L11 13L20 4V18" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="text-center">
            <h1
              className="text-white uppercase font-light text-2xl tracking-wider"
            >
              <span className="font-bold">MITTENS</span>
            </h1>
            <div className="w-8 h-px mx-auto mt-3 mb-2" style={{ background: "rgba(255,255,255,0.4)" }} />
            <p className="text-xs text-white/70 tracking-wide uppercase font-medium">Property Consultants</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold mb-2 uppercase tracking-wide text-white/90">
              Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input w-full"
                style={{
                  background: "rgba(255,255,255,0.95)",
                  borderColor: "rgba(255,255,255,0.3)",
                  color: "#1a1a1a"
                }}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: "#5a5a5a" }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs font-medium" style={{ color: "#e74c3c" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="btn-primary w-full justify-center"
            style={{
              opacity: loading || !password ? 0.6 : 1,
              background: "rgba(232, 239, 237, 0.95)",
              color: "#2c4d46"
            }}
          >
            {loading ? "A entrar..." : "Entrar"}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-xs text-white/50 tracking-wide">
            Nº1 da Europa em Agentes IA Imobiliários
          </p>
        </div>
      </div>
    </div>
  );
}
