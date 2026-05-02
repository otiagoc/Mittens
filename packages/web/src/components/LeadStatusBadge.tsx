import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new:              { label: "Novo",             className: "bg-blue-100 text-blue-700" },
  contacted:        { label: "Contactado",       className: "bg-yellow-100 text-yellow-700" },
  qualified:        { label: "Qualificado",      className: "bg-purple-100 text-purple-700" },
  visit_scheduled:  { label: "Visita Agendada",  className: "bg-orange-100 text-orange-700" },
  proposal:         { label: "Proposta",         className: "bg-indigo-100 text-indigo-700" },
  closed_won:       { label: "Fechado ✓",        className: "bg-green-100 text-green-700" },
  closed_lost:      { label: "Perdido",          className: "bg-red-100 text-red-700" },
};

export function LeadStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: "bg-gray-100 text-gray-700" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", config.className)}>
      {config.label}
    </span>
  );
}

export const ALL_STATUSES = Object.entries(STATUS_CONFIG).map(([value, { label }]) => ({ value, label }));
