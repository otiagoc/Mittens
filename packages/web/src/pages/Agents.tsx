import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi, type Agent } from "@/lib/api";
import { Bot, MessageSquare, ToggleLeft, ToggleRight, Plus, Edit2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export function Agents() {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: agentsApi.list,
  });

  if (isLoading) return <div className="p-8 text-sm text-slate-500">A carregar...</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Agentes</h1>
          <p className="text-sm text-slate-500">{agents.length} agente{agents.length !== 1 ? "s" : ""} configurado{agents.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Novo Agente
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onEdit={() => setEditing(agent)}
          />
        ))}
      </div>

      {(showCreate || editing) && (
        <AgentModal
          agent={editing ?? undefined}
          onClose={() => { setShowCreate(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function AgentCard({ agent, onEdit }: { agent: Agent; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const toggleMutation = useMutation({
    mutationFn: () => agentsApi.update(agent.id, { enabled: !agent.enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });

  return (
    <div className={cn(
      "bg-white rounded-xl border p-4 space-y-3 transition-opacity",
      !agent.enabled && "opacity-60"
    )}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-2xl">
            {agent.emoji}
          </div>
          <div>
            <div className="font-semibold text-slate-900 text-sm">{agent.name}</div>
            <div className="text-xs text-slate-400 capitalize">{agent.type.replace("_", " ")}</div>
          </div>
        </div>
        <button
          onClick={() => toggleMutation.mutate()}
          className={cn("transition-colors", agent.enabled ? "text-blue-500" : "text-slate-300")}
          title={agent.enabled ? "Desativar" : "Ativar"}
        >
          {agent.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
        </button>
      </div>

      <p className="text-xs text-slate-500 line-clamp-2">{agent.description}</p>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => navigate(`/agents/${agent.id}/chat`)}
          className="flex-1 flex items-center justify-center gap-1.5 border rounded-lg py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <MessageSquare size={12} />
          Chat
        </button>
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 border rounded-lg py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Edit2 size={12} />
          Editar
        </button>
      </div>
    </div>
  );
}

function AgentModal({ agent, onClose }: { agent?: Agent; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = !!agent;

  const [form, setForm] = useState({
    id: agent?.id ?? "",
    name: agent?.name ?? "",
    emoji: agent?.emoji ?? "🤖",
    description: agent?.description ?? "",
    type: agent?.type ?? "claude_api" as const,
    systemPrompt: agent?.systemPrompt ?? "",
    managedAgentId: agent?.managedAgentId ?? "",
    keywords: agent?.keywords ?? [],
    enabled: agent?.enabled ?? true,
  });

  const mutation = useMutation({
    mutationFn: isEdit
      ? () => agentsApi.update(form.id, form)
      : () => agentsApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">
          {isEdit ? `Editar: ${agent!.name}` : "Novo Agente"}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          {!isEdit && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">ID (único) *</label>
              <input
                value={form.id}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                placeholder="ex: brain-wiki"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nome *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Emoji</label>
            <input
              value={form.emoji}
              onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as typeof form.type }))}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="claude_api">Claude API</option>
            <option value="managed_agent">Managed Agent</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Descrição *</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {form.type === "claude_api" && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">System Prompt</label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              rows={5}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-xs"
              placeholder="És um assistente especializado em..."
            />
          </div>
        )}

        {form.type === "managed_agent" && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Managed Agent ID</label>
            <input
              value={form.managedAgentId}
              onChange={(e) => setForm((f) => ({ ...f, managedAgentId: e.target.value }))}
              placeholder="agent_..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Keywords (separadas por vírgula)</label>
          <input
            value={form.keywords.join(", ")}
            onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) }))}
            placeholder="ex: crm, leads, follow-up"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {isEdit && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="w-4 h-4 border rounded"
            />
            <label htmlFor="enabled" className="text-sm text-slate-600">Ativo</label>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 border rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.name || !form.description || mutation.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm"
          >
            {mutation.isPending ? "A guardar..." : isEdit ? "Guardar" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
