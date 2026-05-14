import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { leadsApi, type Lead } from "@/lib/api";
import { LeadStatusBadge, ALL_STATUSES } from "@/components/LeadStatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { Plus, Search, Phone, Mail, Send, Trash2, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export function Leads() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["leads", statusFilter, search],
    queryFn: () => leadsApi.list({ status: statusFilter || undefined, search: search || undefined }),
    staleTime: 10_000,
  });

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle">{data?.total ?? 0} leads no total</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 text-white text-xs font-bold uppercase tracking-wide px-3 py-2 rounded-lg transition-colors"
          style={{ background: "#2c4d46" }}
        >
          <Plus size={16} />
          Novo Lead
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#8bb5a8" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar..."
            className="input w-full pl-8"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input"
        >
          <option value="">Todos os estados</option>
          {ALL_STATUSES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      <div className="card rounded-sm overflow-hidden" style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(0,0,0,0.05)", borderRadius: "3px", padding: 0 }}>
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">A carregar...</div>
        ) : !data?.data.length ? (
          <div className="p-8 text-center text-sm text-slate-500">Nenhum lead encontrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead style={{ background: "#e8efed" }} className="border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium" style={{ color: "#2c4d46" }}>Nome</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: "#2c4d46" }}>Contacto</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: "#2c4d46" }}>Estado</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: "#2c4d46" }}>Fonte</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: "#2c4d46" }}>Última Actividade</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      </div>

      {showCreate && <CreateLeadModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function LeadRow({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => leadsApi.delete(lead.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (error) => window.alert(`Erro ao eliminar: ${error.message}`),
  });

  return (
    <tr
      onClick={onClick}
      className="border-b last:border-0 cursor-pointer transition-colors"
      style={{ background: "transparent" }}
      onMouseEnter={(e) => e.currentTarget.style.background = "#e8efed"}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs" style={{ background: "#e8efed", color: "#2c4d46" }}>
            {(lead.name?.[0] ?? "?").toUpperCase()}
          </div>
          <div>
            <div className="font-medium" style={{ color: "#2c4d46" }}>{lead.name}</div>
            {lead.telegramUsername && (
              <div className="text-xs" style={{ color: "#8bb5a8" }}>@{lead.telegramUsername}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3" style={{ color: "#6b7e7a" }}>
        <div className="space-y-0.5">
          {lead.phone && (
            <div className="flex items-center gap-1 text-xs">
              <Phone size={11} style={{ color: "#8bb5a8" }} />
              {lead.phone}
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-1 text-xs">
              <Mail size={11} style={{ color: "#8bb5a8" }} />
              {lead.email}
            </div>
          )}
          {!lead.phone && !lead.email && (
            <span className="text-xs" style={{ color: "#8bb5a8" }}>—</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <LeadStatusBadge status={lead.status} />
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          "inline-flex items-center gap-1 text-xs",
          lead.source === "telegram" ? "text-green-700" : "text-slate-500"
        )}>
          {lead.source === "telegram" ? <Send size={11} /> : null}
          {lead.source}
        </span>
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: "#8bb5a8" }}>
        {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true, locale: pt })}
      </td>
      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setConfirming(true)}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: "#8bb5a8" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#e74c3c"; e.currentTarget.style.background = "#e8efed"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#8bb5a8"; e.currentTarget.style.background = "transparent"; }}
          title="Eliminar lead"
        >
          <Trash2 size={14} />
        </button>
        <ConfirmDialog
          open={confirming}
          title="Eliminar Lead"
          message={`Tens a certeza que queres eliminar "${lead.name}"? Esta ação não pode ser desfeita.`}
          confirmText="Eliminar"
          cancelText="Cancelar"
          variant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setConfirming(false)}
        />
      </td>
    </tr>
  );
}

function CreateLeadModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [aiText, setAiText] = useState("");
  const [aiResult, setAiResult] = useState<{ name: string; alertsCount: number } | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const manualMutation = useMutation({
    mutationFn: leadsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      onClose();
    },
    onError: (error) => window.alert(`Erro ao criar lead: ${error.message}`),
  });

  const aiMutation = useMutation({
    mutationFn: async (text: string) => {
      const token = localStorage.getItem("mittens_token");
      const res = await fetch("/api/leads/ai-create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(err.error ?? "Erro");
      }
      return res.json() as Promise<{ leadId: string; name: string; alertsCount: number }>;
    },
    onSuccess: (data) => {
      setAiResult(data);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (error) => window.alert(`Erro: ${error.message}`),
  });

  if (aiResult) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4 md:p-0">
        <div className="bg-white w-full max-w-md p-6 space-y-4 text-center" style={{ border: "1px solid rgba(0,0,0,0.05)", borderRadius: "3px" }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto" style={{ background: "#e8efed" }}>
            <Sparkles size={22} style={{ color: "#2c4d46" }} />
          </div>
          <h2 className="font-semibold text-lg" style={{ color: "#2c4d46" }}>Lead criada!</h2>
          <p className="text-sm text-gray-600">
            <strong>{aiResult.name}</strong> foi adicionado com{" "}
            <strong>{aiResult.alertsCount} alerta{aiResult.alertsCount !== 1 ? "s" : ""}</strong> de imóveis.
            {aiResult.alertsCount > 0 && " O scrape inicial está a correr em background."}
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg py-2 text-sm transition-colors"
              style={{ color: "#2c4d46", border: "1px solid #e8efed" }}
            >
              Fechar
            </button>
            <button
              onClick={() => { onClose(); navigate(`/leads/${aiMutation.data?.leadId}`); }}
              className="flex-1 rounded-lg py-2 text-sm text-white"
              style={{ background: "#2c4d46" }}
            >
              Ver lead
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4 md:p-0">
      <div className="bg-white w-full max-w-md p-6 space-y-4" style={{ background: "rgba(255,255,255,0.95)", border: "1px solid rgba(0,0,0,0.05)", borderRadius: "3px" }}>
        <h2 className="font-semibold" style={{ color: "#2c4d46" }}>Novo Lead</h2>

        {/* Tabs modo */}
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "#e8efed" }}>
          <button
            onClick={() => setMode("ai")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors"
            style={{ background: mode === "ai" ? "#2c4d46" : "transparent", color: mode === "ai" ? "white" : "#2c4d46" }}
          >
            <Sparkles size={13} /> Criar com IA
          </button>
          <button
            onClick={() => setMode("manual")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors"
            style={{ background: mode === "manual" ? "#2c4d46" : "transparent", color: mode === "manual" ? "white" : "#2c4d46" }}
          >
            <User size={13} /> Manual
          </button>
        </div>

        {mode === "ai" ? (
          <>
            <div>
              <label className="label block text-xs font-medium mb-1">Descreve o cliente</label>
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                rows={6}
                placeholder={"Ex: João Silva, 935 000 000, quer comprar T2 ou T3 em Oeiras ou Cascais, até 350 mil euros, mínimo 80m², não quer apartamentos muito antigos (a partir de 2000). Também interessado em arrendar T2 em Lisboa até 1500€/mês."}
                className="input w-full resize-none text-sm"
                style={{ lineHeight: "1.5" }}
              />
              <p className="text-xs text-gray-400 mt-1">A IA extrai o perfil, notas e cria os alertas de imóveis automaticamente.</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 rounded-lg py-2 text-sm" style={{ color: "#2c4d46", border: "1px solid #e8efed" }}>
                Cancelar
              </button>
              <button
                onClick={() => aiMutation.mutate(aiText)}
                disabled={!aiText.trim() || aiMutation.isPending}
                className="flex-1 rounded-lg py-2 text-sm text-white flex items-center justify-center gap-1.5"
                style={{ background: "#2c4d46", opacity: !aiText.trim() || aiMutation.isPending ? 0.6 : 1 }}
              >
                <Sparkles size={13} />
                {aiMutation.isPending ? "A processar..." : "Criar com IA"}
              </button>
            </div>
          </>
        ) : (
          <>
            {(["name", "phone", "email"] as const).map((field) => (
              <div key={field}>
                <label className="label block text-xs font-medium mb-1">
                  {field === "name" ? "Nome *" : field === "phone" ? "Telefone" : "Email"}
                </label>
                <input
                  value={form[field]}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  className="input w-full"
                />
              </div>
            ))}
            <div>
              <label className="label block text-xs font-medium mb-1">Notas</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="input w-full resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 rounded-lg py-2 text-sm" style={{ color: "#2c4d46", border: "1px solid #e8efed" }}>
                Cancelar
              </button>
              <button
                onClick={() => manualMutation.mutate({ ...form, source: "manual" })}
                disabled={!form.name || manualMutation.isPending}
                className="flex-1 rounded-lg py-2 text-sm text-white"
                style={{ background: "#2c4d46", opacity: !form.name || manualMutation.isPending ? 0.6 : 1 }}
              >
                {manualMutation.isPending ? "A criar..." : "Criar Lead"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
