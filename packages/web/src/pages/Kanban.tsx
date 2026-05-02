import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { leadsApi, propertyAlertsApi, type Lead } from "@/lib/api";
import {
  DragDropContext, Droppable, Draggable, type DropResult
} from "@hello-pangea/dnd";
import { Phone, Mail, Send, Brain, X, Calendar, FileText, ChevronDown, ChevronUp, Trash2, Bell, BellOff, Plus } from "lucide-react";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { LeadStatusBadge, ALL_STATUSES } from "@/components/LeadStatusBadge";

const COLUMNS: { id: string; label: string; color: string; bg: string }[] = [
  { id: "new",             label: "Novo",            color: "#3498db", bg: "#ebf5fb" },
  { id: "contacted",       label: "Contactado",      color: "#f39c12", bg: "#fef9e7" },
  { id: "qualified",       label: "Qualificado",     color: "#9b59b6", bg: "#f5eef8" },
  { id: "visit_scheduled", label: "Visita Agendada", color: "#e67e22", bg: "#fef0e7" },
  { id: "proposal",        label: "Proposta",        color: "#1abc9c", bg: "#e8f8f5" },
  { id: "closed_won",      label: "Fechado ✓",       color: "#2ecc71", bg: "#eafaf1" },
  { id: "closed_lost",     label: "Perdido",         color: "#e74c3c", bg: "#fdedec" },
];

export function Kanban() {
  const queryClient = useQueryClient();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  // Optimistic local status overrides
  const [localStatus, setLocalStatus] = useState<Record<string, string>>({});

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ["leads", "", ""],
    queryFn: () => leadsApi.list({ page: 1 }),
    refetchInterval: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      leadsApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (_, { id }) => {
      // Reverte optimistic update em caso de erro
      setLocalStatus((prev) => { const n = { ...prev }; delete n[id]; return n; });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: (leadId: string) => leadsApi.analyze(leadId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
    onError: (error) => window.alert(`Erro ao analisar: ${error.message}`),
  });

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination, source } = result;
    if (destination.droppableId === source.droppableId) return;

    // Optimistic update imediato
    setLocalStatus((prev) => ({ ...prev, [draggableId]: destination.droppableId }));
    updateMutation.mutate({ id: draggableId, status: destination.droppableId });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">A carregar...</div>;
  }

  const allLeads = leadsData?.data ?? [];

  // Agrupa leads por status (com overrides locais)
  const byStatus: Record<string, Lead[]> = {};
  for (const col of COLUMNS) byStatus[col.id] = [];
  for (const lead of allLeads) {
    const status = localStatus[lead.id] ?? lead.status;
    if (byStatus[status]) byStatus[status].push({ ...lead, status });
    else byStatus["new"].push({ ...lead, status });
  }

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="page-header">
        <div>
          <h1 className="page-title">Kanban</h1>
          <p className="page-subtitle">{allLeads.length} leads · clica para ver perfil · arrasta para mover</p>
        </div>
        <button
          onClick={() => {
            allLeads.forEach((l) => analyzeMutation.mutate(l.id));
          }}
          disabled={analyzeMutation.isPending}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors disabled:opacity-50"
        >
          <Brain size={13} />
          {analyzeMutation.isPending ? "A analisar..." : "Analisar todos com IA"}
        </button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 flex-1">
          {COLUMNS.map((col) => {
            const colLeads = byStatus[col.id] ?? [];
            return (
              <div key={col.id} className="flex flex-col w-60 shrink-0">
                <div
                  className="flex items-center justify-between px-3 py-2.5 rounded-t-lg border-t-2"
                  style={{ borderColor: col.color, background: col.bg }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: col.color }}>
                      {col.label}
                    </span>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                      style={{ background: col.color }}
                    >
                      {colLeads.length}
                    </span>
                  </div>
                </div>

                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "flex-1 min-h-24 p-2 space-y-2 rounded-b-lg border border-t-0 transition-colors",
                        snapshot.isDraggingOver ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-100"
                      )}
                    >
                      {colLeads.map((lead, index) => (
                        <Draggable key={lead.id} draggableId={lead.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <LeadCard
                                lead={lead}
                                isDragging={snapshot.isDragging}
                                onClick={() => setSelectedLeadId(lead.id)}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}

                      {colLeads.length === 0 && !snapshot.isDraggingOver && (
                        <div className="text-center py-6 text-gray-300 text-xs">
                          Arrasta um lead aqui
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Modal de perfil */}
      {selectedLeadId && (
        <LeadModal
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onDeleted={() => setSelectedLeadId(null)}
        />
      )}
    </div>
  );
}

// ─── Secção de Alertas de Imóveis ─────────────────────────────────────────────

function PropertyAlertsSection({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const initialForm = {
    zone: "", propertyType: "T2", transactionType: "rent" as "rent" | "buy",
    maxPrice: "", minPrice: "",
    minArea: "", maxArea: "",
    buildYearMin: "",
    market: "" as "" | "primary" | "secondary",
    ownerType: "" as "" | "agency" | "private",
  };
  const [form, setForm] = useState(initialForm);
  const [testResult, setTestResult] = useState<{ count: number } | null>(null);

  const buildPayload = () => ({
    zone: form.zone,
    propertyType: form.propertyType,
    transactionType: form.transactionType,
    maxPrice: form.maxPrice ? Number(form.maxPrice) : undefined,
    minPrice: form.minPrice ? Number(form.minPrice) : undefined,
    minArea: form.minArea ? Number(form.minArea) : undefined,
    maxArea: form.maxArea ? Number(form.maxArea) : undefined,
    buildYearMin: form.buildYearMin ? Number(form.buildYearMin) : undefined,
    market: form.market || null,
    ownerType: form.ownerType || null,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["property-alerts", leadId],
    queryFn: () => propertyAlertsApi.list(leadId),
  });

  const createMutation = useMutation({
    mutationFn: () => propertyAlertsApi.create(leadId, buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-alerts", leadId] });
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["property-listings"] });
      queryClient.invalidateQueries({ queryKey: ["all-property-alerts"] });
      setShowForm(false);
      setForm(initialForm);
      setShowAdvanced(false);
      setTestResult(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (alertId: string) => propertyAlertsApi.delete(alertId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["property-alerts", leadId] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ alertId, active }: { alertId: string; active: boolean }) =>
      propertyAlertsApi.toggle(alertId, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["property-alerts", leadId] }),
  });

  const testMutation = useMutation({
    mutationFn: () => propertyAlertsApi.test(leadId, buildPayload()),
    onSuccess: (data) => setTestResult(data),
  });

  return (
    <div className="px-5 py-3 border-b border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
          <Bell size={11} className="text-blue-400" />
          Alertas de Imóveis
          {alerts.length > 0 && (
            <span className="bg-blue-100 text-blue-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {alerts.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
        >
          <Plus size={11} />Novo alerta
        </button>
      </div>

      {/* Alertas existentes */}
      {alerts.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {alerts.map((alert) => (
            <div key={alert.id} className={`flex items-center justify-between p-2 rounded-lg text-xs border ${alert.active ? "bg-blue-50 border-blue-100" : "bg-gray-50 border-gray-100 opacity-60"}`}>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-700 truncate">
                  {alert.propertyType} · {alert.zone}
                  {alert.minPrice && alert.maxPrice
                    ? ` · ${alert.minPrice.toLocaleString("pt-PT")}–${alert.maxPrice.toLocaleString("pt-PT")} €`
                    : alert.maxPrice
                    ? ` · até ${alert.maxPrice.toLocaleString("pt-PT")} €`
                    : alert.minPrice
                    ? ` · desde ${alert.minPrice.toLocaleString("pt-PT")} €`
                    : ""}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
                  <span>{alert.transactionType === "rent" ? "Arrendamento" : "Compra"}</span>
                  {(alert.minArea || alert.maxArea) && (
                    <span>
                      {alert.minArea && alert.maxArea
                        ? `${alert.minArea}–${alert.maxArea} m²`
                        : alert.minArea
                        ? `≥ ${alert.minArea} m²`
                        : `≤ ${alert.maxArea} m²`}
                    </span>
                  )}
                  {alert.buildYearMin && <span>≥ {alert.buildYearMin}</span>}
                  {alert.market === "primary" && <span>Novo</span>}
                  {alert.market === "secondary" && <span>Usado</span>}
                  {alert.ownerType === "agency" && <span>Agências</span>}
                  {alert.ownerType === "private" && <span>Particulares</span>}
                  {alert.lastCheckedAt && (
                    <span>
                      verificado {new Date(alert.lastCheckedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => toggleMutation.mutate({ alertId: alert.id, active: !alert.active })}
                  className={`p-1 rounded transition-colors ${alert.active ? "text-blue-500 hover:text-blue-700" : "text-gray-400 hover:text-gray-600"}`}
                  title={alert.active ? "Pausar" : "Activar"}
                >
                  {alert.active ? <Bell size={12} /> : <BellOff size={12} />}
                </button>
                <button
                  onClick={() => deleteMutation.mutate(alert.id)}
                  className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formulário de novo alerta */}
      {showForm && (
        <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 mb-0.5 block">Zona</label>
              <input
                value={form.zone}
                onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
                placeholder="Ex: Oeiras"
                className="input text-xs py-1"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 mb-0.5 block">Tipologia</label>
              <select
                value={form.propertyType}
                onChange={(e) => setForm((f) => ({ ...f, propertyType: e.target.value }))}
                className="input text-xs py-1"
              >
                {["T0","T1","T2","T3","T4+"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 mb-0.5 block">Tipo</label>
            <select
              value={form.transactionType}
              onChange={(e) => setForm((f) => ({ ...f, transactionType: e.target.value as "rent" | "buy" }))}
              className="input text-xs py-1"
            >
              <option value="rent">Arrendamento</option>
              <option value="buy">Compra</option>
            </select>
          </div>

          {/* Preço */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 mb-0.5 block">Preço mín (€)</label>
              <input
                type="number"
                value={form.minPrice}
                onChange={(e) => setForm((f) => ({ ...f, minPrice: e.target.value }))}
                placeholder="—"
                className="input text-xs py-1"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 mb-0.5 block">Preço máx (€)</label>
              <input
                type="number"
                value={form.maxPrice}
                onChange={(e) => setForm((f) => ({ ...f, maxPrice: e.target.value }))}
                placeholder="Ex: 600000"
                className="input text-xs py-1"
              />
            </div>
          </div>

          {/* Toggle filtros avançados */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-[11px] text-gray-500 hover:text-blue-500 flex items-center gap-1"
          >
            {showAdvanced ? "− Menos filtros" : "+ Mais filtros"}
          </button>

          {showAdvanced && (
            <div className="space-y-2 pt-1 border-t border-gray-200">
              {/* Área */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 mb-0.5 block">Área mín (m²)</label>
                  <input
                    type="number"
                    value={form.minArea}
                    onChange={(e) => setForm((f) => ({ ...f, minArea: e.target.value }))}
                    placeholder="—"
                    className="input text-xs py-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-0.5 block">Área máx (m²)</label>
                  <input
                    type="number"
                    value={form.maxArea}
                    onChange={(e) => setForm((f) => ({ ...f, maxArea: e.target.value }))}
                    placeholder="—"
                    className="input text-xs py-1"
                  />
                </div>
              </div>

              {/* Ano construção */}
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">Construído a partir de</label>
                <input
                  type="number"
                  value={form.buildYearMin}
                  onChange={(e) => setForm((f) => ({ ...f, buildYearMin: e.target.value }))}
                  placeholder="Ex: 2000"
                  className="input text-xs py-1"
                />
              </div>

              {/* Mercado */}
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">Mercado</label>
                <select
                  value={form.market}
                  onChange={(e) => setForm((f) => ({ ...f, market: e.target.value as "" | "primary" | "secondary" }))}
                  className="input text-xs py-1"
                >
                  <option value="">Qualquer</option>
                  <option value="primary">Novo (mercado primário)</option>
                  <option value="secondary">Usado (mercado secundário)</option>
                </select>
              </div>

              {/* Anunciante */}
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">Anunciante</label>
                <select
                  value={form.ownerType}
                  onChange={(e) => setForm((f) => ({ ...f, ownerType: e.target.value as "" | "agency" | "private" }))}
                  className="input text-xs py-1"
                >
                  <option value="">Qualquer</option>
                  <option value="agency">Apenas agências</option>
                  <option value="private">Apenas particulares</option>
                </select>
              </div>

              <p className="text-[10px] text-gray-400 italic">
                Filtros avançados aplicam-se apenas ao Imovirtual.
              </p>
            </div>
          )}

          {testResult && (
            <div className="text-[11px] text-blue-700 bg-blue-50 rounded p-2">
              ✓ Encontrados {testResult.count} anúncios actuais com estes critérios
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => testMutation.mutate()}
              disabled={!form.zone || testMutation.isPending}
              className="flex-1 text-xs py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors"
            >
              {testMutation.isPending ? "A testar..." : "Testar"}
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.zone || createMutation.isPending}
              className="flex-1 text-xs py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? "A criar..." : "Criar Alerta"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function LeadCard({ lead, isDragging, onClick }: {
  lead: Lead;
  isDragging: boolean;
  onClick: () => void;
}) {
  const dragMoved = useRef(false);

  return (
    <div
      onMouseDown={() => { dragMoved.current = false; }}
      onMouseMove={() => { dragMoved.current = true; }}
      onClick={() => { if (!dragMoved.current) onClick(); }}
      className={cn(
        "bg-white rounded-lg border p-3 cursor-pointer transition-shadow text-left w-full select-none",
        isDragging ? "shadow-lg border-blue-200 rotate-1 cursor-grabbing" : "shadow-sm border-gray-100 hover:shadow-md hover:border-blue-200"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ background: `hsl(${(lead.name?.[0]?.charCodeAt(0) ?? 0) * 5}, 60%, 50%)` }}
        >
          {(lead.name?.[0] ?? "?").toUpperCase()}
        </div>
        <span className="text-xs font-semibold text-gray-800 leading-tight truncate">{lead.name}</span>
      </div>

      <div className="space-y-1 mb-2">
        {lead.phone && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Phone size={10} className="shrink-0" />{lead.phone}
          </div>
        )}
        {lead.telegramUsername && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Send size={10} className="shrink-0" />@{lead.telegramUsername}
          </div>
        )}
        {lead.conversationSummary && (
          <p className="text-[11px] text-gray-400 italic line-clamp-2 mt-1">{lead.conversationSummary}</p>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
        <span className="text-[10px] text-gray-400">
          {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true, locale: pt })}
        </span>
        {lead.followUpAt && (
          <span className="text-[10px] text-orange-500 flex items-center gap-0.5">
            <Calendar size={9} />
            {format(parseISO(lead.followUpAt), "d MMM", { locale: pt })}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Modal de perfil ──────────────────────────────────────────────────────────

function LeadModal({ leadId, onClose, onDeleted }: {
  leadId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [followUpText, setFollowUpText] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: lead } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => leadsApi.get(leadId),
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) => leadsApi.update(leadId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (error) => window.alert(`Erro ao atualizar fase: ${error.message}`),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => leadsApi.analyze(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (error) => window.alert(`Erro ao analisar: ${error.message}`),
  });

  const scheduleFollowUpMutation = useMutation({
    mutationFn: () => leadsApi.scheduleFollowUp(leadId, followUpText, followUpNote || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setFollowUpText("");
      setFollowUpNote("");
      setShowFollowUpForm(false);
    },
    onError: (error) => window.alert(`Erro ao agendar follow-up: ${error.message}`),
  });

  const summarizeMutation = useMutation({
    mutationFn: () => leadsApi.summarize(leadId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead", leadId] }),
    onError: (error) => window.alert(`Erro ao gerar resumo: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => leadsApi.delete(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      onDeleted();
    },
    onError: (error) => window.alert(`Erro ao eliminar lead: ${error.message}`),
  });

  const followUpDate = lead?.followUpAt ? parseISO(lead.followUpAt) : null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-96 h-full bg-white shadow-2xl flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-sm">Perfil do Lead</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {!lead ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">A carregar...</div>
        ) : (
          <>
            {/* Avatar + nome */}
            <div className="p-5 border-b border-gray-100 text-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3"
                style={{ background: `hsl(${(lead.name?.[0]?.charCodeAt(0) ?? 0) * 5}, 60%, 50%)` }}
              >
                {(lead.name?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="font-semibold text-gray-800">{lead.name}</div>
              {lead.telegramUsername && (
                <div className="text-xs text-gray-400 mt-0.5 flex items-center justify-center gap-1">
                  <Send size={10} />@{lead.telegramUsername}
                </div>
              )}
              <div className="mt-2">
                <LeadStatusBadge status={lead.status} />
              </div>
            </div>

            {/* Contactos */}
            <div className="px-5 py-3 border-b border-gray-100 space-y-2">
              {lead.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone size={13} className="text-gray-400" />{lead.phone}
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail size={13} className="text-gray-400" />{lead.email}
                </div>
              )}
              {!lead.phone && !lead.email && (
                <p className="text-xs text-gray-400">Sem contactos registados</p>
              )}
            </div>

            {/* Fase do Funil */}
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="text-xs font-medium text-gray-500 mb-1.5">Fase do Funil</div>
              <select
                value={lead.status}
                onChange={(e) => updateStatus.mutate(e.target.value)}
                className="input text-xs py-1.5"
              >
                {ALL_STATUSES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Follow-up */}
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                  <Calendar size={11} className="text-orange-400" />Follow-up
                </div>
                <button
                  onClick={() => setShowFollowUpForm((v) => !v)}
                  className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                >
                  {showFollowUpForm ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {followUpDate ? "Alterar" : "Agendar"}
                </button>
              </div>
              {followUpDate && !showFollowUpForm && (
                <div className="bg-orange-50 rounded-lg p-2 text-xs">
                  <div className="font-medium text-orange-700">
                    {format(followUpDate, "d MMM yyyy · HH:mm", { locale: pt })}
                  </div>
                  {lead.followUpNote && (
                    <p className="text-orange-500 mt-0.5 leading-relaxed">{lead.followUpNote}</p>
                  )}
                </div>
              )}
              {showFollowUpForm && (
                <div className="space-y-2">
                  <input
                    value={followUpText}
                    onChange={(e) => setFollowUpText(e.target.value)}
                    placeholder="Ex: 1 semana, 3 meses, 15/06/2025..."
                    className="input text-xs py-1.5"
                  />
                  <input
                    value={followUpNote}
                    onChange={(e) => setFollowUpNote(e.target.value)}
                    placeholder="Nota (opcional)"
                    className="input text-xs py-1.5"
                  />
                  <button
                    onClick={() => scheduleFollowUpMutation.mutate()}
                    disabled={!followUpText.trim() || scheduleFollowUpMutation.isPending}
                    className="w-full text-xs py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
                  >
                    {scheduleFollowUpMutation.isPending ? "A agendar..." : "Agendar Follow-up"}
                  </button>
                </div>
              )}
            </div>

            {/* Resumo */}
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                  <FileText size={11} className="text-blue-400" />Resumo
                </div>
                <button
                  onClick={() => summarizeMutation.mutate()}
                  disabled={summarizeMutation.isPending}
                  className="text-[10px] text-blue-500 hover:text-blue-700"
                >
                  {summarizeMutation.isPending ? "A gerar..." : "Atualizar"}
                </button>
              </div>
              {lead.conversationSummary ? (
                <p className="text-xs text-gray-600 leading-relaxed bg-blue-50 rounded-lg p-2">
                  {lead.conversationSummary}
                </p>
              ) : (
                <button
                  onClick={() => summarizeMutation.mutate()}
                  disabled={summarizeMutation.isPending}
                  className="w-full text-xs py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  {summarizeMutation.isPending ? "A gerar..." : "Gerar Resumo"}
                </button>
              )}
            </div>

            {/* IA */}
            <div className="px-5 py-3 border-b border-gray-100">
              <button
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
                className="w-full flex items-center justify-center gap-2 text-xs font-medium py-2 px-3 rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors disabled:opacity-50"
              >
                <Brain size={12} />
                {analyzeMutation.isPending ? "A analisar..." : "Analisar com IA"}
              </button>
              {analyzeMutation.data && (
                <div className="mt-2 text-xs bg-purple-50 rounded-lg p-2 text-purple-700">
                  <div className="font-medium">
                    {analyzeMutation.data.changed
                      ? `✓ Movido para: ${analyzeMutation.data.stage}`
                      : `Fase correta: ${analyzeMutation.data.stage}`}
                  </div>
                  <div className="text-purple-500 mt-0.5 leading-relaxed">{analyzeMutation.data.reasoning}</div>
                </div>
              )}
            </div>

            {/* Actividades */}
            <div className="px-5 py-3 flex-1">
              <div className="text-xs font-medium text-gray-500 mb-2">Actividades</div>
              {lead.activities.length === 0 ? (
                <p className="text-xs text-gray-400">Sem actividades</p>
              ) : (
                <div className="space-y-3">
                  {lead.activities.slice(0, 8).map((act) => (
                    <div key={act.id} className="flex gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-xs text-gray-600 leading-snug">{act.description}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true, locale: pt })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Alertas de Imóveis */}
            <PropertyAlertsSection leadId={leadId} />

            {/* Eliminar */}
            <div className="px-5 py-3 border-t border-gray-100">
              {confirmDelete ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 text-center">Eliminar este lead e todo o histórico?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? "A eliminar..." : "Confirmar"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors"
                >
                  <Trash2 size={12} />Eliminar Lead
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
