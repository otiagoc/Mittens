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
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-800 truncate max-w-md">
              {detail?.title ?? data?.title ?? "Imóvel"}
            </h2>
            {data?.source && (
              <span
                className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full text-white",
                )}
                style={{
                  background:
                    data.source === "casayes" ? "#10b981" :
                    data.source === "idealista" ? "#e74c3c" : "#3498db",
                }}
              >
                {data.source === "casayes" ? "Casa Yes" : data.source === "idealista" ? "Idealista" : "Imovirtual"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending || isFetching}
              className="p-2 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-40"
              title="Re-scrape"
            >
              <RefreshCw size={15} className={refreshMutation.isPending ? "animate-spin" : ""} />
            </button>
            <a
              href={data?.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
              title="Abrir anúncio original"
            >
              <ExternalLink size={15} />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <RefreshCw size={24} className="mx-auto mb-2 animate-spin opacity-50" />
              <p className="text-sm">A obter detalhes do anúncio...</p>
            </div>
          </div>
        ) : !detail ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 p-10">
            <div className="text-center">
              <p className="text-sm">Não foi possível carregar os detalhes deste anúncio.</p>
              <a
                href={data?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 text-sm mt-2 inline-block"
              >
                Abrir anúncio original →
              </a>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Galeria */}
            {images.length > 0 && (
              <div className="relative bg-gray-100 aspect-[16/10]">
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
                      className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white p-2 rounded-full shadow-lg disabled:opacity-30 transition-all"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={() => setPhotoIdx((i) => Math.min(images.length - 1, i + 1))}
                      disabled={safeIdx === images.length - 1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white p-2 rounded-full shadow-lg disabled:opacity-30 transition-all"
                    >
                      <ChevronRight size={18} />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full">
                      {safeIdx + 1} / {images.length}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto p-2 bg-gray-50 border-b border-gray-100">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoIdx(i)}
                    className={cn(
                      "shrink-0 w-16 h-12 rounded overflow-hidden border-2 transition-all",
                      i === safeIdx ? "border-blue-500" : "border-transparent opacity-60 hover:opacity-100"
                    )}
                  >
                    <img src={img} alt={`thumb ${i}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Info */}
            <div className="p-5 space-y-5">
              {/* Preço & dados rápidos */}
              <div className="flex items-baseline justify-between flex-wrap gap-2">
                <div>
                  {detail.price && (
                    <p className="text-2xl font-bold text-gray-900">
                      {detail.price.toLocaleString("pt-PT")} €
                    </p>
                  )}
                  {detail.pricePerM2 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {detail.pricePerM2.toLocaleString("pt-PT")} €/m²
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  {detail.bedrooms !== null && (
                    <span><b className="text-gray-800">T{detail.bedrooms}</b></span>
                  )}
                  {detail.area && (
                    <span><b className="text-gray-800">{detail.area}</b> m²</span>
                  )}
                  {detail.bathrooms !== null && (
                    <span><b className="text-gray-800">{detail.bathrooms}</b> WC</span>
                  )}
                </div>
              </div>

              {/* Endereço */}
              {detail.address && (
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />
                  <span>{detail.address}</span>
                </div>
              )}

              {/* Características */}
              {detail.characteristics.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Características
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {detail.characteristics.map((c, i) => (
                      <div key={i} className="text-sm border border-gray-100 rounded-lg px-3 py-2 bg-gray-50/50">
                        <p className="text-[10px] uppercase text-gray-400 font-medium">{c.label}</p>
                        <p className="text-gray-800">{c.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Descrição */}
              {detail.description && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Descrição
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {detail.description}
                  </p>
                </div>
              )}

              {/* Partilhar */}
              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Partilhar com cliente
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Cria um link público com este imóvel onde os contactos do anunciante são
                  substituídos pelos teus. O cliente vê tudo num único sítio.
                </p>
                {!shareUrl ? (
                  <button
                    onClick={() => shareMutation.mutate()}
                    disabled={shareMutation.isPending}
                    className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    <Share2 size={14} />
                    {shareMutation.isPending ? "A gerar link..." : "Gerar link de partilha"}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
                    <input
                      readOnly
                      value={shareUrl}
                      className="flex-1 bg-transparent text-sm text-gray-700 outline-none px-2"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                      onClick={copyShare}
                      className={cn(
                        "flex items-center gap-1 text-xs px-3 py-1.5 rounded-md font-medium transition-colors",
                        copied
                          ? "bg-green-500 text-white"
                          : "bg-blue-500 hover:bg-blue-600 text-white"
                      )}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? "Copiado" : "Copiar"}
                    </button>
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md font-medium bg-white border border-gray-200 text-gray-600 hover:text-blue-500 transition-colors"
                    >
                      Abrir <ExternalLink size={11} />
                    </a>
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
