import { useQuery, useMutation } from "@tanstack/react-query";
import { propertyListingsApi } from "@/lib/api";
import {
  X,
  ExternalLink,
  Share2,
  RefreshCw,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ListingDetailModal({
  listingId,
  onClose,
}: {
  listingId: string;
  onClose: () => void;
}) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["listing-detail", listingId],
    queryFn: () => propertyListingsApi.detail(listingId),
  });

  const refreshMutation = useMutation({
    mutationFn: () => propertyListingsApi.detail(listingId, true),
    onSuccess: () => refetch(),
  });

  const shareMutation = useMutation({
    mutationFn: () => propertyListingsApi.share(listingId),
    onSuccess: (res) => {
      const fullUrl = `${window.location.origin}${res.url}`;
      setShareUrl(fullUrl);
    },
  });

  const deleteShareMutation = useMutation({
    mutationFn: () => propertyListingsApi.deleteShare(listingId),
    onSuccess: () => {
      setShareUrl(null);
    },
  });

  // ESC para fechar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setPhotoIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setPhotoIdx((i) => i + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const detail = data?.detail;
  const images = detail?.images ?? [];
  const safeIdx = Math.min(photoIdx, Math.max(0, images.length - 1));

  const copyShare = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
        style={{ borderRadius: "3px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid #e8efed" }}>
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold truncate" style={{ color: "#2c4d46" }}>
              {detail?.title ?? data?.title ?? "Imóvel"}
            </h2>
            {data?.source && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm text-white shrink-0"
                style={{
                  background:
                    data.source === "casayes" ? "#2c4d46" :
                    data.source === "idealista" ? "#e74c3c" : "#8bb5a8",
                }}
              >
                {data.source === "casayes" ? "Casa Yes" : data.source === "idealista" ? "Idealista" : "Imovirtual"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending || isFetching}
              className="p-1.5 rounded-sm transition-colors disabled:opacity-40"
              style={{ color: "#8bb5a8" }}
              onMouseEnter={(e) => !(!refreshMutation.isPending || !isFetching) && (e.currentTarget.style.background = "#e8efed", e.currentTarget.style.color = "#2c4d46")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent", e.currentTarget.style.color = "#8bb5a8")}
              title="Re-scrape"
            >
              <RefreshCw size={13} className={refreshMutation.isPending ? "animate-spin" : ""} />
            </button>
            <a
              href={data?.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-sm transition-colors"
              style={{ color: "#8bb5a8" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#e8efed", e.currentTarget.style.color = "#2c4d46")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent", e.currentTarget.style.color = "#8bb5a8")}
              title="Abrir anúncio original"
            >
              <ExternalLink size={13} />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-sm transition-colors"
              style={{ color: "#8bb5a8" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#e8efed", e.currentTarget.style.color = "#e74c3c")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent", e.currentTarget.style.color = "#8bb5a8")}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <RefreshCw size={16} className="mx-auto mb-2 animate-spin" style={{ color: "#8bb5a8" }} />
              <p className="text-xs" style={{ color: "#8bb5a8" }}>A obter detalhes...</p>
            </div>
          </div>
        ) : !detail ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <p className="text-xs" style={{ color: "#8bb5a8" }}>Não foi possível carregar os detalhes.</p>
              <a
                href={data?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs mt-1.5 inline-block transition-colors"
                style={{ color: "#2c4d46" }}
                onMouseEnter={(e) => e.currentTarget.style.color = "#8bb5a8"}
                onMouseLeave={(e) => e.currentTarget.style.color = "#2c4d46"}
              >
                Abrir original →
              </a>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Galeria */}
            {images.length > 0 && (
              <div className="relative bg-gray-100 aspect-square">
                <img
                  src={images[safeIdx]}
                  alt={`Foto ${safeIdx + 1}`}
                  className="w-full h-full object-cover"
                />
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => setPhotoIdx((i) => Math.max(0, i - 1))}
                      disabled={safeIdx === 0}
                      className="absolute left-2 top-1/2 -translate-y-1/2 transition-opacity disabled:opacity-20"
                      style={{ background: "rgba(255,255,255,0.9)", padding: "4px", borderRadius: "3px" }}
                      onMouseEnter={(e) => !(!safeIdx === 0) && (e.currentTarget.style.background = "white")}
                      onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.9)"}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={() => setPhotoIdx((i) => Math.min(images.length - 1, i + 1))}
                      disabled={safeIdx === images.length - 1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 transition-opacity disabled:opacity-20"
                      style={{ background: "rgba(255,255,255,0.9)", padding: "4px", borderRadius: "3px" }}
                      onMouseEnter={(e) => !(safeIdx === images.length - 1) && (e.currentTarget.style.background = "white")}
                      onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.9)"}
                    >
                      <ChevronRight size={14} />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white text-[10px] px-1.5 py-0.5" style={{ background: "rgba(0,0,0,0.6)", borderRadius: "3px" }}>
                      {safeIdx + 1} / {images.length}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-1 overflow-x-auto p-1.5" style={{ background: "#e8efed", borderBottom: "1px solid #e8efed" }}>
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoIdx(i)}
                    className="shrink-0 w-12 h-10 overflow-hidden transition-opacity"
                    style={{
                      borderRadius: "3px",
                      border: i === safeIdx ? "1px solid #2c4d46" : "1px solid transparent",
                      opacity: i === safeIdx ? 1 : 0.5
                    }}
                    onMouseEnter={(e) => i !== safeIdx && (e.currentTarget.style.opacity = "0.75")}
                    onMouseLeave={(e) => i !== safeIdx && (e.currentTarget.style.opacity = "0.5")}
                  >
                    <img src={img} alt={`thumb ${i}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Info */}
            <div className="p-3 space-y-3">
              {/* Preço & dados rápidos */}
              <div>
                <div className="flex items-baseline gap-2 mb-1">
                  {detail.price && (
                    <p className="text-lg font-bold" style={{ color: "#2c4d46" }}>
                      {detail.price.toLocaleString("pt-PT")} €
                    </p>
                  )}
                  {detail.pricePerM2 && (
                    <p className="text-[10px]" style={{ color: "#8bb5a8" }}>
                      {detail.pricePerM2.toLocaleString("pt-PT")} €/m²
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs" style={{ color: "#6b7e7a" }}>
                  {detail.bedrooms !== null && (
                    <span><b style={{ color: "#2c4d46" }}>T{detail.bedrooms}</b></span>
                  )}
                  {detail.area && (
                    <span><b style={{ color: "#2c4d46" }}>{detail.area}</b> m²</span>
                  )}
                  {detail.bathrooms !== null && (
                    <span><b style={{ color: "#2c4d46" }}>{detail.bathrooms}</b> WC</span>
                  )}
                </div>
              </div>

              {/* Endereço */}
              {detail.address && (
                <div className="flex items-start gap-1.5 text-xs" style={{ color: "#6b7e7a" }}>
                  <MapPin size={12} className="mt-0.5 shrink-0" style={{ color: "#8bb5a8" }} />
                  <span>{detail.address}</span>
                </div>
              )}

              {/* Características */}
              {detail.characteristics.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#8bb5a8" }}>
                    Características
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {detail.characteristics.map((c, i) => (
                      <div key={i} className="text-[10px] px-2 py-1.5" style={{ background: "#e8efed", borderRadius: "3px" }}>
                        <p className="uppercase font-medium" style={{ color: "#8bb5a8" }}>{c.label}</p>
                        <p style={{ color: "#2c4d46" }}>{c.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Descrição */}
              {detail.description && (
                <div>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#8bb5a8" }}>
                    Descrição
                  </h3>
                  <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: "#6b7e7a" }}>
                    {detail.description}
                  </p>
                </div>
              )}

              {/* Partilhar */}
              <div style={{ borderTop: "1px solid #e8efed", paddingTop: "12px" }}>
                <h3 className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#8bb5a8" }}>
                  Partilhar com cliente
                </h3>
                <p className="text-[10px] mb-2" style={{ color: "#8bb5a8" }}>
                  Link público com contactos substituídos.
                </p>
                {!shareUrl ? (
                  <button
                    onClick={() => shareMutation.mutate()}
                    disabled={shareMutation.isPending}
                    className="flex items-center gap-1.5 text-white text-xs px-2.5 py-1.5 transition-colors disabled:opacity-50"
                    style={{ background: "#2c4d46", borderRadius: "3px" }}
                    onMouseEnter={(e) => !shareMutation.isPending && (e.currentTarget.style.background = "#1f3a35")}
                    onMouseLeave={(e) => e.currentTarget.style.background = "#2c4d46"}
                  >
                    <Share2 size={12} />
                    {shareMutation.isPending ? "A gerar..." : "Gerar link"}
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 p-1.5" style={{ background: "#e8efed", borderRadius: "3px" }}>
                      <input
                        readOnly
                        value={shareUrl}
                        className="flex-1 bg-transparent text-xs outline-none"
                        style={{ color: "#2c4d46" }}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        onClick={copyShare}
                        className="flex items-center gap-0.5 text-[10px] px-2 py-1 transition-colors"
                        style={{
                          background: copied ? "#2c4d46" : "#8bb5a8",
                          color: "white",
                          borderRadius: "3px"
                        }}
                        onMouseEnter={(e) => !copied && (e.currentTarget.style.background = "#2c4d46")}
                        onMouseLeave={(e) => !copied && (e.currentTarget.style.background = "#8bb5a8")}
                      >
                        {copied ? <Check size={10} /> : <Copy size={10} />}
                        {copied ? "Copiado" : "Copiar"}
                      </button>
                      <a
                        href={shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-[10px] px-2 py-1 transition-colors"
                        style={{ background: "white", color: "#2c4d46", border: "1px solid #e8efed", borderRadius: "3px" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "#e8efed"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "white"}
                      >
                        Abrir <ExternalLink size={9} />
                      </a>
                    </div>
                    <div className="flex gap-1 text-[10px]">
                      <button
                        onClick={() => shareMutation.mutate()}
                        disabled={shareMutation.isPending || deleteShareMutation.isPending}
                        className="flex-1 flex items-center justify-center gap-0.5 py-1 transition-colors disabled:opacity-50"
                        style={{ background: "white", color: "#2c4d46", border: "1px solid #e8efed", borderRadius: "3px" }}
                        onMouseEnter={(e) => !shareMutation.isPending && (e.currentTarget.style.background = "#e8efed")}
                        onMouseLeave={(e) => e.currentTarget.style.background = "white"}
                      >
                        <RefreshCw size={10} className={shareMutation.isPending ? "animate-spin" : ""} />
                        Regenerar
                      </button>
                      <button
                        onClick={() => deleteShareMutation.mutate()}
                        disabled={deleteShareMutation.isPending || shareMutation.isPending}
                        className="flex-1 flex items-center justify-center gap-0.5 py-1 transition-colors disabled:opacity-50"
                        style={{ background: "white", color: "#e74c3c", border: "1px solid #e8efed", borderRadius: "3px" }}
                        onMouseEnter={(e) => !deleteShareMutation.isPending && (e.currentTarget.style.background = "#fff5f5")}
                        onMouseLeave={(e) => e.currentTarget.style.background = "white"}
                      >
                        <Trash2 size={10} />
                        Apagar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
