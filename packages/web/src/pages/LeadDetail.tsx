import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { leadsApi, type Lead } from "@/lib/api";
import { LeadStatusBadge, ALL_STATUSES } from "@/components/LeadStatusBadge";
import { formatDistanceToNow, format } from "date-fns";
import { pt } from "date-fns/locale";
import { ArrowLeft, Phone, Mail, Send, Activity, MessageSquare, Calendar, FileText, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"activities" | "messages">("activities");

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
    },
  });

  if (isLoading) return <div className="p-8 text-sm text-slate-500">A carregar...</div>;
  if (!lead) return <div className="p-8 text-sm text-red-500">Lead não encontrado.</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/leads")}
          className="text-slate-400 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">{lead.name}</h1>
            <LeadStatusBadge status={lead.status} />
          </div>
          <p className="text-sm text-slate-500">
            Lead desde {format(new Date(lead.createdAt), "d 'de' MMMM yyyy", { locale: pt })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Info card */}
        <div className="col-span-1 space-y-4">
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Informação</h2>

            {lead.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone size={14} className="text-slate-400" />
                <span>{lead.phone}</span>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail size={14} className="text-slate-400" />
                <span>{lead.email}</span>
              </div>
            )}
            {lead.telegramUsername && (
              <div className="flex items-center gap-2 text-sm">
                <Send size={14} className="text-slate-400" />
                <span>@{lead.telegramUsername}</span>
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-500 mb-1">Estado</label>
              <select
                value={lead.status}
                onChange={(e) => updateMutation.mutate({ status: e.target.value })}
                className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ALL_STATUSES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {lead.followUpAt && (
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={14} className="text-slate-400" />
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Próximo Follow-up</h2>
              </div>
              <p className="text-sm text-slate-700">
                {format(new Date(lead.followUpAt), "d 'de' MMMM 'às' HH:mm", { locale: pt })}
              </p>
              {lead.followUpNote && (
                <p className="text-xs text-slate-500 mt-2 italic">"{lead.followUpNote}"</p>
              )}
            </div>
          )}

          {lead.conversationSummary && (
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={14} className="text-slate-400" />
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Resumo da Conversa</h2>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{lead.conversationSummary}</p>
            </div>
          )}

          {lead.propertyAlerts && lead.propertyAlerts.length > 0 && (
            <div className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Home size={14} className="text-slate-400" />
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Alertas de Imóveis</h2>
              </div>
              <div className="space-y-2">
                {lead.propertyAlerts.map((alert) => (
                  <div key={alert.id} className="text-sm border-l-2 border-blue-300 pl-3 py-1">
                    <p className="font-medium text-slate-700">{alert.zone}</p>
                    <p className="text-xs text-slate-500">
                      {alert.propertyType} • {alert.transactionType === "buy" ? "Compra" : "Arrendamento"}
                      {alert.maxPrice && ` • até ${alert.maxPrice.toLocaleString("pt-PT")} €`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {lead.notes && (
            <div className="bg-white rounded-xl border p-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Notas</h2>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}
        </div>

        {/* Timeline / Messages */}
        <div className="col-span-2 bg-white rounded-xl border">
          <div className="flex border-b">
            <TabButton
              active={activeTab === "activities"}
              onClick={() => setActiveTab("activities")}
              icon={<Activity size={14} />}
              label="Actividades"
            />
            <TabButton
              active={activeTab === "messages"}
              onClick={() => setActiveTab("messages")}
              icon={<MessageSquare size={14} />}
              label="Mensagens Telegram"
            />
          </div>

          <div className="p-4 overflow-y-auto max-h-[500px]">
            {activeTab === "activities" ? (
              lead.activities.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Sem actividades</p>
              ) : (
                <div className="space-y-3">
                  {lead.activities.map((act) => (
                    <div key={act.id} className="flex gap-3 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                      <div>
                        <p className="text-slate-700">{act.description}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true, locale: pt })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              messages.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Sem mensagens</p>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn("flex", msg.role === "user" ? "justify-start" : "justify-end")}
                    >
                      <div className={cn(
                        "max-w-sm px-3 py-2 rounded-xl text-sm",
                        msg.role === "user" ? "bg-slate-100 text-slate-800" : "bg-blue-600 text-white"
                      )}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <p className={cn("text-xs mt-1 opacity-60", msg.role === "assistant" ? "text-blue-200" : "text-slate-400")}>
                          {format(new Date(msg.createdAt), "HH:mm · d MMM", { locale: pt })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void;
  icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
        active
          ? "border-blue-500 text-blue-600"
          : "border-transparent text-slate-500 hover:text-slate-700"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
