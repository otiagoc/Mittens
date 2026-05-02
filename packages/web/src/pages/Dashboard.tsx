import { useQuery } from "@tanstack/react-query";
import { dashboardApi, type FollowUpLead } from "@/lib/api";
import { Users, MessageSquare, Bot, TrendingUp, Calendar, Phone, AlertCircle, Send } from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { LeadStatusBadge } from "@/components/LeadStatusBadge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

const STAGE_COLORS: Record<string, string> = {
  new: "#3498db",
  contacted: "#f39c12",
  qualified: "#9b59b6",
  visit_scheduled: "#e67e22",
  proposal: "#1abc9c",
  closed_won: "#2ecc71",
  closed_lost: "#e74c3c",
};

const STAGE_LABELS: Record<string, string> = {
  new: "Novos",
  contacted: "Contactados",
  qualified: "Qualificados",
  visit_scheduled: "Visita Agendada",
  proposal: "Proposta",
  closed_won: "Fechados ✓",
  closed_lost: "Perdidos",
};

export function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: dashboardApi.stats,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        A carregar...
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Leads",
      value: stats?.totalLeads ?? 0,
      icon: Users,
      color: "#3498db",
      bg: "#ebf5fb",
      change: `+${stats?.newToday ?? 0} hoje`,
    },
    {
      label: "Novos Hoje",
      value: stats?.newToday ?? 0,
      icon: TrendingUp,
      color: "#2ecc71",
      bg: "#eafaf1",
      change: "novos leads",
    },
    {
      label: "Conversas",
      value: stats?.totalConversations ?? 0,
      icon: MessageSquare,
      color: "#9b59b6",
      bg: "#f5eef8",
      change: "activas",
    },
    {
      label: "Agentes Ativos",
      value: stats?.activeAgents ?? 0,
      icon: Bot,
      color: "#e67e22",
      bg: "#fef9e7",
      change: "disponíveis",
    },
  ];

  // Dados para o gráfico de funil
  const funnelData = (stats?.leadsByStatus ?? []).map(({ status, count }) => ({
    name: STAGE_LABELS[status] ?? status,
    value: Number(count),
    fill: STAGE_COLORS[status] ?? "#95a5a6",
  }));

  // Gera os últimos 6 meses como eixo (mesmo que sem dados)
  const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: MONTH_NAMES[d.getMonth()] };
  });

  const leadsMap = Object.fromEntries(
    (stats?.monthlyLeads ?? []).map(({ month, count }) => [month, Number(count)])
  );
  const messagesMap = Object.fromEntries(
    (stats?.monthlyMessages ?? []).map(({ month, count }) => [month, Number(count)])
  );

  const growthData = last6Months.map(({ key, label }) => ({
    mes: label,
    leads: leadsMap[key] ?? 0,
    mensagens: messagesMap[key] ?? 0,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Visão geral da plataforma D&D Group</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg, change }) => (
          <div key={label} className="card p-5 hover:-translate-y-0.5 transition-transform">
            <div className="flex items-center justify-between mb-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: bg }}
              >
                <Icon size={20} style={{ color }} />
              </div>
              <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: bg, color }}>
                {change}
              </span>
            </div>
            <div className="text-3xl font-bold text-gray-800">{value}</div>
            <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar chart — crescimento */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Actividade — Últimos 6 Meses</h2>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#3498db" }} />
                Leads
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#2ecc71" }} />
                Mensagens
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={growthData} barSize={14} barCategoryGap="30%">
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", fontSize: 12 }}
                cursor={{ fill: "#f9fafb" }}
              />
              <Bar dataKey="leads" name="Leads" fill="#3498db" radius={[3, 3, 0, 0]} />
              <Bar dataKey="mensagens" name="Mensagens" fill="#2ecc71" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart — funil */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Leads por Fase</h2>
          {funnelData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-xs">
              Sem dados ainda
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={funnelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {funnelData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", fontSize: 12 }}
                />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom row — funil + follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funil detalhado */}
        {funnelData.length > 0 && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Funil de Vendas</h2>
            <div className="space-y-3">
              {funnelData.sort((a, b) => b.value - a.value).map(({ name, value, fill }) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: fill }} />
                  <span className="text-sm text-gray-600 w-40 shrink-0">{name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (value / Math.max(stats?.totalLeads ?? 1, 1)) * 100)}%`,
                        background: fill,
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-6 text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Follow-ups de hoje */}
        <FollowUpWidget leads={stats?.followUpsToday ?? []} />
      </div>
    </div>
  );
}

function FollowUpWidget({ leads }: { leads: FollowUpLead[] }) {
  const navigate = useNavigate();
  const overdue = leads.filter((l) => l.followUpAt && isPast(parseISO(l.followUpAt)) && !isToday(parseISO(l.followUpAt)));
  const today = leads.filter((l) => l.followUpAt && isToday(parseISO(l.followUpAt)));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Calendar size={15} className="text-orange-500" />
          Follow-ups
        </h2>
        {leads.length > 0 && (
          <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
            {leads.length} pendente{leads.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {leads.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Calendar size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-xs">Sem follow-ups agendados</p>
        </div>
      ) : (
        <div className="space-y-2">
          {overdue.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium mb-1">
              <AlertCircle size={12} />
              {overdue.length} em atraso
            </div>
          )}
          {leads.slice(0, 6).map((lead) => {
            const isOverdue = isPast(parseISO(lead.followUpAt)) && !isToday(parseISO(lead.followUpAt));
            return (
              <button
                key={lead.id}
                onClick={() => navigate(`/leads/${lead.id}`)}
                className="w-full text-left flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
                  style={{ background: isOverdue ? "#e74c3c" : "#e67e22" }}
                >
                  {(lead.name?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-800 truncate">{lead.name}</span>
                    <span className={`text-[10px] shrink-0 font-medium ${isOverdue ? "text-red-500" : "text-orange-500"}`}>
                      {isToday(parseISO(lead.followUpAt))
                        ? "hoje"
                        : format(parseISO(lead.followUpAt), "d MMM", { locale: pt })}
                    </span>
                  </div>
                  {lead.followUpNote && (
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">{lead.followUpNote}</p>
                  )}
                  {lead.telegramUsername && (
                    <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                      <Send size={9} />@{lead.telegramUsername}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
