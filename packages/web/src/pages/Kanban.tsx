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

// ─── V3 — paleta pastel suave codificada por coluna ──────────────────────────
//   accent  : cor saturada (barras, ponto, tag)
//   soft    : pastel para chips e backgrounds suaves
//   softer  : pastel ainda mais subtil (chip de follow-up)
//   ink     : cor de texto sobre soft/softer (alto contraste)
const COLUMNS: { id: string; label: string; accent: string; soft: string; softer: string; ink: string }[] = [
  { id: "new",             label: "Novo",            accent: "#3b82f6", soft: "#e8f0fe", softer: "#f3f7fe", ink: "#1e3a8a" },
  { id: "contacted",       label: "Contactado",      accent: "#d4a017", soft: "#fdf4d3", softer: "#fdfaeb", ink: "#7a5a00" },
  { id: "qualified",       label: "Qualificado",     accent: "#8b5cf6", soft: "#ece5fb", softer: "#f6f3fd", ink: "#4c1d95" },
  { id: "visit_scheduled", label: "Visita Agendada", accent: "#ea7c3e", soft: "#fce5d4", softer: "#fdf3eb", ink: "#7c2d12" },
  { id: "proposal",        label: "Proposta",        accent: "#6366f1", soft: "#e3e7fc", softer: "#f1f3fe", ink: "#312e81" },
  { id: "closed_won",      label: "Fechado ✓",       accent: "#10b981", soft: "#d4f0e2", softer: "#ebf8f1", ink: "#065f46" },
  { id: "closed_lost",     label: "Perdido",         accent: "#ef4444", soft: "#fadbd8", softer: "#fdf0ee", ink: "#7f1d1d" },
];

export function Kanban() {
  const queryClient = useQueryClient();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
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
    setLocalStatus((prev) => ({ ...prev, [draggableId]: destination.droppableId }));
    updateMutation.mutate({ id: draggableId, status: destination.droppableId });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">A carregar...</div>;
  }

  const allLeads = leadsData?.data ?? [];
  const byStatus: Record<string, Lead[]> = {};
  for (const col of COLUMNS) byStatus[col.id] = [];
  for (const lead of allLeads) {
    const status = localStatus[lead.id] ?? lead.status;
    if (byStatus[status]) byStatus[status].push({ ...lead, status });
    else byStatus["new"].push({ ...lead, status });
  }

  return (
    <div className="p-3 md:p-5 flex flex-col h-full">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-subtitle">{allLeads.length} leads · clica para ver perfil · arrasta para mover</p>
        </div>
        <button
          onClick={() => { allLeads.forEach((l) => analyzeMutation.mutate(l.id)); }}
          disabled={analyzeMutation.isPending}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 transition-colors disabled:opacity-50"
          style={{ color: "#2c4d46", border: "1px solid #2c4d46", borderRadius: "14px", background: "white" }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#e8efed"}
          onMouseLeave={(e) => e.currentTarget.style.background = "white"}
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
              <div
                key={col.id}
                className="flex flex-col w-60 shrink-0 overflow-hidden"
                style={{ background: "white", borderRadius: "20px", border: "1px solid #ececec" }}
              >
                {/* Top accent bar */}
                <div style={{ height: 4, background: col.accent }} />

                {/* Header */}
                <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
                  <span className="text-xs font-bold" style={{ color: "#2c4d46" }}>{col.label}</span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5"
                    style={{ background: col.softer, color: col.ink, borderRadius: "999px" }}
                  >
                    {colLeads.length}
                  </span>
                </div>

                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="flex-1 min-h-24 p-2.5 space-y-2 transition-colors"
                      style={{
                        background: snapshot.isDraggingOver ? col.softer : "white",
                      }}
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
                                col={col}
                                isDragging={snapshot.isDragging}
                                onClick={() => setSelectedLeadId(lead.id)}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}

                      {colLeads.length === 0 && !snapshot.isDraggingOver && (
                        <div className="text-center py-6 text-xs" style={{ color: "#a8b8b4" }}>
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

// ─── Card V3 — barra lateral colorida 3px + cantos 14px ──────────────────────

function LeadCard({ lead, col, isDragging, onClick }: {
  lead: Lead;
  col: { accent: string; softer: string; ink: string };
  isDragging: boolean;
  onClick: () => void;
}) {
  const dragMoved = useRef(false);

  return (
    <div
      onMouseDown={() => { dragMoved.current = false; }}
      onMouseMove={() => { dragMoved.current = true; }}
      onClick={() => { if (!dragMoved.current) onClick(); }}
      className={cn("cursor-pointer transition-colors text-left w-full select-none relative overflow-hidden")}
      style={{
        background: isDragging ? col.softer : "white",
        border: `1px solid ${isDragging ? col.accent : "#ececec"}`,
        borderRadius: "14px",
        padding: "10px 12px 12px",
      }}
    >
      {/* Side accent bar */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: col.accent }} />

      <div className="flex items-center gap-2 mb-2" style={{ paddingLeft: 4 }}>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
          style={{ background: "#2c4d46" }}
        >
          {(lead.name?.[0] ?? "?").toUpperCase()}
        </div>
        <span className="text-xs font-semibold leading-tight truncate" style={{ color: "#2c4d46" }}>{lead.name}</span>
      </div>

      <div className="space-y-1 mb-2" style={{ paddingLeft: 4 }}>
        {lead.phone && (
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#6b7e7a" }}>
            <Phone size={10} className="shrink-0" />{lead.phone}
          </div>
        )}
        {lead.telegramUsername && (
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#6b7e7a" }}>
            <Send size={10} className="shrink-0" />@{lead.telegramUsername}
          </div>
        )}
        {lead.conversationSummary && (
          <p className="text-[11px] italic line-clamp-2 mt-1" style={{ color: "#94a8a3" }}>{lead.conversationSummary}</p>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t" style={{ paddingLeft: 4, borderColor: "#f0f2f1" }}>
        <span className="text-[10px]" style={{ color: "#a8b8b4" }}>
          {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true, locale: pt })}
        </span>
        {lead.followUpAt && (
          <span
            className="text-[10px] flex items-center gap-1 font-semibold"
            style={{ color: col.ink, background: col.softer, padding: "2px 8px", borderRadius: "999px" }}
          >
            <Calendar size={9} />
            {format(parseISO(lead.followUpAt), "d MMM", { locale: pt })}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Secção de Alertas de Imóveis (mantida — apenas cantos arredondados) ─────

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
        <div className="text-xs font-medium flex items-center gap-1.5" style={{ color: "#8bb5a8" }}>
          <Bell size={11} />
          Alertas de Imóveis
          {alerts.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 font-bold" style={{ background: "#e8efed", color: "#2c4d46", borderRadius: "999px" }}>
              {alerts.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-[10px] flex items-center gap-0.5 transition-colors"
          style={{ color: "#2c4d46" }}
          onMouseEnter={(e) => e.currentTarget.style.color = "#8bb5a8"}
          onMouseLeave={(e) => e.currentTarget.style.color = "#2c4d46"}
        >
          <Plus size={11} />Novo alerta
        </button>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {alerts.map((alert) => (
            <div key={alert.id} className={`flex items-center justify-between p-2 text-xs border ${alert.active ? "border-opacity-100" : "opacity-60"}`}
              style={{ background: alert.active ? "#e8efed" : "#f5f5f5", borderColor: alert.active ? "#2c4d46" : "#e0e0e0", borderRadius: "12px" }}>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate" style={{ color: "#2c4d46" }}>
                  {alert.propertyType} · {alert.zone}
                  {alert.minPrice && alert.maxPrice
                    ? ` · ${alert.minPrice.toLocaleString("pt-PT")}–${alert.maxPrice.toLocaleString("pt-PT")} €`
                    : alert.maxPrice
                    ? ` · até ${alert.maxPrice.toLocaleString("pt-PT")} €`
                    : alert.minPrice
                    ? ` · desde ${alert.minPrice.toLocaleString("pt-PT")} €`
                    : ""}
                </div>
                <div className="text-[10px] mt-0.5 flex flex-wrap gap-x-2" style={{ color: "#8bb5a8" }}>
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
                  className="p-1 transition-colors"
                  style={{ color: alert.active ? "#2c4d46" : "#8bb5a8", borderRadius: "8px" }}
                  title={alert.active ? "Pausar" : "Activar"}
                >
                  {alert.active ? <Bell size={12} /> : <BellOff size={12} />}
                </button>
                <button
                  onClick={() => deleteMutation.mutate(alert.id)}
                  className="p-1 transition-colors"
                  style={{ color: "#8bb5a8", borderRadius: "8px" }}
                  onMouseEnter={(e) => e.currentTarget.style.color = "#e74c3c"}
                  onMouseLeave={(e) => e.currentTarget.style.color = "#8bb5a8"}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="space-y-2 p-3 border" style={{ background: "#e8efed", borderColor: "#2c4d46", borderRadius: "14px" }}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] mb-0.5 block" style={{ color: "#2c4d46" }}>Zona</label>
              <input
                value={form.zone}
                onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
                placeholder="Ex: Oeiras"
                className="input text-xs py-1"
              />
            </div>
            <div>
              <label className="text-[10px] mb-0.5 block" style={{ color: "#2c4d46" }}>Tipologia</label>
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
            <label className="text-[10px] mb-0.5 block" style={{ color: "#2c4d46" }}>Tipo</label>
            <select
              value={form.transactionType}
              onChange={(e) => setForm((f) => ({ ...f, transactionType: e.target.value as "rent" | "buy" }))}
              className="input text-xs py-1"
            >
              <option value="rent">Arrendamento</option>
              <option value="buy">Compra</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] mb-0.5 block" style={{ color: "#2c4d46" }}>Preço mín (€)</label>
              <input
                type="number"
                value={form.minPrice}
                onChange={(e) => setForm((f) => ({ ...f, minPrice: e.target.value }))}
                placeholder="—"
                className="input text-xs py-1"
              />
            </div>
            <div>
              <label className="text-[10px] mb-0.5 block" style={{ color: "#2c4d46" }}>Preço máx (€)</label>
              <input
                type="number"
                value={form.maxPrice}
                onChange={(e) => setForm((f) => ({ ...f, maxPrice: e.target.value }))}
                placeholder="Ex: 600000"
                className="input text-xs py-1"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-[11px] flex items-center gap-1 transition-colors"
            style={{ color: "#8bb5a8" }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#2c4d46"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#8bb5a8"}
          >
            {showAdvanced ? "− Menos filtros" : "+ Mais filtros"}
          </button>

          {showAdvanced && (
            <div className="space-y-2 pt-1 border-t" style={{ borderColor: "#2c4d46" }}>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] mb-0.5 block" style={{ color: "#2c4d46" }}>Área mín (m²)</label>
                  <input
                    type="number"
                    value={form.minArea}
                    onChange={(e) => setForm((f) => ({ ...f, minArea: e.target.value }))}
                    placeholder="—"
                    className="input text-xs py-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] mb-0.5 block" style={{ color: "#2c4d46" }}>Área máx (m²)</label>
                  <input
                    type="number"
                    value={form.maxArea}
                    onChange={(e) => setForm((f) => ({ ...f, maxArea: e.target.value }))}
                    placeholder="—"
                    className="input text-xs py-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] mb-0.5 block" style={{ color: "#2c4d46" }}>Construído a partir de</label>
                <input
                  type="number"
                  value={form.buildYearMin}
                  onChange={(e) => setForm((f) => ({ ...f, buildYearMin: e.target.value }))}
                  placeholder="Ex: 2000"
                  className="input text-xs py-1"
                />
              </div>

              <div>
                <label className="text-[10px] mb-0.5 block" style={{ color: "#2c4d46" }}>Mercado</label>
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

              <div>
                <label className="text-[10px] mb-0.5 block" style={{ color: "#2c4d46" }}>Anunciante</label>
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
            <div className="text-[11px] p-2" style={{ background: "#e8efed", color: "#2c4d46", borderRadius: "10px" }}>
              ✓ Encontrados {testResult.count} anúncios actuais com estes critérios
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => testMutation.mutate()}
              disabled={!form.zone || testMutation.isPending}
              className="flex-1 text-xs py-1.5 transition-colors disabled:opacity-50"
              style={{ color: "#2c4d46", border: "1px solid #2c4d46", background: "transparent", borderRadius: "12px" }}
              onMouseEnter={(e) => !(!form.zone || testMutation.isPending) && (e.currentTarget.style.background = "#e8efed")}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              {testMutation.isPending ? "A testar..." : "Testar"}
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.zone || createMutation.isPending}
              className="flex-1 text-xs py-1.5 text-white transition-colors disabled:opacity-50"
              style={{ background: "#2c4d46", borderRadius: "12px" }}
              onMouseEnter={(e) => !(!form.zone || createMutation.isPending) && (e.currentTarget.style.background = "#1f3a35")}
              onMouseLeave={(e) => e.currentTarget.style.background = "#2c4d46"}
            >
              {createMutation.isPending ? "A criar..." : "Criar Alerta"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modal de perfil (cantos arredondados, lógica intacta) ───────────────────

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
      <div
        className="w-96 h-full bg-white shadow-2xl flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200"
        style={{ borderTopLeftRadius: "20px", borderBottomLeftRadius: "20px" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#e8efed" }}>
          <h2 className="font-semibold text-sm" style={{ color: "#2c4d46" }}>Perfil do Lead</h2>
          <button onClick={onClose} className="transition-colors" style={{ color: "#8bb5a8" }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#2c4d46"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#8bb5a8"}
          >
            <X size={18} />
          </button>
        </div>

        {!lead ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">A carregar...</div>
        ) : (
          <>
            <div className="p-5 border-b text-center" style={{ borderColor: "#e8efed" }}>
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3"
                style={{ background: "#2c4d46" }}
              >
                {(lead.name?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="font-semibold" style={{ color: "#2c4d46" }}>{lead.name}</div>
              {lead.telegramUsername && (
                <div className="text-xs mt-0.5 flex items-center justify-center gap-1" style={{ color: "#8bb5a8" }}>
                  <Send size={10} />@{lead.telegramUsername}
                </div>
              )}
              <div className="mt-2">
                <LeadStatusBadge status={lead.status} />
              </div>
            </div>

            <div className="px-5 py-3 border-b space-y-2" style={{ borderColor: "#e8efed" }}>
              {lead.phone && (
                <div className="flex items-center gap-2 text-sm" style={{ color: "#6b7e7a" }}>
                  <Phone size={13} style={{ color: "#8bb5a8" }} />{lead.phone}
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-2 text-sm" style={{ color: "#6b7e7a" }}>
                  <Mail size={13} style={{ color: "#8bb5a8" }} />{lead.email}
                </div>
              )}
              {!lead.phone && !lead.email && (
                <p className="text-xs" style={{ color: "#8bb5a8" }}>Sem contactos registados</p>
              )}
            </div>

            <div className="px-5 py-3 border-b" style={{ borderColor: "#e8efed" }}>
              <div className="text-xs font-medium mb-1.5" style={{ color: "#2c4d46" }}>Fase do Funil</div>
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

            <div className="px-5 py-3 border-b" style={{ borderColor: "#e8efed" }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-medium flex items-center gap-1.5" style={{ color: "#2c4d46" }}>
                  <Calendar size={11} style={{ color: "#8bb5a8" }} />Follow-up
                </div>
                <button
                  onClick={() => setShowFollowUpForm((v) => !v)}
                  className="text-[10px] flex items-center gap-0.5 transition-colors"
                  style={{ color: "#2c4d46" }}
                >
                  {showFollowUpForm ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {followUpDate ? "Alterar" : "Agendar"}
                </button>
              </div>
              {followUpDate && !showFollowUpForm && (
                <div className="p-2 text-xs" style={{ background: "#e8efed", borderRadius: "12px" }}>
                  <div className="font-medium" style={{ color: "#2c4d46" }}>
                    {format(followUpDate, "d MMM yyyy · HH:mm", { locale: pt })}
                  </div>
                  {lead.followUpNote && (
                    <p className="mt-0.5 leading-relaxed" style={{ color: "#8bb5a8" }}>{lead.followUpNote}</p>
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
                    className="w-full text-xs py-1.5 text-white transition-colors disabled:opacity-50"
                    style={{ background: "#2c4d46", borderRadius: "12px" }}
                  >
                    {scheduleFollowUpMutation.isPending ? "A agendar..." : "Agendar Follow-up"}
                  </button>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-b" style={{ borderColor: "#e8efed" }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-medium flex items-center gap-1.5" style={{ color: "#2c4d46" }}>
                  <FileText size={11} style={{ color: "#8bb5a8" }} />Resumo
                </div>
                <button
                  onClick={() => summarizeMutation.mutate()}
                  disabled={summarizeMutation.isPending}
                  className="text-[10px] transition-colors"
                  style={{ color: "#8bb5a8" }}
                >
                  {summarizeMutation.isPending ? "A gerar..." : "Atualizar"}
                </button>
              </div>
              {lead.conversationSummary ? (
                <p className="text-xs leading-relaxed p-2" style={{ background: "#e8efed", color: "#6b7e7a", borderRadius: "12px" }}>
                  {lead.conversationSummary}
                </p>
              ) : (
                <button
                  onClick={() => summarizeMutation.mutate()}
                  disabled={summarizeMutation.isPending}
                  className="w-full text-xs py-1.5 transition-colors disabled:opacity-50"
                  style={{ background: "transparent", border: "1px solid #e8efed", color: "#2c4d46", borderRadius: "12px" }}
                >
                  {summarizeMutation.isPending ? "A gerar..." : "Gerar Resumo"}
                </button>
              )}
            </div>

            <div className="px-5 py-3 border-b" style={{ borderColor: "#e8efed" }}>
              <button
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
                className="w-full flex items-center justify-center gap-2 text-xs font-medium py-2 px-3 transition-colors disabled:opacity-50"
                style={{ background: "transparent", border: "1px solid #2c4d46", color: "#2c4d46", borderRadius: "12px" }}
              >
                <Brain size={12} />
                {analyzeMutation.isPending ? "A analisar..." : "Analisar com IA"}
              </button>
              {analyzeMutation.data && (
                <div className="mt-2 text-xs p-2" style={{ background: "#e8efed", color: "#2c4d46", borderRadius: "12px" }}>
                  <div className="font-medium">
                    {analyzeMutation.data.changed
                      ? `✓ Movido para: ${analyzeMutation.data.stage}`
                      : `Fase correta: ${analyzeMutation.data.stage}`}
                  </div>
                  <div className="mt-0.5 leading-relaxed" style={{ color: "#8bb5a8" }}>{analyzeMutation.data.reasoning}</div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 flex-1">
              <div className="text-xs font-medium mb-2" style={{ color: "#2c4d46" }}>Actividades</div>
              {lead.activities.length === 0 ? (
                <p className="text-xs" style={{ color: "#8bb5a8" }}>Sem actividades</p>
              ) : (
                <div className="space-y-3">
                  {lead.activities.slice(0, 8).map((act) => (
                    <div key={act.id} className="flex gap-2">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "#8bb5a8" }} />
                      <div>
                        <p className="text-xs leading-snug" style={{ color: "#6b7e7a" }}>{act.description}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: "#8bb5a8" }}>
                          {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true, locale: pt })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <PropertyAlertsSection leadId={leadId} />

            <div className="px-5 py-3 border-t" style={{ borderColor: "#e8efed" }}>
              {confirmDelete ? (
                <div className="space-y-2">
                  <p className="text-xs text-center" style={{ color: "#6b7e7a" }}>Eliminar este lead e todo o histórico?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 text-xs py-1.5 transition-colors"
                      style={{ background: "transparent", border: "1px solid #e8efed", color: "#2c4d46", borderRadius: "12px" }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                      className="flex-1 text-xs py-1.5 text-white transition-colors disabled:opacity-50"
                      style={{ background: "#e74c3c", borderRadius: "12px" }}
                    >
                      {deleteMutation.isPending ? "A eliminar..." : "Confirmar"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 transition-colors"
                  style={{ background: "transparent", border: "1px solid transparent", color: "#e74c3c", borderRadius: "12px" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#c0392b"; e.currentTarget.style.background = "#fadbd8"; e.currentTarget.style.borderColor = "#f5b7b1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#e74c3c"; e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
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
