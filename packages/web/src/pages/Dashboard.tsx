import { useQuery } from "@tanstack/react-query";
import { dashboardApi, type FollowUpLead } from "@/lib/api";
import { Users, Sparkles, Trophy, TrendingUp, Calendar, AlertCircle, Send } from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

// ─── V3 — paleta pastel codificada por fase (mesma do Pipeline) ──────────────
const STAGE_PALETTE: Record<string, { label: string; accent: string; soft: string; softer: string; ink: string }> = {
  new:             { label: "Novo",            accent: "#3b82f6", soft: "#e8f0fe", softer: "#f3f7fe", ink: "#1e3a8a" },
  contacted:       { label: "Contactado",      accent: "#d4a017", soft: "#fdf4d3", softer: "#fdfaeb", ink: "#7a5a00" },
  qualified:       { label: "Qualificado",     accent: "#8b5cf6", soft: "#ece5fb", softer: "#f6f3fd", ink: "#4c1d95" },
  visit_scheduled: { label: "Visita Agendada", accent: "#ea7c3e", soft: "#fce5d4", softer: "#fdf3eb", ink: "#7c2d12" },
  proposal:        { label: "Proposta",        accent: "#6366f1", soft: "#e3e7fc", softer: "#f1f3fe", ink: "#312e81" },
  closed_won:      { label: "Fechado",         accent: "#10b981", soft: "#d4f0e2", softer: "#ebf8f1", ink: "#065f46" },
  closed_lost:     { label: "Perdido",         accent: "#ef4444", soft: "#fadbd8", softer: "#fdf0ee", ink: "#7f1d1d" },
};

const stagePal = (s: string) =>
  STAGE_PALETTE[s] ?? { label: s, accent: "#94a8a3", soft: "#eef0ef", softer: "#f5f6f5", ink: "#2c4d46" };

// ─── Section card wrapper (cantos 20px) ──────────────────────────────────────
function SectionCard({
  title, subtitle, action, children, padding = 18,
}: {
  title?: string; subtitle?: string; action?: React.ReactNode;
  children: React.ReactNode; padding?: number;
}) {
  return (
    <section
      style={{
        background: "white", borderRadius: 20, border: "1px solid #ececec",
        padding, display: "flex", flexDirection: "column", gap: 14, minWidth: 0,
      }}
    >
      {(title || action) && (
        <header className="flex justify-between items-start gap-3">
          <div>
            {title && <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#2c4d46" }}>{title}</h2>}
            {subtitle && (
              <p style={{ margin: "2px 0 0", fontSize: 10, color: "#6b7e7a", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>
                {subtitle}
              </p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

// ─── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, delta, accent, soft, ink, icon: Icon,
}: {
  label: string; value: string | number; delta?: string;
  accent: string; soft: string; ink: string;
  icon: React.ComponentType<{ size?: number }>;
}) {
  return (
    <div
      style={{
        background: "white", borderRadius: 20, padding: "16px 18px",
        border: "1px solid #ececec", overflow: "hidden", position: "relative",
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
      <div className="flex justify-between items-start" style={{ paddingLeft: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7e7a", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </span>
        <div style={{
          width: 30, height: 30, borderRadius: 10, background: soft, color: ink,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon size={14} />
        </div>
      </div>
      <div className="flex items-baseline gap-2" style={{ paddingLeft: 4 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: "#2c4d46", letterSpacing: "-0.02em", lineHeight: 1 }}>
          {value}
        </span>
        {delta && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
            background: soft, color: ink,
          }}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
export function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: dashboardApi.stats,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">A carregar...</div>;
  }

  const totalLeads = stats?.totalLeads ?? 0;
  const newToday = stats?.newToday ?? 0;
  const totalConv = stats?.totalConversations ?? 0;
  const closedWon = (stats?.leadsByStatus ?? []).find((s) => s.status === "closed_won")?.count ?? 0;

  // Funnel data
  const funnelData = (stats?.leadsByStatus ?? []).map(({ status, count }) => {
    const pal = stagePal(status);
    return { status, name: pal.label, value: Number(count), fill: pal.accent, soft: pal.soft, ink: pal.ink };
  });
  const funnelMax = Math.max(1, ...funnelData.map((d) => d.value));

  // Crescimento últimos 6 meses
  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: MONTHS[d.getMonth()] };
  });
  const leadsMap = Object.fromEntries((stats?.monthlyLeads ?? []).map(({ month, count }) => [month, Number(count)]));
  const messagesMap = Object.fromEntries((stats?.monthlyMessages ?? []).map(({ month, count }) => [month, Number(count)]));
  const growthData = last6.map(({ key, label }) => ({
    mes: label, leads: leadsMap[key] ?? 0, mensagens: messagesMap[key] ?? 0,
  }));

  const today = new Date();
  const greeting = today.getHours() < 12 ? "Bom dia" : today.getHours() < 19 ? "Boa tarde" : "Boa noite";

  return (
    <div className="p-6 space-y-4" style={{ background: "#fafafa", minHeight: "100%" }}>
      {/* Header */}
      <div className="flex justify-between items-end mb-2">
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#2c4d46", letterSpacing: "-0.01em" }}>
            {greeting}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 10, fontWeight: 500, color: "#6b7e7a", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {format(today, "EEEE · d 'de' MMMM", { locale: pt })} · {totalLeads} leads no total
          </p>
        </div>
      </div>

      {/* Row 1 — KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard label="Total leads" value={totalLeads}
          accent="#3b82f6" soft="#e8f0fe" ink="#1e3a8a"
          delta={newToday > 0 ? `+${newToday} hoje` : undefined} icon={Users} />
        <KpiCard label="Novos hoje" value={newToday}
          accent="#8b5cf6" soft="#ece5fb" ink="#4c1d95"
          delta="últimas 24h" icon={Sparkles} />
        <KpiCard label="Fechados" value={closedWon}
          accent="#10b981" soft="#d4f0e2" ink="#065f46"
          delta="todos" icon={Trophy} />
        <KpiCard label="Conversas" value={totalConv}
          accent="#ea7c3e" soft="#fce5d4" ink="#7c2d12"
          delta="activas" icon={TrendingUp} />
      </div>

      {/* Row 2 — Crescimento (wide) + Donut por fase */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        <div className="lg:col-span-2">
          <SectionCard
            title="Actividade — últimos 6 meses"
            subtitle="leads e mensagens"
            action={
              <div className="flex items-center gap-3 text-[10px]" style={{ color: "#6b7e7a" }}>
                <span className="flex items-center gap-1.5">
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "#3b82f6" }} />Leads
                </span>
                <span className="flex items-center gap-1.5">
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "#8b5cf6" }} />Mensagens
                </span>
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={growthData} barSize={14} barCategoryGap="30%">
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#6b7e7a" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7e7a" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #ececec", background: "#fff", fontSize: 11 }}
                  cursor={{ fill: "#f4f5f5" }}
                />
                <Bar dataKey="leads" name="Leads" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="mensagens" name="Mensagens" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
        </div>

        <SectionCard title="Distribuição por fase" subtitle="estado actual">
          {funnelData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs" style={{ color: "#a8b8b4" }}>
              Sem dados ainda
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={funnelData} cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={2} dataKey="value">
                    {funnelData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #ececec", background: "#fff", fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                {funnelData.map((d) => (
                  <div key={d.status} className="flex items-center gap-2" style={{ fontSize: 10.5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.fill, flexShrink: 0 }} />
                    <span style={{ color: "#2c4d46", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.name}
                    </span>
                    <span style={{ color: "#6b7e7a", fontWeight: 600 }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Row 3 — Funil detalhado + Follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <SectionCard title="Funil detalhado" subtitle="leads por fase">
          {funnelData.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs" style={{ color: "#a8b8b4" }}>Sem dados</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {funnelData.sort((a, b) => b.value - a.value).map((d) => {
                const pct = (d.value / funnelMax) * 100;
                return (
                  <div key={d.status} className="grid items-center gap-2.5" style={{ gridTemplateColumns: "110px 1fr 32px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#2c4d46" }}>{d.name}</span>
                    <div style={{ height: 22, background: "#f4f5f5", borderRadius: 999, overflow: "hidden", position: "relative" }}>
                      <div style={{
                        height: "100%", width: `${pct}%`, background: d.soft, borderRadius: 999,
                        transition: "width 300ms ease", position: "relative",
                      }}>
                        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                          width: 4, height: 4, borderRadius: "50%", background: d.fill }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: d.ink, textAlign: "right" }}>{d.value}</span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <FollowUpWidget leads={stats?.followUpsToday ?? []} />
      </div>
    </div>
  );
}

// ─── Follow-ups widget ───────────────────────────────────────────────────────
function FollowUpWidget({ leads }: { leads: FollowUpLead[] }) {
  const navigate = useNavigate();
  const overdue = leads.filter((l) => l.followUpAt && isPast(parseISO(l.followUpAt)) && !isToday(parseISO(l.followUpAt)));
  const today   = leads.filter((l) => l.followUpAt && isToday(parseISO(l.followUpAt)));
  const upcoming = leads.filter((l) => l.followUpAt && !isPast(parseISO(l.followUpAt)) && !isToday(parseISO(l.followUpAt)));

  const renderItem = (lead: FollowUpLead, accent: string, soft: string, ink: string, badge: string) => (
    <button
      key={lead.id}
      onClick={() => navigate(`/leads/${lead.id}`)}
      className="text-left w-full"
      style={{
        display: "flex", alignItems: "stretch", gap: 10,
        borderRadius: 14, border: "1px solid #ececec", overflow: "hidden",
        background: "white", cursor: "pointer",
      }}
    >
      <div style={{ width: 3, background: accent, flexShrink: 0 }} />
      <div style={{ flex: 1, padding: "10px 12px 10px 0", minWidth: 0 }}>
        <div className="flex items-center justify-between gap-2">
          <span style={{ fontSize: 12, fontWeight: 600, color: "#2c4d46", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lead.name}
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: soft, color: ink, flexShrink: 0 }}>
            {badge}
          </span>
        </div>
        {lead.followUpNote && (
          <p style={{ margin: "3px 0 0", fontSize: 10.5, color: "#6b7e7a", lineHeight: 1.4,
            display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {lead.followUpNote}
          </p>
        )}
        {lead.telegramUsername && (
          <p style={{ margin: "3px 0 0", fontSize: 9.5, color: "#a8b8b4", display: "flex", alignItems: "center", gap: 4 }}>
            <Send size={9} />@{lead.telegramUsername}
          </p>
        )}
      </div>
    </button>
  );

  return (
    <SectionCard
      title="Follow-ups"
      subtitle="prioridades"
      action={
        leads.length > 0 ? (
          <span style={{
            fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
            background: overdue.length ? "#fadbd8" : "#d4f0e2",
            color: overdue.length ? "#7f1d1d" : "#065f46",
          }}>
            {overdue.length ? `${overdue.length} em atraso` : `${leads.length} pendentes`}
          </span>
        ) : null
      }
    >
      {leads.length === 0 ? (
        <div className="text-center py-6" style={{ color: "#a8b8b4" }}>
          <Calendar size={28} className="mx-auto mb-2 opacity-50" />
          <p className="text-xs">Sem follow-ups agendados</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {overdue.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5" style={{ fontSize: 9.5, fontWeight: 700, color: "#7f1d1d", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <AlertCircle size={11} /> Em atraso
              </div>
              <div className="flex flex-col gap-1.5">
                {overdue.map((l) => renderItem(l, "#ef4444", "#fadbd8", "#7f1d1d",
                  format(parseISO(l.followUpAt), "d MMM", { locale: pt })))}
              </div>
            </div>
          )}
          {today.length > 0 && (
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                Hoje
              </div>
              <div className="flex flex-col gap-1.5">
                {today.map((l) => renderItem(l, "#10b981", "#d4f0e2", "#065f46", "hoje"))}
              </div>
            </div>
          )}
          {upcoming.length > 0 && (
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "#6b7e7a", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                Próximos
              </div>
              <div className="flex flex-col gap-1.5">
                {upcoming.slice(0, 4).map((l) => renderItem(l, "#94a8a3", "#eef0ef", "#2c4d46",
                  format(parseISO(l.followUpAt), "d MMM", { locale: pt })))}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
