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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} leads no total</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Novo Lead
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar..."
            className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os estados</option>
          {ALL_STATUSES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">A carregar...</div>
        ) : !data?.data.length ? (
          <div className="p-8 text-center text-sm text-slate-500">Nenhum lead encontrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Contacto</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Fonte</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Última Actividade</th>
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
      className="border-b last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
            {(lead.name?.[0] ?? "?").toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-slate-900">{lead.name}</div>
            {lead.telegramUsername && (
              <div className="text-xs text-slate-400">@{lead.telegramUsername}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-600">
        <div className="space-y-0.5">
          {lead.phone && (
            <div className="flex items-center gap-1 text-xs">
              <Phone size={11} className="text-slate-400" />
              {lead.phone}
            </div>
          )}
          {lead.email && (
            <div className="flex items-center gap-1 text-xs">
              <Mail size={11} className="text-slate-400" />
              {lead.email}
            </div>
          )}
          {!lead.phone && !lead.email && (
            <span className="text-xs text-slate-400">—</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <LeadStatusBadge status={lead.status} />
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          "inline-flex items-center gap-1 text-xs",
          lead.source === "telegram" ? "text-blue-600" : "text-slate-500"
        )}>
          {lead.source === "telegram" ? <Send size={11} /> : null}
          {lead.source}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true, locale: pt })}
      </td>
      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setConfirming(true)}
          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Novo Lead</h2>

        {(["name", "phone", "email"] as const).map((field) => (
          <div key={field}>
            <label className="block text-xs font-medium text-slate-600 mb-1 capitalize">
              {field === "name" ? "Nome *" : field === "phone" ? "Telefone" : "Email"}
            </label>
            <input
              value={form[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 border rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate({ ...form, source: "manual" })}
            disabled={!form.name || mutation.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm"
          >
            {mutation.isPending ? "A criar..." : "Criar Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
