import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { fetchPublicShare } from "@/lib/api";
import { ChevronLeft, ChevronRight, MapPin, Mail, Phone, Home, Maximize2, X, Bed, Bath, Ruler } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function PublicShare() {
  const { token } = useParams<{ token: string }>();
  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-share", token],
    queryFn: () => fetchPublicShare(token!),
    enabled: !!token,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setPhotoIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight" && data) {
        const images = data.detail?.images ?? [];
        setPhotoIdx((i) => Math.min(images.length - 1, i + 1));
      }
      if (e.key === "Escape") setLightbox(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f7f8f9" }}>
        <p className="text-sm" style={{ color: "#8bb5a8" }}>A carregar imóvel...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f7f8f9" }}>
        <div className="text-center" style={{ color: "#8bb5a8" }}>
          <Home size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Esta partilha não existe ou expirou.</p>
        </div>
      </div>
    );
  }

  const { detail, listing, profile } = data;
  const images = detail?.images ?? [];
  const safeIdx = Math.min(photoIdx, Math.max(0, images.length - 1));
  const price = detail?.price ?? listing.price;
  const area = detail?.area ?? listing.area;

  return (
    <div className="min-h-screen" style={{ background: "#f7f8f9", fontFamily: "Montserrat, sans-serif" }}>

      {/* Header */}
      <header style={{ background: "#2c4d46", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt={profile.name ?? ""} className="w-9 h-9 rounded-full object-cover ring-2 ring-white/20" />
            ) : (
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
                {profile.name?.[0] ?? "M"}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-white leading-tight">{profile.name ?? "Agente Imobiliário"}</p>
              {profile.agency && <p className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>{profile.agency}</p>}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
            {profile.phone && (
              <a href={`tel:${profile.phone}`} className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80" style={{ color: "rgba(255,255,255,0.9)" }}>
                <Phone size={13} /> {profile.phone}
              </a>
            )}
            {profile.email && (
              <a href={`mailto:${profile.email}`} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-80" style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>
                <Mail size={12} /> Email
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Título + morada — acima do grid */}
        <div className="mb-4">
          <h1 className="text-xl font-bold leading-snug" style={{ color: "#1a2e2a" }}>
            {detail?.title ?? listing.title ?? "Imóvel"}
          </h1>
          {detail?.address && (
            <p className="flex items-center gap-1.5 text-sm mt-1" style={{ color: "#6b7e7a" }}>
              <MapPin size={13} /> {detail.address}
            </p>
          )}
        </div>

        {/* Grid principal: galeria + sidebar */}
        <div className="flex gap-5 items-start">

          {/* Coluna esquerda — galeria + detalhes */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Galeria */}
            {images.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ background: "#e8efed" }}>
                <div className="relative aspect-[16/10] bg-gray-100">
                  <img
                    src={images[safeIdx]}
                    alt={`Foto ${safeIdx + 1}`}
                    className="w-full h-full object-cover cursor-zoom-in"
                    onClick={() => setLightbox(true)}
                  />
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() => setPhotoIdx((i) => Math.max(0, i - 1))}
                        disabled={safeIdx === 0}
                        className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full shadow-md transition-opacity disabled:opacity-20"
                        style={{ background: "white" }}
                      >
                        <ChevronLeft size={16} style={{ color: "#2c4d46" }} />
                      </button>
                      <button
                        onClick={() => setPhotoIdx((i) => Math.min(images.length - 1, i + 1))}
                        disabled={safeIdx === images.length - 1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full shadow-md transition-opacity disabled:opacity-20"
                        style={{ background: "white" }}
                      >
                        <ChevronRight size={16} style={{ color: "#2c4d46" }} />
                      </button>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs px-2.5 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.55)", color: "white" }}>
                        {safeIdx + 1} / {images.length}
                      </div>
                    </>
                  )}
                  <button
                    onClick={() => setLightbox(true)}
                    className="absolute top-3 right-3 p-2 rounded-lg shadow-sm transition-opacity hover:opacity-80"
                    style={{ background: "white" }}
                    title="Ver em ecrã inteiro"
                  >
                    <Maximize2 size={14} style={{ color: "#2c4d46" }} />
                  </button>
                </div>

                {/* Thumbnails */}
                {images.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto p-2.5" style={{ background: "#f0f5f3" }}>
                    {images.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setPhotoIdx(i)}
                        className={cn(
                          "shrink-0 w-18 h-12 rounded-lg overflow-hidden border-2 transition-all",
                          i === safeIdx ? "opacity-100" : "opacity-50 hover:opacity-80"
                        )}
                        style={{ borderColor: i === safeIdx ? "#2c4d46" : "transparent", width: 72, height: 48 }}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Características rápidas (pills) */}
            {(detail?.bedrooms != null || area || detail?.bathrooms != null) && (
              <div className="flex flex-wrap gap-2">
                {detail?.bedrooms != null && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold" style={{ background: "white", color: "#2c4d46", border: "1px solid #e8efed" }}>
                    <Bed size={14} style={{ color: "#8bb5a8" }} /> T{detail.bedrooms}
                  </div>
                )}
                {area && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold" style={{ background: "white", color: "#2c4d46", border: "1px solid #e8efed" }}>
                    <Ruler size={14} style={{ color: "#8bb5a8" }} /> {area} m²
                  </div>
                )}
                {detail?.bathrooms != null && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold" style={{ background: "white", color: "#2c4d46", border: "1px solid #e8efed" }}>
                    <Bath size={14} style={{ color: "#8bb5a8" }} /> {detail.bathrooms} WC
                  </div>
                )}
              </div>
            )}

            {/* Descrição */}
            {detail?.description && (
              <div className="rounded-2xl p-5" style={{ background: "white", border: "1px solid #ececec" }}>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#8bb5a8" }}>Descrição</h3>
                <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#4a5e5a" }}>{detail.description}</p>
              </div>
            )}
          </div>

          {/* Sidebar direita — preço + agente */}
          <div className="w-72 shrink-0 space-y-3 sticky top-4">

            {/* Card de preço */}
            <div className="rounded-2xl p-5" style={{ background: "white", border: "1px solid #ececec" }}>
              {price && (
                <>
                  <p className="text-2xl font-bold leading-tight" style={{ color: "#2c4d46" }}>
                    {price.toLocaleString("pt-PT")} €
                  </p>
                  {detail?.pricePerM2 && (
                    <p className="text-xs mt-0.5" style={{ color: "#8bb5a8" }}>{detail.pricePerM2.toLocaleString("pt-PT")} €/m²</p>
                  )}
                  <div className="my-3 h-px" style={{ background: "#f0f2f1" }} />
                </>
              )}

              {/* Mini specs */}
              <div className="flex gap-4 text-xs font-semibold" style={{ color: "#6b7e7a" }}>
                {detail?.bedrooms != null && <span>T{detail.bedrooms}</span>}
                {area && <span>{area} m²</span>}
                {detail?.bathrooms != null && <span>{detail.bathrooms} WC</span>}
              </div>
            </div>

            {/* Card do agente */}
            <div className="rounded-2xl p-5 space-y-4" style={{ background: "#2c4d46" }}>
              <div className="flex items-center gap-3">
                {profile.photoUrl ? (
                  <img src={profile.photoUrl} alt={profile.name ?? ""} className="w-12 h-12 rounded-full object-cover ring-2 ring-white/20" />
                ) : (
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
                    {profile.name?.[0] ?? "M"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{profile.name ?? "Agente"}</p>
                  {profile.agency && <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.65)" }}>{profile.agency}</p>}
                  {profile.amiLicense && <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.45)" }}>AMI {profile.amiLicense}</p>}
                </div>
              </div>

              {profile.bio && (
                <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{profile.bio}</p>
              )}

              <div className="space-y-2">
                {profile.phone && (
                  <a
                    href={`tel:${profile.phone}`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ background: "white", color: "#2c4d46" }}
                  >
                    <Phone size={14} /> {profile.phone}
                  </a>
                )}
                {profile.email && (
                  <a
                    href={`mailto:${profile.email}`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                    style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
                  >
                    <Mail size={13} /> Enviar email
                  </a>
                )}
              </div>
            </div>

            {/* Características na sidebar */}
            {detail && detail.characteristics.length > 0 && (
              <div className="rounded-2xl p-5" style={{ background: "white", border: "1px solid #ececec" }}>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#8bb5a8" }}>Características</h3>
                <div className="space-y-2">
                  {detail.characteristics.map((c, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 py-1.5" style={{ borderBottom: i < detail.characteristics.length - 1 ? "1px solid #f0f2f1" : "none" }}>
                      <span className="text-xs" style={{ color: "#8bb5a8" }}>{c.label}</span>
                      <span className="text-xs font-semibold text-right" style={{ color: "#2c4d46" }}>{c.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-center text-[10px]" style={{ color: "#c0cbc8" }}>
              Partilhado via Mittens
            </p>
          </div>
        </div>
      </main>

      {/* Lightbox */}
      {lightbox && images.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.92)" }}
          onClick={() => setLightbox(false)}
        >
          <button
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 p-2 rounded-full"
            style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
          >
            <X size={20} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setPhotoIdx((i) => Math.max(0, i - 1)); }}
            disabled={safeIdx === 0}
            className="absolute left-4 p-3 rounded-full disabled:opacity-20"
            style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
          >
            <ChevronLeft size={22} />
          </button>
          <img
            src={images[safeIdx]}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={(e) => { e.stopPropagation(); setPhotoIdx((i) => Math.min(images.length - 1, i + 1)); }}
            disabled={safeIdx === images.length - 1}
            className="absolute right-4 p-3 rounded-full disabled:opacity-20"
            style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
          >
            <ChevronRight size={22} />
          </button>
          <div className="absolute bottom-4 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            {safeIdx + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  );
}
