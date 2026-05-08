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
  ChevronRight,
  User,
  Heart,
  EyeOff,
  Eye,
  Check,
  Edit2,
  List,
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
  const [openAlerts, setOpenAlerts] = useState<Set<string>>(new Set());
  const [openListingId, setOpenListingId] = useState<string | null>(null);
  const [editingAlert, setEditingAlert] = useState<PropertyAlert | null>(null);
  const [viewMode, setViewMode] = useState<"icon" | "list">("icon");

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
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Home size={20} style={{ color: "#2c4d46" }} />
            Imóveis
          </h1>
          <p className="page-subtitle">
            {counts.all} anúncios
            {counts.new > 0 && (
              <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wide rounded-sm" style={{ color: "#2c4d46", background: "#e8efed" }}>
                {counts.new} novos
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <FilterPill active={filter === "all"} onClick={() => setFilter("all")} count={counts.all}>
              Todos
            </FilterPill>
            <FilterPill active={filter === "new"} onClick={() => setFilter("new")} count={counts.new}>
              Novos
            </FilterPill>
            <FilterPill active={filter === "favorites"} onClick={() => setFilter("favorites")} count={counts.favorites}>
              Favoritos
            </FilterPill>
            <FilterPill active={filter === "hidden"} onClick={() => setFilter("hidden")} count={counts.hidden} variant="hidden">
              Escondidos
            </FilterPill>
          </div>
          <div className="flex items-center gap-0.5 pl-1.5" style={{ borderLeft: "1px solid rgba(255,255,255,0.15)" }}>
            <button
              onClick={() => setViewMode("icon")}
              className="p-1.5 rounded-lg border transition-colors"
              style={{
                background: viewMode === "icon" ? "#2c4d46" : "white",
                color: viewMode === "icon" ? "white" : "#2c4d46",
                borderColor: viewMode === "icon" ? "#2c4d46" : "#d0d0d0"
              }}
              title="Visualização ícone"
            >
              <Home size={10} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="p-1.5 rounded-lg border transition-colors"
              style={{
                background: viewMode === "list" ? "#2c4d46" : "white",
                color: viewMode === "list" ? "white" : "#2c4d46",
                borderColor: viewMode === "list" ? "#2c4d46" : "#d0d0d0"
              }}
              title="Visualização lista"
            >
              <List size={10} />
            </button>
          </div>
          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg border transition-colors"
            style={{ color: "#2c4d46", borderColor: "#d0d0d0", background: "white" }}
            title="Atualizar"
          >
            <RefreshCw size={10} />
          </button>
        </div>
      </div>


      {openListingId && (
        <ListingDetailModal
          listingId={openListingId}
          onClose={() => setOpenListingId(null)}
        />
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
        <div className="space-y-2">
          {alerts.map((alert) => {
            const alertListings = filtered.filter((l) => l.alertId === alert.id);
            if (alertListings.length === 0) return null;

            const isOpen = openAlerts.has(alert.id);
            const newInGroup = alertListings.filter((l) => l.isNew).length;
            const alertLabel = `${alert.propertyType} · ${alert.zone}${alert.maxPrice ? ` · até ${alert.maxPrice.toLocaleString("pt-PT")} €` : ""}`;

            const toggleAlert = () => {
              const newOpen = new Set(openAlerts);
              if (newOpen.has(alert.id)) {
                newOpen.delete(alert.id);
              } else {
                newOpen.add(alert.id);
              }
              setOpenAlerts(newOpen);
            };

            return (
              <div
                key={alert.id}
                className="group card cursor-pointer overflow-hidden transition-all"
                style={{
                  border: "1px solid rgba(0,0,0,0.05)",
                  background: "rgba(255,255,255,0.5)",
                  borderRadius: "3px"
                }}
              >
                {/* Alert Header - Collapsible */}
                <button
                  onClick={toggleAlert}
                  className="w-full flex items-center justify-between gap-3 p-3 transition-colors"
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.8)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0)"}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="shrink-0">
                      {isOpen ? (
                        <ChevronDown size={14} style={{ color: "#2c4d46" }} />
                      ) : (
                        <ChevronRight size={14} style={{ color: "#2c4d46" }} />
                      )}
                    </div>
                    <Bell size={12} style={{ color: "#2c4d46" }} className="shrink-0" />
                    <h3 className="text-xs font-medium text-left truncate" style={{ color: "#1a1a1a" }}>
                      {alertLabel}
                    </h3>
                    {newInGroup > 0 && (
                      <span className="text-[9px] px-1 py-0.5 rounded-sm font-bold uppercase tracking-wide shrink-0" style={{ color: "#2c4d46", background: "#e8efed" }}>
                        {newInGroup}
                      </span>
                    )}
                    <span className="text-[9px] px-1 py-0.5 rounded-sm font-bold uppercase tracking-wide shrink-0" style={{ color: "#8bb5a8", background: "#f0f0f0" }}>
                      {alertListings.length}
                    </span>
                  </div>

                  {/* Alert Actions - Hidden on normal view, visible on hover */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        runAlertMutation.mutate(alert.id);
                      }}
                      disabled={runAlertMutation.isPending}
                      className="p-1.5 rounded-sm border transition-colors"
                      style={{
                        color: "#2c4d46",
                        borderColor: "#d0d0d0",
                        background: "#e8efed"
                      }}
                      title="Verificar agora"
                    >
                      <RefreshCw size={10} className={runAlertMutation.isPending ? "animate-spin" : ""} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingAlert(alert);
                      }}
                      className="p-1.5 rounded-sm border transition-colors"
                      style={{
                        color: "#2c4d46",
                        borderColor: "#d0d0d0",
                        background: "white"
                      }}
                      title="Editar alerta"
                    >
                      <Edit2 size={10} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAlertMutation.mutate({ id: alert.id, active: !alert.active });
                      }}
                      className="p-1.5 rounded-sm border transition-colors"
                      style={{
                        color: alert.active ? "#2c4d46" : "#8bb5a8",
                        borderColor: alert.active ? "#d0d0d0" : "#e0e0e0",
                        background: alert.active ? "#e8efed" : "#f0f0f0"
                      }}
                      title={alert.active ? "Desativar" : "Ativar"}
                    >
                      <Power size={10} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Eliminar alerta e seus ${alertListings.length} imóvel(eis)?`)) {
                          deleteAlertMutation.mutate(alert.id);
                        }
                      }}
                      disabled={deleteAlertMutation.isPending}
                      className="p-1.5 rounded-sm border transition-colors"
                      style={{
                        color: "#e74c3c",
                        borderColor: "#f0d0d0",
                        background: "#ffe6e6"
                      }}
                      title="Eliminar alerta"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </button>

                {/* Properties - Expandable */}
                {isOpen && (
                  <div className="p-3 border-t" style={{ borderColor: "rgba(0,0,0,0.05)", background: "rgba(255,255,255,0.5)" }}>
                    <div className={viewMode === "icon" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" : "space-y-2"}>
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
                          viewMode={viewMode}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
      <div className="w-full md:w-96 bg-white md:rounded-sm p-6 space-y-4 max-h-[90vh] overflow-y-auto" style={{ borderRadius: "3px" }}>
        <div className="flex items-center justify-between">
          <h2 className="heading-md" style={{ color: "#1a1a1a" }}>Editar Alerta</h2>
          <button
            onClick={onClose}
            className="transition-colors"
            style={{ color: "#8bb5a8" }}
            title="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label" style={{ color: "#5a5a5a" }}>Zona *</label>
            <input
              value={form.zone}
              onChange={(e) => setForm({ ...form, zone: e.target.value })}
              className="input w-full"
            />
          </div>

          <div>
            <label className="label" style={{ color: "#5a5a5a" }}>Tipo de Propriedade</label>
            <select
              value={form.propertyType}
              onChange={(e) => setForm({ ...form, propertyType: e.target.value })}
              className="input w-full"
            >
              <option value="T0">T0</option>
              <option value="T1">T1</option>
              <option value="T2">T2</option>
              <option value="T3">T3</option>
              <option value="T4+">T4+</option>
            </select>
          </div>

          <div>
            <label className="label" style={{ color: "#5a5a5a" }}>Tipo de Transação</label>
            <select
              value={form.transactionType}
              onChange={(e) => setForm({ ...form, transactionType: e.target.value })}
              className="input w-full"
            >
              <option value="rent">Arrendar</option>
              <option value="buy">Comprar</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" style={{ color: "#5a5a5a" }}>Preço Mín (€)</label>
              <input
                type="number"
                value={form.minPrice}
                onChange={(e) => setForm({ ...form, minPrice: e.target.value })}
                className={cn(
                  "input w-full",
                  errors.price && "border-red-300"
                )}
              />
            </div>
            <div>
              <label className="label" style={{ color: "#5a5a5a" }}>Preço Máx (€)</label>
              <input
                type="number"
                value={form.maxPrice}
                onChange={(e) => setForm({ ...form, maxPrice: e.target.value })}
                className={cn(
                  "input w-full",
                  errors.price && "border-red-300"
                )}
              />
            </div>
          </div>
          {errors.price && (
            <div className="text-xs" style={{ color: "#e74c3c" }}>
              {errors.price}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" style={{ color: "#5a5a5a" }}>Área Mín (m²)</label>
              <input
                type="number"
                value={form.minArea}
                onChange={(e) => setForm({ ...form, minArea: e.target.value })}
                className={cn(
                  "input w-full",
                  errors.area && "border-red-300"
                )}
              />
            </div>
            <div>
              <label className="label" style={{ color: "#5a5a5a" }}>Área Máx (m²)</label>
              <input
                type="number"
                value={form.maxArea}
                onChange={(e) => setForm({ ...form, maxArea: e.target.value })}
                className={cn(
                  "input w-full",
                  errors.area && "border-red-300"
                )}
              />
            </div>
          </div>
          {errors.area && (
            <div className="text-xs" style={{ color: "#e74c3c" }}>
              {errors.area}
            </div>
          )}

          <div>
            <label className="label" style={{ color: "#5a5a5a" }}>Ano Construção Mín</label>
            <input
              type="number"
              value={form.buildYearMin}
              onChange={(e) => setForm({ ...form, buildYearMin: e.target.value })}
              className="input w-full"
            />
          </div>

          <div>
            <label className="label" style={{ color: "#5a5a5a" }}>Mercado</label>
            <select
              value={form.market}
              onChange={(e) => setForm({ ...form, market: e.target.value })}
              className="input w-full"
            >
              <option value="">Qualquer</option>
              <option value="primary">Novo (Mercado Primário)</option>
              <option value="secondary">Usado (Mercado Secundário)</option>
            </select>
          </div>

          <div>
            <label className="label" style={{ color: "#5a5a5a" }}>Tipo de Proprietário</label>
            <select
              value={form.ownerType}
              onChange={(e) => setForm({ ...form, ownerType: e.target.value })}
              className="input w-full"
            >
              <option value="">Qualquer</option>
              <option value="agency">Agências</option>
              <option value="private">Particulares</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 pt-4" style={{ borderTop: "1px solid rgba(0,0,0,0.1)" }}>
          <button
            onClick={onClose}
            className="flex-1 py-2 text-xs font-bold uppercase tracking-wide rounded-sm transition-colors"
            style={{ color: "#5a5a5a", background: "#e8efed" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || Object.keys(errors).length > 0}
            className="flex-1 py-2 text-xs font-bold uppercase tracking-wide rounded-sm transition-colors disabled:opacity-50 text-white"
            style={{ background: "#2c4d46" }}
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
  variant = "default",
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
  variant?: "default" | "hidden";
}) {
  const isHiddenVariant = variant === "hidden";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 text-[10px] px-2.5 py-1.5 font-bold uppercase tracking-wide rounded-lg border transition-colors",
        isHiddenVariant
          ? active
            ? "text-white"
            : "text-gray-500 hover:text-gray-600"
          : active
          ? "text-white"
          : "text-gray-600 hover:text-gray-700"
      )}
      style={{
        background: isHiddenVariant
          ? active ? "#666" : "white"
          : active ? "#2c4d46" : "white",
        borderColor: "#d0d0d0"
      }}
    >
      {children}
      <span className="text-[8px] px-1 py-0.5 rounded-sm font-bold uppercase tracking-wide"
        style={{
          background: isHiddenVariant
            ? active ? "#555" : "#e0e0e0"
            : active ? "#1a3a35" : "#e8efed",
          color: isHiddenVariant
            ? "white"
            : active ? "white" : "#2c4d46"
        }}>
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
  viewMode,
}: {
  listing: PropertyListing;
  onClick: () => void;
  onMarkSeen: () => void;
  onToggleFavorite: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  viewMode: "icon" | "list";
}) {
  const sourceLabel =
    listing.source === "idealista" ? "Idealista" :
    listing.source === "casayes" ? "Casa Yes" : "Imovirtual";
  const sourceStyle =
    listing.source === "idealista"
      ? { background: "#ffe6e6", color: "#c0392b" }
      : { background: "#e8efed", color: "#2c4d46" };

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  if (viewMode === "list") {
    return (
      <div
        onClick={onClick}
        className={cn(
          "group cursor-pointer relative transition-all flex items-center gap-3 p-2 rounded-sm",
          listing.isHidden && "opacity-60"
        )}
        style={{
          border: "1px solid rgba(0,0,0,0.05)",
          background: "rgba(255,255,255,0.3)"
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.6)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.3)"}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {listing.isNew && (
              <span className="text-[9px] px-1 py-0.5 rounded-sm font-bold uppercase tracking-wide" style={{ background: "#e8efed", color: "#2c4d46" }}>
                Novo
              </span>
            )}
            {listing.isFavorite && (
              <Heart size={10} style={{ color: "#e74c3c" }} fill="currentColor" />
            )}
          </div>
          <p className="text-xs font-medium truncate" style={{ color: "#1a1a1a" }}>
            {listing.title ?? "Imóvel sem título"}
          </p>
          <div className="flex items-center gap-2 text-[11px] mt-0.5">
            {listing.price && <span style={{ color: "#1a1a1a", fontWeight: "600" }}>{listing.price.toLocaleString("pt-PT")} €</span>}
            {listing.area && <span style={{ color: "#5a5a5a" }}>{listing.area} m²</span>}
            {listing.zone && <span style={{ color: "#8bb5a8" }} className="truncate">{listing.zone}</span>}
          </div>
        </div>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm shrink-0 uppercase tracking-wide" style={{ ...sourceStyle, borderRadius: "3px" }}>
          {sourceLabel}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconBtn onClick={stop(onToggleFavorite)} title={listing.isFavorite ? "Remover" : "Adicionar"} active={listing.isFavorite} activeColor="text-pink-500 bg-pink-50">
            <Heart size={11} fill={listing.isFavorite ? "currentColor" : "none"} />
          </IconBtn>
          <IconBtn onClick={stop(onToggleHidden)} title={listing.isHidden ? "Mostrar" : "Esconder"}>
            {listing.isHidden ? <Eye size={11} /> : <EyeOff size={11} />}
          </IconBtn>
          {listing.isNew && (
            <IconBtn onClick={stop(onMarkSeen)} title="Visto">
              <Check size={11} />
            </IconBtn>
          )}
          <IconBtn onClick={stop(onDelete)} title="Eliminar" hoverColor="hover:text-red-500 hover:bg-red-50">
            <Trash2 size={11} />
          </IconBtn>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "group card cursor-pointer relative transition-all aspect-video flex flex-col",
        listing.isHidden && "opacity-60"
      )}
      style={{
        border: "1px solid rgba(0,0,0,0.05)",
        background: "rgba(255,255,255,0.5)"
      }}
    >
      {/* Quick actions overlay (top-right on hover) */}
      <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <IconBtn
          onClick={stop(onToggleFavorite)}
          title={listing.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          active={listing.isFavorite}
          activeColor="text-pink-500 bg-pink-50"
        >
          <Heart size={11} fill={listing.isFavorite ? "currentColor" : "none"} />
        </IconBtn>
        <IconBtn
          onClick={stop(onToggleHidden)}
          title={listing.isHidden ? "Voltar a mostrar" : "Esconder"}
        >
          {listing.isHidden ? <Eye size={11} /> : <EyeOff size={11} />}
        </IconBtn>
        {listing.isNew && (
          <IconBtn onClick={stop(onMarkSeen)} title="Marcar como visto">
            <Check size={11} />
          </IconBtn>
        )}
        <IconBtn onClick={stop(onDelete)} title="Eliminar" hoverColor="hover:text-red-500 hover:bg-red-50">
          <Trash2 size={11} />
        </IconBtn>
      </div>

      {/* Header */}
      <div className="flex-1 flex flex-col justify-between p-2">
        <div>
          <div className="flex items-center gap-1 mb-1">
            {listing.isNew && (
              <span className="inline-block text-[9px] px-1 py-0.5 rounded-sm font-bold uppercase tracking-wide" style={{ background: "#e8efed", color: "#2c4d46" }}>
                Novo
              </span>
            )}
            {listing.isFavorite && (
              <Heart size={10} style={{ color: "#e74c3c" }} fill="currentColor" />
            )}
          </div>
          <p className="text-xs font-medium leading-tight line-clamp-2" style={{ color: "#1a1a1a" }}>
            {listing.title ?? "Imóvel sem título"}
          </p>
        </div>

        {/* Detalhes */}
        <div className="flex items-center gap-2 text-[10px]">
          {listing.price && (
            <span className="font-bold" style={{ color: "#1a1a1a" }}>
              {listing.price.toLocaleString("pt-PT")} €
            </span>
          )}
          {listing.area && (
            <span style={{ color: "#5a5a5a" }}>{listing.area} m²</span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-1 px-2 pb-1 text-[9px]" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
        <span style={{ color: "#8bb5a8" }}>
          {listing.zone && <span className="truncate">{listing.zone}</span>}
        </span>
        <span
          className="font-bold uppercase tracking-wide shrink-0"
          style={{ ...sourceStyle, borderRadius: "3px", padding: "2px 6px", fontSize: "8px" }}
        >
          {sourceLabel}
        </span>
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
        "p-1.5 rounded-sm border transition-colors",
        active
          ? activeColor ?? "text-white bg-pink-100 border-pink-300"
          : `text-gray-500 bg-white border-gray-200 ${hoverColor ?? "hover:text-2c4d46 hover:bg-e8efed"}`
      )}
      style={active && !activeColor ? undefined : {}}
    >
      {children}
    </button>
  );
}
