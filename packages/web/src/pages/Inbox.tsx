import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { conversationsApi, leadsApi, type Conversation, type Message } from "@/lib/api";
import { LeadStatusBadge, ALL_STATUSES } from "@/components/LeadStatusBadge";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { MessageSquare, Phone, Mail, Send, Search, Brain, Calendar, FileText, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Inbox() {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState("");
  const queryClient = useQueryClient();

  const { data: convs = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => conversationsApi.list(),
    refetchInterval: 30_000,
  });

  const { data: activeConv } = useQuery({
    queryKey: ["conversation", selected],
    queryFn: () => conversationsApi.get(selected!),
    enabled: !!selected,
    refetchInterval: selected ? 20_000 : false,
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => conversationsApi.send(selected!, message),
    onMutate: async (message: string) => {
      // Optimistic update — mostra a mensagem imediatamente
      await queryClient.cancelQueries({ queryKey: ["conversation", selected] });
      const previous = queryClient.getQueryData(["conversation", selected]);
      queryClient.setQueryData(["conversation", selected], (old: { messages?: Message[] } | undefined) => {
        if (!old) return old;
        const optimistic: Message = {
          id: `opt-${Date.now()}`,
          conversationId: selected!,
          agentId: null,
          role: "assistant",
          content: message,
          createdAt: new Date().toISOString(),
        };
        return { ...old, messages: [...(old.messages ?? []), optimistic] };
      });
      return { previous };
    },
    onError: (_err, _msg, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["conversation", selected], context.previous);
      }
    },
    onSuccess: () => {
      setCompose("");
      queryClient.invalidateQueries({ queryKey: ["conversation", selected] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const handleSend = () => {
    const msg = compose.trim();
    if (!msg || !selected || sendMutation.isPending) return;
    setCompose(""); // limpa input imediatamente
    sendMutation.mutate(msg);
  };

  const filtered = convs.filter((c) => {
    if (!search) return true;
    const name = (c.lead?.name ?? c.telegramFirstName ?? "").toLowerCase();
    const username = (c.telegramUsername ?? "").toLowerCase();
    return name.includes(search.toLowerCase()) || username.includes(search.toLowerCase());
  });

  return (
    <div className="flex h-full">
      {/* ── Coluna 1: Lista de conversas ─────────────────────────────── */}
      <div className="w-72 border-r border-gray-100 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-semibold text-gray-800">Inbox</h1>
            <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">{convs.length}</span>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar..."
              className="input pl-8 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-gray-400 text-xs">A carregar...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-xs text-gray-400">Sem conversas</p>
            </div>
          ) : (
            filtered.map((conv) => (
              <ConvItem
                key={conv.id}
                conv={conv}
                isActive={selected === conv.id}
                onClick={() => setSelected(conv.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Coluna 2: Mensagens ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <MessageSquare size={44} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Seleciona uma conversa</p>
            </div>
          </div>
        ) : activeConv ? (
          <>
            {/* Header */}
            <div className="px-5 py-3 bg-white border-b border-gray-100 flex items-center gap-3">
              <Avatar name={activeConv.lead?.name ?? activeConv.telegramFirstName ?? "?"} size="md" />
              <div className="flex-1">
                <div className="font-semibold text-sm text-gray-800">
                  {activeConv.lead?.name ?? activeConv.telegramFirstName ?? `Chat ${activeConv.telegramChatId}`}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {activeConv.telegramUsername && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Send size={10} />@{activeConv.telegramUsername}
                    </span>
                  )}
                  {activeConv.lead && <LeadStatusBadge status={activeConv.lead.status} />}
                </div>
              </div>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {activeConv.messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              {activeConv.messages.length === 0 && (
                <div className="text-center text-gray-400 text-xs py-8">Sem mensagens — envia a primeira mensagem abaixo</div>
              )}
            </div>

            {/* Barra de composição */}
            <div className="px-4 py-3 bg-white border-t border-gray-100">
              <div className="flex items-end gap-2">
                <textarea
                  value={compose}
                  onChange={(e) => setCompose(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Escreve uma mensagem... (Enter para enviar, Shift+Enter para nova linha)"
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
                  style={{ maxHeight: 120, overflowY: "auto" }}
                />
                <button
                  onClick={handleSend}
                  disabled={!compose.trim() || sendMutation.isPending}
                  className="flex items-center justify-center w-9 h-9 rounded-xl text-white transition-colors disabled:opacity-40 shrink-0"
                  style={{ background: "var(--sidebar-bg)" }}
                  title="Enviar mensagem"
                >
                  <Send size={15} />
                </button>
              </div>
              {sendMutation.isError && (
                <p className="text-[11px] text-red-500 mt-1.5">
                  Erro ao enviar. Verifica se o bot está activo.
                </p>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* ── Coluna 3: Info do lead ────────────────────────────────────── */}
      <div className="w-64 border-l border-gray-100 bg-white flex flex-col">
        {activeConv?.lead ? (
          <LeadPanel leadId={activeConv.lead.id} onDeleted={() => setSelected(null)} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-300 text-xs p-6 text-center">
            Seleciona uma conversa para ver o perfil do lead
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function ConvItem({ conv, isActive, onClick }: {
  conv: Conversation; isActive: boolean; onClick: () => void;
}) {
  const name = conv.lead?.name ?? conv.telegramFirstName ?? `Chat ${conv.telegramChatId}`;
  const preview = conv.lastMessage?.content?.slice(0, 55) ?? "Sem mensagens";
  const isUserMsg = conv.lastMessage?.role === "user";
  const time = conv.updatedAt
    ? formatDistanceToNow(new Date(conv.updatedAt), { locale: pt })
    : "";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors",
        isActive && "bg-blue-50 border-l-2 border-l-blue-500"
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar name={name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-sm font-medium text-gray-800 truncate">{name}</span>
            <span className="text-[11px] text-gray-400 shrink-0">{time}</span>
          </div>
          <p className={cn("text-xs truncate mt-0.5", isUserMsg ? "text-gray-700 font-medium" : "text-gray-400")}>
            {!isUserMsg && "🤖 "}{preview}
          </p>
          {conv.lead && (
            <div className="mt-1.5">
              <LeadStatusBadge status={conv.lead.status} />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-start" : "justify-end")}>
      <div className={cn(
        "max-w-[70%] px-4 py-2.5 rounded-2xl text-sm",
        isUser
          ? "bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm"
          : "text-white rounded-tr-sm"
      )}
        style={!isUser ? { background: "var(--sidebar-bg)" } : {}}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        <p className={cn("text-[11px] mt-1.5 opacity-60", isUser ? "text-gray-400" : "text-white/70 text-right")}>
          {format(new Date(msg.createdAt), "HH:mm · d MMM", { locale: pt })}
        </p>
      </div>
    </div>
  );
}

function LeadPanel({ leadId, onDeleted }: { leadId: string; onDeleted?: () => void }) {
  const queryClient = useQueryClient();
  const [followUpText, setFollowUpText] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: lead } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => leadsApi.get(leadId),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => leadsApi.analyze(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (error) => window.alert(`Erro ao analisar: ${error.message}`),
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) => leadsApi.update(leadId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) => window.alert(`Erro ao atualizar fase: ${error.message}`),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (error) => window.alert(`Erro ao gerar resumo: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => leadsApi.delete(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      onDeleted?.();
    },
    onError: (error) => window.alert(`Erro ao eliminar lead: ${error.message}`),
  });

  if (!lead) return <div className="p-4 text-xs text-gray-400">A carregar...</div>;

  const hasFollowUp = !!lead.followUpAt;
  const followUpDate = hasFollowUp ? parseISO(lead.followUpAt!) : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Avatar + nome */}
      <div className="p-4 border-b border-gray-100 text-center">
        <Avatar name={lead.name} size="lg" className="mx-auto mb-2" />
        <div className="font-semibold text-sm text-gray-800">{lead.name}</div>
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
      <div className="p-3 border-b border-gray-100 space-y-2">
        {lead.phone && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Phone size={12} className="text-gray-400" />{lead.phone}
          </div>
        )}
        {lead.email && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Mail size={12} className="text-gray-400" />{lead.email}
          </div>
        )}
        {!lead.phone && !lead.email && (
          <p className="text-xs text-gray-400">Sem contactos registados</p>
        )}
      </div>

      {/* Estado */}
      <div className="p-3 border-b border-gray-100">
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
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
            <Calendar size={11} className="text-orange-400" />
            Follow-up
          </div>
          <button
            onClick={() => setShowFollowUpForm((v) => !v)}
            className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
          >
            {showFollowUpForm ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {hasFollowUp ? "Alterar" : "Agendar"}
          </button>
        </div>

        {/* Existing follow-up */}
        {hasFollowUp && !showFollowUpForm && (
          <div className="bg-orange-50 rounded-lg p-2 text-xs">
            <div className="font-medium text-orange-700">
              {format(followUpDate!, "d MMM yyyy · HH:mm", { locale: pt })}
            </div>
            {lead.followUpNote && (
              <p className="text-orange-500 mt-0.5 leading-relaxed">{lead.followUpNote}</p>
            )}
          </div>
        )}

        {/* Scheduler form */}
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
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              <Calendar size={11} />
              {scheduleFollowUpMutation.isPending ? "A agendar..." : "Agendar Follow-up"}
            </button>
            {scheduleFollowUpMutation.data && (
              <div className="text-[11px] text-green-600 bg-green-50 rounded p-1.5">
                ✓ Agendado para {scheduleFollowUpMutation.data.followUpFormatted}
              </div>
            )}
            {scheduleFollowUpMutation.isError && (
              <div className="text-[11px] text-red-500 bg-red-50 rounded p-1.5">
                Erro ao agendar. Tenta novamente.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resumo da Conversa */}
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
            <FileText size={11} className="text-blue-400" />
            Resumo
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
          <p className="text-[11px] text-gray-600 leading-relaxed bg-blue-50 rounded-lg p-2">
            {lead.conversationSummary}
          </p>
        ) : (
          <button
            onClick={() => summarizeMutation.mutate()}
            disabled={summarizeMutation.isPending}
            className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 px-3 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            <FileText size={11} />
            {summarizeMutation.isPending ? "A gerar resumo..." : "Gerar Resumo"}
          </button>
        )}
      </div>

      {/* IA Classifier */}
      <div className="p-3 border-b border-gray-100">
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

      {/* Actividades recentes */}
      <div className="p-3 flex-1">
        <div className="text-xs font-medium text-gray-500 mb-2">Actividades</div>
        {lead.activities.length === 0 ? (
          <p className="text-xs text-gray-400">Sem actividades</p>
        ) : (
          <div className="space-y-2">
            {lead.activities.slice(0, 6).map((act) => (
              <div key={act.id} className="flex gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-gray-600 leading-snug">{act.description}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true, locale: pt })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Eliminar lead */}
      <div className="p-3 border-t border-gray-100 mt-auto">
        {confirmDelete ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-600 text-center">Eliminar este lead e todo o histórico?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex-1 text-xs py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? "A eliminar..." : "Confirmar"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 px-3 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors"
          >
            <Trash2 size={12} />
            Eliminar Lead
          </button>
        )}
      </div>
    </div>
  );
}

function Avatar({ name, size = "sm", className = "" }: {
  name: string; size?: "sm" | "md" | "lg"; className?: string;
}) {
  const sizes = { sm: "w-9 h-9 text-sm", md: "w-10 h-10 text-sm", lg: "w-14 h-14 text-lg" };
  const colors = ["bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500", "bg-pink-500"];
  const colorIndex = name.charCodeAt(0) % colors.length;
  return (
    <div className={cn(`${sizes[size]} ${colors[colorIndex]} rounded-full flex items-center justify-center text-white font-semibold shrink-0`, className)}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}
