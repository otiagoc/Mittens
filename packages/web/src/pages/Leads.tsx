import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { leadsApi, type Lead } from "@/lib/api";
import { LeadStatusBadge, ALL_STATUSES } from "@/components/LeadStatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { Plus, Search, Phone, Mail, Send, Trash2 } from "lucide-react";
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
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: leadsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      onClose();
    },
    onError: (error) => window.alert(`Erro ao criar lead: ${error.message}`),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-4 md:p-0">
      <div className="bg-white rounded-sm w-full max-w-md p-6 space-y-4" style={{ background: "rgba(255,255,255,0.95)", border: "1px solid rgba(0,0,0,0.05)", borderRadius: "3px" }}>
        <h2 className="font-semibold" style={{ color: "#2c4d46" }}>Novo Lead</h2>

        {(["name", "phone", "email"] as const).map((field) => (
          <div key={field}>
            <label className="label block text-xs font-medium mb-1 capitalize">
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
          <button
            onClick={onClose}
            className="flex-1 rounded-lg py-2 text-sm transition-colors"
            style={{ color: "#2c4d46", border: "1px solid #e8efed" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#e8efed"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate({ ...form, source: "manual" })}
            disabled={!form.name || mutation.isPending}
            className="flex-1 rounded-lg py-2 text-sm text-white transition-colors"
            style={{
              background: "#2c4d46",
              opacity: !form.name || mutation.isPending ? 0.6 : 1
            }}
            onMouseEnter={(e) => { if (!(!form.name || mutation.isPending)) e.currentTarget.style.background = "#1f3a35"; }}
            onMouseLeave={(e) => e.currentTarget.style.background = "#2c4d46"}
          >
            {mutation.isPending ? "A criar..." : "Criar Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
