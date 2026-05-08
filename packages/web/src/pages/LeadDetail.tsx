import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  leadsApi, propertyAlertsApi, type Lead, type PropertyAlertInput,
} from "@/lib/api";
import { LeadStatusBadge, ALL_STATUSES } from "@/components/LeadStatusBadge";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import {
  ArrowLeft, Phone, Mail, Send, Activity, MessageSquare,
  Calendar, FileText, Brain, Trash2, Bell, BellOff, Plus,
  ChevronDown, ChevronUp, Pencil, Check, X, Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"activities" | "messages" | "alerts">("activities");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Partial<Lead>>({});
  const [followUpText, setFollowUpText] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);

  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => leadsApi.get(id!),
    enabled: !!id,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["lead-messages", id],
    queryFn: () => leadsApi.messages(id!),
    enabled: !!id && activeTab === "messages",
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Lead>) => leadsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setEditingField(null);
    },
    onError: (err) => window.alert(`Erro ao guardar: ${err.message}`),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => leadsApi.analyze(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err) => window.alert(`Erro ao analisar: ${err.message}`),
  });

  const summarizeMutation = useMutation({
    mutationFn: () => leadsApi.summarize(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead", id] }),
    onError: (err) => window.alert(`Erro ao resumir: ${err.message}`),
  });

  const scheduleFollowUpMutation = useMutation({
    mutationFn: () => leadsApi.scheduleFollowUp(id!, followUpText, followUpNote || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setFollowUpText("");
      setFollowUpNote("");
      setShowFollowUpForm(false);
    },
    onError: (err) => window.alert(`Erro ao agendar follow-up: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => leadsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      navigate("/leads");
    },
    onError: (err) => window.alert(`Erro ao eliminar: ${err.message}`),
  });

  const startEdit = (field: string, value: string) => {
    setEditingField(field);
    setFieldValues({ [field]: value });
  };

  const saveField = (field: keyof Lead) => {
    updateMutation.mutate({ [field]: fieldValues[field] ?? "" });
  };

  if (isLoading) return <div className="p-8 text-sm text-slate-500">A carregar...</div>;
  if (!lead) return <div className="p-8 text-sm text-red-500">Lead não encontrado.</div>;

  const followUpDate = lead.followUpAt ? parseISO(lead.followUpAt) : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b bg-white shrink-0">
        <button
          onClick={() => navigate("/leads")}
          className="text-slate-400 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ background: "#2c4d46" }}
          >
            {(lead.name?.[0] ?? "?").toUpperCase()}
          </div>
          {editingField === "name" ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={fieldValues.name ?? ""}
                onChange={(e) => setFieldValues({ name: e.target.value })}
                className="border rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
              />
              <button onClick={() => saveField("name")} className="text-green-600 hover:text-green-700"><Check size={15} /></button>
              <button onClick={() => setEditingField(null)} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-slate-900">{lead.name}</h1>
              <button onClick={() => startEdit("name", lead.name)} className="text-slate-300 hover:text-slate-500"><Pencil size={13} /></button>
            </div>
          )}
          <LeadStatusBadge status={lead.status} />
        </div>
        <span className="text-xs text-slate-400">
          Lead desde {format(new Date(lead.createdAt), "d MMM yyyy", { locale: pt })}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left panel ───────────────────────────────────────── */}
        <div className="w-72 shrink-0 border-r bg-white overflow-y-auto">

          {/* Contactos */}
          <Section title="Contactos">
            <EditableField
              icon={<Phone size={13} className="text-slate-400" />}
              label="Telefone"
              value={lead.phone ?? ""}
              editing={editingField === "phone"}
              editValue={fieldValues.phone ?? ""}
              onEdit={() => startEdit("phone", lead.phone ?? "")}
              onChange={(v) => setFieldValues({ phone: v })}
              onSave={() => saveField("phone")}
              onCancel={() => setEditingField(null)}
              placeholder="+351 ..."
            />
            <EditableField
              icon={<Mail size={13} className="text-slate-400" />}
              label="Email"
              value={lead.email ?? ""}
              editing={editingField === "email"}
              editValue={fieldValues.email ?? ""}
              onEdit={() => startEdit("email", lead.email ?? "")}
              onChange={(v) => setFieldValues({ email: v })}
              onSave={() => saveField("email")}
              onCancel={() => setEditingField(null)}
              placeholder="email@..."
            />
            {lead.telegramUsername && (
              <div className="flex items-center gap-2 text-xs text-slate-600 py-1">
                <Send size={13} className="text-slate-400" />
                @{lead.telegramUsername}
              </div>
            )}
          </Section>

          {/* Fase do Funil */}
          <Section title="Fase do Funil">
            <select
              value={lead.status}
              onChange={(e) => updateMutation.mutate({ status: e.target.value })}
              className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
            >
              {ALL_STATUSES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Section>

          {/* Follow-up */}
          <Section title="Follow-up" action={
            <button
              onClick={() => setShowFollowUpForm((v) => !v)}
              className="text-[10px] flex items-center gap-0.5 text-slate-500 hover:text-slate-700"
            >
              {showFollowUpForm ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {followUpDate ? "Alterar" : "Agendar"}
            </button>
          }>
            {followUpDate && !showFollowUpForm && (
              <div className="rounded-lg p-2 text-xs bg-slate-50 border">
                <div className="font-medium text-slate-700">
                  {format(followUpDate, "d MMM yyyy · HH:mm", { locale: pt })}
                </div>
                {lead.followUpNote && (
                  <p className="mt-0.5 text-slate-500 leading-relaxed">{lead.followUpNote}</p>
                )}
              </div>
            )}
            {showFollowUpForm && (
              <div className="space-y-2">
                <input
                  value={followUpText}
                  onChange={(e) => setFollowUpText(e.target.value)}
                  placeholder="Ex: 1 semana, 15/06/2025..."
                  className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                />
                <input
                  value={followUpNote}
                  onChange={(e) => setFollowUpNote(e.target.value)}
                  placeholder="Nota (opcional)"
                  className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => scheduleFollowUpMutation.mutate()}
                  disabled={!followUpText.trim() || scheduleFollowUpMutation.isPending}
                  className="w-full py-1.5 rounded-lg text-xs text-white font-medium disabled:opacity-50 transition-colors"
                  style={{ background: "#2c4d46" }}
                >
                  {scheduleFollowUpMutation.isPending ? "A agendar..." : "Agendar Follow-up"}
                </button>
              </div>
            )}
          </Section>

          {/* Notas */}
          <Section title="Notas" action={
            editingField !== "notes" ? (
              <button onClick={() => startEdit("notes", lead.notes ?? "")} className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5">
                <Pencil size={10} /> Editar
              </button>
            ) : undefined
          }>
            {editingField === "notes" ? (
              <div className="space-y-1.5">
                <textarea
                  autoFocus
                  value={fieldValues.notes ?? ""}
                  onChange={(e) => setFieldValues({ notes: e.target.value })}
                  rows={4}
                  className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 resize-none"
                />
                <div className="flex gap-1.5">
                  <button onClick={() => saveField("notes")} className="flex-1 py-1 rounded-lg text-xs text-white" style={{ background: "#2c4d46" }}>Guardar</button>
                  <button onClick={() => setEditingField(null)} className="flex-1 py-1 rounded-lg text-xs border text-slate-600">Cancelar</button>
                </div>
              </div>
            ) : (
              lead.notes
                ? <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{lead.notes}</p>
                : <p className="text-xs text-slate-400 italic">Sem notas</p>
            )}
          </Section>

          {/* Resumo IA */}
          <Section title="Resumo" action={
            <button
              onClick={() => summarizeMutation.mutate()}
              disabled={summarizeMutation.isPending}
              className="text-[10px] text-slate-400 hover:text-slate-600 disabled:opacity-50"
            >
              {summarizeMutation.isPending ? "A gerar..." : lead.conversationSummary ? "Atualizar" : "Gerar"}
            </button>
          }>
            {lead.conversationSummary ? (
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-lg p-2 border">{lead.conversationSummary}</p>
            ) : (
              <p className="text-xs text-slate-400 italic">Sem resumo</p>
            )}
          </Section>

          {/* IA */}
          <Section title="Inteligência Artificial">
            <button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <Brain size={13} />
              {analyzeMutation.isPending ? "A analisar..." : "Analisar com IA"}
            </button>
            {analyzeMutation.data && (
              <div className="mt-2 text-xs rounded-lg p-2 bg-blue-50 border border-blue-100 text-slate-700">
                <div className="font-medium">
                  {analyzeMutation.data.changed
                    ? `✓ Movido para: ${analyzeMutation.data.stage}`
                    : `Fase correta: ${analyzeMutation.data.stage}`}
                </div>
                <p className="mt-0.5 text-slate-500 leading-relaxed">{analyzeMutation.data.reasoning}</p>
              </div>
            )}
          </Section>

          {/* Eliminar */}
          <div className="px-4 py-3 border-t mt-auto">
            {confirmDelete ? (
              <div className="space-y-2">
                <p className="text-xs text-center text-slate-600">Eliminar este lead e todo o histórico?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 py-1.5 rounded-lg text-xs border text-slate-600 hover:bg-slate-50">
                    Cancelar
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="flex-1 py-1.5 rounded-lg text-xs text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? "..." : "Confirmar"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Trash2 size={12} /> Eliminar Lead
              </button>
            )}
          </div>
        </div>

        {/* ── Right panel ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          {/* Tabs */}
          <div className="flex border-b bg-white shrink-0">
            <TabBtn active={activeTab === "activities"} onClick={() => setActiveTab("activities")} icon={<Activity size={13} />} label="Actividades" />
            <TabBtn active={activeTab === "messages"} onClick={() => setActiveTab("messages")} icon={<MessageSquare size={13} />} label="Mensagens" />
            <TabBtn active={activeTab === "alerts"} onClick={() => setActiveTab("alerts")} icon={<Home size={13} />} label="Alertas de Imóveis" />
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === "activities" && (
              lead.activities.length === 0 ? (
                <EmptyState>Sem actividades</EmptyState>
              ) : (
                <div className="space-y-3">
                  {lead.activities.map((act) => (
                    <div key={act.id} className="flex gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-slate-700 text-sm leading-snug">{act.description}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true, locale: pt })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === "messages" && (
              messages.length === 0 ? (
                <EmptyState>Sem mensagens Telegram</EmptyState>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-start" : "justify-end")}>
                      <div className={cn(
                        "max-w-sm px-3 py-2 rounded-xl text-sm shadow-sm",
                        msg.role === "user" ? "bg-white text-slate-800 border" : "bg-blue-600 text-white"
                      )}>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        <p className={cn("text-xs mt-1 opacity-60", msg.role === "assistant" ? "text-blue-200" : "text-slate-400")}>
                          {format(new Date(msg.createdAt), "HH:mm · d MMM", { locale: pt })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === "alerts" && id && (
              <PropertyAlertsPanel leadId={id} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children, action }: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 border-b">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Editable field ───────────────────────────────────────────────────────────

function EditableField({ icon, label, value, editing, editValue, onEdit, onChange, onSave, onCancel, placeholder }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  editing: boolean;
  editValue: string;
  onEdit: () => void;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  if (editing) {
    return (
      <div className="flex items-center gap-1.5 py-1">
        {icon}
        <input
          autoFocus
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-blue-500"
        />
        <button onClick={onSave} className="text-green-600 hover:text-green-700"><Check size={13} /></button>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 py-1 group">
      {icon}
      <span className="flex-1 text-xs text-slate-600">{value || <span className="text-slate-400 italic">{label} não definido</span>}</span>
      <button onClick={onEdit} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-500 transition-opacity">
        <Pencil size={11} />
      </button>
    </div>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
        active ? "border-blue-500 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
      )}
    >
      {icon}{label}
    </button>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400 text-center py-12">{children}</p>;
}

// ─── Property Alerts Panel ────────────────────────────────────────────────────

function PropertyAlertsPanel({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const initialForm = {
    zone: "", propertyType: "T2", transactionType: "rent" as "rent" | "buy",
    maxPrice: "", minPrice: "", minArea: "", maxArea: "", buildYearMin: "",
    market: "" as "" | "primary" | "secondary",
    ownerType: "" as "" | "agency" | "private",
  };
  const [form, setForm] = useState(initialForm);
  const [testResult, setTestResult] = useState<{ count: number } | null>(null);

  const buildPayload = (): PropertyAlertInput => ({
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
      setShowForm(false); setForm(initialForm); setShowAdvanced(false); setTestResult(null);
    },
    onError: (err) => window.alert(`Erro ao criar alerta: ${(err as Error).message}`),
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
    onError: (err) => window.alert(`Erro ao testar: ${(err as Error).message}`),
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Bell size={14} className="text-slate-400" />
          Alertas de Imóveis
          {alerts.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600">{alerts.length}</span>
          )}
        </h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          <Plus size={13} /> Novo alerta
        </button>
      </div>

      {/* Alertas existentes */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-xl border text-sm",
                alert.active ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200 opacity-60"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-700">
                  {alert.propertyType} · {alert.zone}
                  {alert.maxPrice && ` · até ${alert.maxPrice.toLocaleString("pt-PT")} €`}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                  <span>{alert.transactionType === "rent" ? "Arrendamento" : "Compra"}</span>
                  {alert.minArea && <span>≥ {alert.minArea} m²</span>}
                  {alert.maxArea && <span>≤ {alert.maxArea} m²</span>}
                  {alert.buildYearMin && <span>≥ {alert.buildYearMin}</span>}
                  {alert.market === "primary" && <span>Novo</span>}
                  {alert.market === "secondary" && <span>Usado</span>}
                  {alert.lastCheckedAt && (
                    <span className="text-slate-400">
                      verificado {new Date(alert.lastCheckedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-3">
                <button
                  onClick={() => toggleMutation.mutate({ alertId: alert.id, active: !alert.active })}
                  className={cn("p-1.5 rounded-lg transition-colors", alert.active ? "text-blue-600 hover:bg-blue-50" : "text-slate-400 hover:bg-slate-100")}
                  title={alert.active ? "Pausar" : "Activar"}
                >
                  {alert.active ? <Bell size={14} /> : <BellOff size={14} />}
                </button>
                <button
                  onClick={() => { if (window.confirm("Eliminar este alerta?")) deleteMutation.mutate(alert.id); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {alerts.length === 0 && !showForm && (
        <div className="text-center py-10 text-slate-400 text-sm">
          <Bell size={28} className="mx-auto mb-2 opacity-30" />
          Sem alertas. Cria um para monitorizar imóveis nos portais.
        </div>
      )}

      {/* Formulário novo alerta */}
      {showForm && (
        <div className="rounded-xl border bg-white p-4 space-y-3 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Zona</label>
              <input value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
                placeholder="Ex: Lisboa" className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipologia</label>
              <select value={form.propertyType} onChange={(e) => setForm((f) => ({ ...f, propertyType: e.target.value }))}
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500">
                {["T0","T1","T2","T3","T4+"].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
            <select value={form.transactionType} onChange={(e) => setForm((f) => ({ ...f, transactionType: e.target.value as "rent" | "buy" }))}
              className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500">
              <option value="rent">Arrendamento</option>
              <option value="buy">Compra</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Preço mín (€)</label>
              <input type="number" value={form.minPrice} onChange={(e) => setForm((f) => ({ ...f, minPrice: e.target.value }))}
                placeholder="—" className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Preço máx (€)</label>
              <input type="number" value={form.maxPrice} onChange={(e) => setForm((f) => ({ ...f, maxPrice: e.target.value }))}
                placeholder="—" className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          <button onClick={() => setShowAdvanced((v) => !v)} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
            {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showAdvanced ? "Menos filtros" : "Mais filtros"}
          </button>

          {showAdvanced && (
            <div className="space-y-3 pt-2 border-t">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Área mín (m²)</label>
                  <input type="number" value={form.minArea} onChange={(e) => setForm((f) => ({ ...f, minArea: e.target.value }))}
                    placeholder="—" className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Área máx (m²)</label>
                  <input type="number" value={form.maxArea} onChange={(e) => setForm((f) => ({ ...f, maxArea: e.target.value }))}
                    placeholder="—" className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Construído a partir de</label>
                <input type="number" value={form.buildYearMin} onChange={(e) => setForm((f) => ({ ...f, buildYearMin: e.target.value }))}
                  placeholder="Ex: 2000" className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Mercado</label>
                  <select value={form.market} onChange={(e) => setForm((f) => ({ ...f, market: e.target.value as "" | "primary" | "secondary" }))}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500">
                    <option value="">Qualquer</option>
                    <option value="primary">Novo</option>
                    <option value="secondary">Usado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Anunciante</label>
                  <select value={form.ownerType} onChange={(e) => setForm((f) => ({ ...f, ownerType: e.target.value as "" | "agency" | "private" }))}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500">
                    <option value="">Qualquer</option>
                    <option value="agency">Agências</option>
                    <option value="private">Particulares</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {testResult && (
            <div className="text-xs rounded-lg p-2 bg-green-50 border border-green-200 text-green-800">
              ✓ Encontrados {testResult.count} anúncios actuais com estes critérios
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={() => { setShowForm(false); setForm(initialForm); setTestResult(null); }}
              className="flex-1 py-2 rounded-lg text-sm border text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button onClick={() => testMutation.mutate()} disabled={!form.zone || testMutation.isPending}
              className="flex-1 py-2 rounded-lg text-sm border border-blue-300 text-blue-600 hover:bg-blue-50 disabled:opacity-50">
              {testMutation.isPending ? "A testar..." : "Testar"}
            </button>
            <button onClick={() => createMutation.mutate()} disabled={!form.zone || createMutation.isPending}
              className="flex-1 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50 transition-colors"
              style={{ background: "#2c4d46" }}>
              {createMutation.isPending ? "A criar..." : "Criar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
