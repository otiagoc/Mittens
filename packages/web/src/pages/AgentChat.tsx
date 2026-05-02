import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "@/lib/api";
import { ArrowLeft, Send, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function AgentChat() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ["agent", id],
    queryFn: () => agentsApi.list().then((agents) => agents.find((a) => a.id === id)),
    enabled: !!id,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading || !id) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await agentsApi.chat(id, userMsg.content, history);
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: res.text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "❌ Erro ao contactar o agente. Tenta novamente.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (agentLoading) return <div className="p-8 text-sm text-slate-500">A carregar...</div>;
  if (!agent) return <div className="p-8 text-sm text-red-500">Agente não encontrado.</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-white flex items-center gap-3">
        <button
          onClick={() => navigate("/agents")}
          className="text-slate-400 hover:text-slate-700"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="text-2xl">{agent.emoji}</div>
        <div className="flex-1">
          <div className="font-semibold text-sm text-slate-900">{agent.name}</div>
          <div className="text-xs text-slate-500">Chat direto · Sessão local (não guardada)</div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-slate-400 hover:text-red-500 transition-colors"
            title="Limpar conversa"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {messages.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <div className="text-4xl mb-3">{agent.emoji}</div>
            <p className="text-sm font-medium text-slate-500">{agent.name}</p>
            <p className="text-xs mt-1">Envia uma mensagem para começar</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-md px-3 py-2 rounded-2xl text-sm",
              msg.role === "user"
                ? "bg-blue-600 text-white rounded-tr-sm"
                : "bg-white border text-slate-800 rounded-tl-sm"
            )}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className={cn(
                "text-xs mt-1 opacity-60",
                msg.role === "user" ? "text-blue-100 text-right" : "text-slate-400"
              )}>
                {msg.timestamp.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border px-3 py-2 rounded-2xl rounded-tl-sm flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-slate-400" />
              <span className="text-sm text-slate-500">{agent.emoji} a pensar...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t bg-white">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder={`Mensagem para ${agent.name}...`}
            disabled={loading}
            className="flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1.5 text-center">
          Esta conversa não é guardada na base de dados
        </p>
      </div>
    </div>
  );
}
