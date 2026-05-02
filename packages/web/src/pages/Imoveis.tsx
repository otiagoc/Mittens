import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  propertyListingsApi,
  propertyAlertsApi,
  type PropertyListing,
  type PropertyAlert,
} from "@/lib/api";
import {
  ExternalLink,
  RefreshCw,
  Bell,
  Home,
  Trash2,
  Power,
  ChevronDown,
  ChevronUp,
  User,
  Heart,
  EyeOff,
  Eye,
  Check,
  Edit2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { ListingDetailModal } from "@/components/ListingDetailModal";

type Filter = "all" | "new" | "favorites" | "hidden";

export function Imoveis() {
  const queryClient = useQueryClient();
  const [filterAlert, setFilterAlert] = useState<string>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [openListingId, setOpenListingId] = useState<string | null>(null);
  const [editingAlert, setEditingAlert] = useState<PropertyAlert | null>(null);

  const { data: listings = [], isLoading, refetch } = useQuery({
    queryKey: ["property-listings"],
    queryFn: () => propertyListingsApi.list(),
    refetchInterval: 2 * 60 * 1000,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["all-property-alerts"],
    queryFn: async () => {
      const res = await fetch("/api/property-alerts-all", {
        headers: { Authorization: `Bearer ${localStorage.getItem("mittens_token")}` },
      });
      if (!res.ok) return [] as PropertyAlert[];
      return res.json() as Promise<PropertyAlert[]>;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["property-listings"] });
    queryClient.invalidateQueries({ queryKey: ["all-property-alerts"] });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ isFavorite: boolean; isHidden: boolean; isNew: boolean }> }) =>
      propertyListingsApi.update(id, data),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => propertyListingsApi.delete(id),
    onSuccess: invalidate,
  });

  const runAlertMutation = useMutation({
    mutationFn: (alertId: string) => propertyListingsApi.runAlert(alertId),
    onSuccess: invalidate,
  });

  const toggleAlertMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      propertyAlertsApi.toggle(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-property-alerts"] }),
  });

  const deleteAlertMutation = useMutation({
    mutationFn: (id: string) => propertyAlertsApi.delete(id),
    onSuccess: invalidate,
  });

  const updateAlertMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PropertyAlert> }) =>
      propertyAlertsApi.update(id, data),
    onSuccess: () => {
      invalidate();
      setEditingAlert(null);
    },
  });

  const filtered = listings.filter((l) => {
    if (filterAlert !== "all" && l.alertId !== filterAlert) return false;
    if (filter === "hidden") return l.isHidden;
    if (l.isHidden) return false;
    if (filter === "new") return l.isNew;
    if (filter === "favorites") return l.isFavorite;
    return true;
  });

  const counts = {
    all: listings.filter((l) => !l.isHidden).length,
    new: listings.filter((l) => l.isNew && !l.isHidden).length,
    favorites: listings.filter((l) => l.isFavorite && !l.isHidden).length,
    hidden: listings.filter((l) => l.isHidden).length,
  };

  const byAlert = filtered.reduce<Record<string, PropertyListing[]>>((acc, l) => {
    const key = l.alertId ?? "sem_alerta";
    if (!acc[key]) acc[key] = [];
    acc[key].push(l);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <Home size={20} className="text-blue-500" />
            Imóveis
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {counts.all} anúncios
            {counts.new > 0 && (
              <span className="ml-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                {counts.new} novos
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FilterPill active={filter === "all"} onClick={() => setFilter("all")} count={counts.all}>
            Todos
          </FilterPill>
          <FilterPill active={filter === "new"} onClick={() => setFilter("new")} count={counts.new}>
            Novos
          </FilterPill>
          <FilterPill active={filter === "favorites"} onClick={() => setFilter("favorites")} count={counts.favorites}>
            Favoritos
          </FilterPill>
          <FilterPill active={filter === "hidden"} onClick={() => setFilter("hidden")} count={counts.hidden}>
            Escondidos
          </FilterPill>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border bg-white text-gray-600 border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={13} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Painel de gestão de alertas */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setAlertsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-blue-500" />
              <span className="text-sm font-semibold text-gray-700">
                Alertas activos ({alerts.filter((a) => a.active).length}/{alerts.length})
              </span>
            </div>
            {alertsOpen ? (
              <ChevronUp size={16} className="text-gray-400" />
            ) : (
              <ChevronDown size={16} className="text-gray-400" />
            )}
          </button>

          {alertsOpen && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "px-4 py-3 flex items-center justify-between gap-3 transition-colors",
                    !alert.active && "opacity-50 bg-gray-50/50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">
                        {alert.propertyType} · {alert.zone}
                      </span>
                      {alert.transactionType === "rent" ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium">
                          Arrendar
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">
                          Comprar
                        </span>
                      )}
                      {(alert.minPrice || alert.maxPrice) && (
                        <span className="text-xs text-gray-500">
                          {alert.minPrice && alert.maxPrice
                            ? `${alert.minPrice.toLocaleString("pt-PT")}–${alert.maxPrice.toLocaleString("pt-PT")} €`
                            : alert.maxPrice
                            ? `até ${alert.maxPrice.toLocaleString("pt-PT")} €`
                            : `desde ${alert.minPrice!.toLocaleString("pt-PT")} €`}
                        </span>
                      )}
                      {(alert.minArea || alert.maxArea) && (
                        <span className="text-xs text-gray-500">
                          {alert.minArea && alert.maxArea
                            ? `${alert.minArea}–${alert.maxArea} m²`
                            : alert.minArea
                            ? `≥ ${alert.minArea} m²`
                            : `≤ ${alert.maxArea} m²`}
                        </span>
                      )}
                      {alert.buildYearMin && (
                        <span className="text-xs text-gray-500">≥ {alert.buildYearMin}</span>
                      )}
                      {alert.market === "primary" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Novo</span>
                      )}
                      {alert.market === "secondary" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">Usado</span>
                      )}
                      {alert.ownerType === "agency" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">Agências</span>
                      )}
                      {alert.ownerType === "private" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-50 text-pink-600 font-medium">Particulares</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      {alert.leadName && alert.leadId ? (
                        <Link
                          to={`/leads/${alert.leadId}`}
                          className="flex items-center gap-1 hover:text-blue-500 transition-colors"
                        >
                          <User size={11} />
                          {alert.leadName}
                        </Link>
                      ) : (
                        <span className="text-gray-300">Sem lead</span>
                      )}
                      <span>·</span>
                      <span>
                        {alert.listingsCount ?? 0} anúncios
                        {(alert.newCount ?? 0) > 0 && (
                          <span className="ml-1 text-blue-500 font-medium">
                            ({alert.newCount} novos)
                          </span>
                        )}
                      </span>
                      {alert.lastCheckedAt && (
                        <>
                          <span>·</span>
                          <span>
                            verificado{" "}
                            {formatDistanceToNow(new Date(alert.lastCheckedAt), {
                              addSuffix: true,
                              locale: pt,
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingAlert(alert)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                      title="Editar alerta"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => setFilterAlert(filterAlert === alert.id ? "all" : alert.id)}
                      className={cn(
                        "px-2 py-1 text-[11px] rounded-md transition-colors",
                        filterAlert === alert.id
                          ? "bg-blue-500 text-white"
                          : "text-gray-400 hover:bg-gray-100"
                      )}
                      title="Filtrar por este alerta"
                    >
                      Filtrar
                    </button>
                    <button
                      onClick={() => runAlertMutation.mutate(alert.id)}
                      disabled={runAlertMutation.isPending}
                      className="p-1.5 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-40"
                      title="Verificar agora"
                    >
                      <RefreshCw
                        size={13}
                        className={runAlertMutation.isPending ? "animate-spin" : ""}
                      />
                    </button>
                    <button
                      onClick={() =>
                        toggleAlertMutation.mutate({ id: alert.id, active: !alert.active })
                      }
                      disabled={toggleAlertMutation.isPending}
                      className={cn(
                        "p-1.5 rounded-md transition-colors disabled:opacity-40",
                        alert.active
                          ? "text-green-500 hover:bg-green-50"
                          : "text-gray-300 hover:bg-gray-100"
                      )}
                      title={alert.active ? "Pausar alerta" : "Activar alerta"}
                    >
                      <Power size={13} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Eliminar este alerta? Os imóveis encontrados ficam guardados.`)) {
                          deleteAlertMutation.mutate(alert.id);
                        }
                      }}
                      disabled={deleteAlertMutation.isPending}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                      title="Eliminar alerta"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-gray-400 text-sm py-16">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Home size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {filter === "favorites"
              ? "Sem favoritos ainda"
              : filter === "hidden"
              ? "Sem imóveis escondidos"
              : filter === "new"
              ? "Sem novos imóveis"
              : "Nenhum imóvel encontrado ainda"}
          </p>
          {filter === "all" && (
            <p className="text-xs mt-1">Cria alertas nos perfis das leads para começar a monitorizar</p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byAlert).map(([alertKey, alertListings]) => {
            const alert = alerts.find((a) => a.id === alertKey);
            const alertLabel = alert
              ? `${alert.propertyType} · ${alert.zone}${alert.maxPrice ? ` · até ${alert.maxPrice.toLocaleString("pt-PT")} €` : ""}`
              : alertListings[0]
              ? `${alertListings[0].zone ?? "Sem zona"}`
              : "Alerta";
            const newInGroup = alertListings.filter((l) => l.isNew).length;

            return (
              <div key={alertKey} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell size={14} className="text-blue-400" />
                    <h2 className="text-sm font-semibold text-gray-700">{alertLabel}</h2>
                    {newInGroup > 0 && (
                      <span className="bg-blue-100 text-blue-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                        {newInGroup} novos
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{alertListings.length} anúncios</span>
                  </div>
                  {alert && (
                    <button
                      onClick={() => runAlertMutation.mutate(alert.id)}
                      disabled={runAlertMutation.isPending}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-40"
                      title="Verificar agora"
                    >
                      <RefreshCw size={12} className={runAlertMutation.isPending ? "animate-spin" : ""} />
                      Verificar agora
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {alertListings.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      onClick={() => setOpenListingId(listing.id)}
                      onMarkSeen={() => updateMutation.mutate({ id: listing.id, data: { isNew: false } })}
                      onToggleFavorite={() => updateMutation.mutate({ id: listing.id, data: { isFavorite: !listing.isFavorite } })}
                      onToggleHidden={() => updateMutation.mutate({ id: listing.id, data: { isHidden: !listing.isHidden } })}
                      onDelete={() => {
                        if (confirm("Eliminar este imóvel?")) deleteMutation.mutate(listing.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openListingId && (
        <ListingDetailModal
          listingId={openListingId}
          onClose={() => setOpenListingId(null)}
        />
      )}

      {editingAlert && (
        <AlertEditDrawer
          alert={editingAlert}
          onClose={() => setEditingAlert(null)}
          onSave={(data) => updateAlertMutation.mutate({ id: editingAlert.id, data })}
          isSaving={updateAlertMutation.isPending}
        />
      )}
    </div>
  );
}

function AlertEditDrawer({
  alert,
  onClose,
  onSave,
  isSaving,
}: {
  alert: PropertyAlert;
  onClose: () => void;
  onSave: (data: Partial<PropertyAlert>) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    zone: alert.zone,
    propertyType: alert.propertyType,
    transactionType: alert.transactionType,
    minPrice: alert.minPrice ?? "",
    maxPrice: alert.maxPrice ?? "",
    minArea: alert.minArea ?? "",
    maxArea: alert.maxArea ?? "",
    buildYearMin: alert.buildYearMin ?? "",
    market: alert.market ?? "",
    ownerType: alert.ownerType ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    const minPrice = form.minPrice ? Number(form.minPrice) : null;
    const maxPrice = form.maxPrice ? Number(form.maxPrice) : null;
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      newErrors.price = "Preço mínimo não pode ser superior ao máximo";
    }

    const minArea = form.minArea ? Number(form.minArea) : null;
    const maxArea = form.maxArea ? Number(form.maxArea) : null;
    if (minArea !== null && maxArea !== null && minArea > maxArea) {
      newErrors.area = "Área mínima não pode ser superior à máxima";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) return;

    const updates: any = {
      zone: form.zone,
      propertyType: form.propertyType,
      transactionType: form.transactionType,
      minPrice: form.minPrice ? Number(form.minPrice) : null,
      maxPrice: form.maxPrice ? Number(form.maxPrice) : null,
      minArea: form.minArea ? Number(form.minArea) : null,
      maxArea: form.maxArea ? Number(form.maxArea) : null,
      buildYearMin: form.buildYearMin ? Number(form.buildYearMin) : null,
      market: form.market || null,
      ownerType: form.ownerType || null,
    };
    onSave(updates);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-end md:justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full md:w-96 bg-white shadow-2xl md:rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Editar Alerta</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Zona *</label>
            <input
              value={form.zone}
              onChange={(e) => setForm({ ...form, zone: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Propriedade</label>
            <select
              value={form.propertyType}
              onChange={(e) => setForm({ ...form, propertyType: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="T0">T0</option>
              <option value="T1">T1</option>
              <option value="T2">T2</option>
              <option value="T3">T3</option>
              <option value="T4+">T4+</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Transação</label>
            <select
              value={form.transactionType}
              onChange={(e) => setForm({ ...form, transactionType: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="rent">Arrendar</option>
              <option value="buy">Comprar</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Preço Mín (€)</label>
              <input
                type="number"
                value={form.minPrice}
                onChange={(e) => setForm({ ...form, minPrice: e.target.value })}
                className={cn(
                  "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2",
                  errors.price ? "border-red-300 focus:ring-red-500" : "focus:ring-blue-500"
                )}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Preço Máx (€)</label>
              <input
                type="number"
                value={form.maxPrice}
                onChange={(e) => setForm({ ...form, maxPrice: e.target.value })}
                className={cn(
                  "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2",
                  errors.price ? "border-red-300 focus:ring-red-500" : "focus:ring-blue-500"
                )}
              />
            </div>
          </div>
          {errors.price && (
            <div className="text-xs text-red-500 -mt-1">{errors.price}</div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Área Mín (m²)</label>
              <input
                type="number"
                value={form.minArea}
                onChange={(e) => setForm({ ...form, minArea: e.target.value })}
                className={cn(
                  "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2",
                  errors.area ? "border-red-300 focus:ring-red-500" : "focus:ring-blue-500"
                )}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Área Máx (m²)</label>
              <input
                type="number"
                value={form.maxArea}
                onChange={(e) => setForm({ ...form, maxArea: e.target.value })}
                className={cn(
                  "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2",
                  errors.area ? "border-red-300 focus:ring-red-500" : "focus:ring-blue-500"
                )}
              />
            </div>
          </div>
          {errors.area && (
            <div className="text-xs text-red-500 -mt-1">{errors.area}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ano Construção Mín</label>
            <input
              type="number"
              value={form.buildYearMin}
              onChange={(e) => setForm({ ...form, buildYearMin: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mercado</label>
            <select
              value={form.market}
              onChange={(e) => setForm({ ...form, market: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Qualquer</option>
              <option value="primary">Novo (Mercado Primário)</option>
              <option value="secondary">Usado (Mercado Secundário)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de Proprietário</label>
            <select
              value={form.ownerType}
              onChange={(e) => setForm({ ...form, ownerType: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Qualquer</option>
              <option value="agency">Agências</option>
              <option value="private">Particulares</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <button
            onClick={onClose}
            className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || Object.keys(errors).length > 0}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm"
          >
            {isSaving ? "A guardar..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors",
        active
          ? "bg-blue-500 text-white border-blue-500"
          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
      )}
    >
      {children}
      <span className={cn(
        "text-[10px] px-1.5 py-0 rounded-full font-bold",
        active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"
      )}>
        {count}
      </span>
    </button>
  );
}

function ListingCard({
  listing,
  onClick,
  onMarkSeen,
  onToggleFavorite,
  onToggleHidden,
  onDelete,
}: {
  listing: PropertyListing;
  onClick: () => void;
  onMarkSeen: () => void;
  onToggleFavorite: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
}) {
  const sourceLabel =
    listing.source === "idealista" ? "Idealista" :
    listing.source === "casayes" ? "Casa Yes" : "Imovirtual";
  const sourceColor =
    listing.source === "idealista" ? "#e74c3c" :
    listing.source === "casayes" ? "#10b981" : "#3498db";

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "group bg-white rounded-xl border p-4 space-y-3 transition-all hover:shadow-md cursor-pointer relative",
        listing.isNew ? "border-blue-200 shadow-sm" : "border-gray-100",
        listing.isHidden && "opacity-60"
      )}
    >
      {/* Quick actions overlay (top-right on hover) */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <IconBtn
          onClick={stop(onToggleFavorite)}
          title={listing.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          active={listing.isFavorite}
          activeColor="text-pink-500 bg-pink-50"
        >
          <Heart size={13} fill={listing.isFavorite ? "currentColor" : "none"} />
        </IconBtn>
        <IconBtn
          onClick={stop(onToggleHidden)}
          title={listing.isHidden ? "Voltar a mostrar" : "Esconder"}
        >
          {listing.isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
        </IconBtn>
        {listing.isNew && (
          <IconBtn onClick={stop(onMarkSeen)} title="Marcar como visto">
            <Check size={13} />
          </IconBtn>
        )}
        <IconBtn onClick={stop(onDelete)} title="Eliminar" hoverColor="hover:text-red-500 hover:bg-red-50">
          <Trash2 size={13} />
        </IconBtn>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 pr-16">
          <div className="flex items-center gap-1.5 mb-1">
            {listing.isNew && (
              <span className="inline-block bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                NOVO
              </span>
            )}
            {listing.isFavorite && (
              <Heart size={11} className="text-pink-500" fill="currentColor" />
            )}
          </div>
          <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">
            {listing.title ?? "Imóvel sem título"}
          </p>
        </div>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0"
          style={{ background: sourceColor }}
        >
          {sourceLabel}
        </span>
      </div>

      {/* Detalhes */}
      <div className="flex items-center gap-3 text-sm">
        {listing.price && (
          <span className="font-bold text-gray-800">
            {listing.price.toLocaleString("pt-PT")} €
          </span>
        )}
        {listing.area && (
          <span className="text-gray-500 text-xs">{listing.area} m²</span>
        )}
        {listing.zone && (
          <span className="text-gray-400 text-xs truncate">{listing.zone}</span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
        <span className="text-[10px] text-gray-400">
          {formatDistanceToNow(new Date(listing.foundAt), { addSuffix: true, locale: pt })}
        </span>
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
        >
          Original <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  active,
  activeColor,
  hoverColor,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  active?: boolean;
  activeColor?: string;
  hoverColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded-md bg-white shadow-sm border border-gray-100 transition-colors",
        active
          ? activeColor ?? "text-blue-500 bg-blue-50"
          : `text-gray-400 ${hoverColor ?? "hover:text-blue-500 hover:bg-blue-50"}`
      )}
    >
      {children}
    </button>
  );
}
