import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { fetchPublicShare } from "@/lib/api";
import { ChevronLeft, ChevronRight, MapPin, Mail, Phone, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function PublicShare() {
  const { token } = useParams<{ token: string }>();
  const [photoIdx, setPhotoIdx] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-share", token],
    queryFn: () => fetchPublicShare(token!),
    enabled: !!token,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setPhotoIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setPhotoIdx((i) => i + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">A carregar imóvel...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <Home size={48} className="mx-auto opacity-30 mb-3" />
          <p className="text-sm">Esta partilha não existe ou expirou.</p>
        </div>
      </div>
    );
  }

  const { detail, listing, profile } = data;
  const images = detail?.images ?? [];
  const safeIdx = Math.min(photoIdx, Math.max(0, images.length - 1));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header com perfil do agente */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt={profile.name ?? ""} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                {profile.name?.[0] ?? "M"}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-gray-800">{profile.name ?? "Agente Imobiliário"}</p>
              {profile.agency && <p className="text-xs text-gray-500">{profile.agency}</p>}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3 text-sm text-gray-600">
            {profile.phone && (
              <a href={`tel:${profile.phone}`} className="flex items-center gap-1.5 hover:text-blue-500">
                <Phone size={14} /> {profile.phone}
              </a>
            )}
            {profile.email && (
              <a href={`mailto:${profile.email}`} className="flex items-center gap-1.5 hover:text-blue-500">
                <Mail size={14} /> {profile.email}
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-5 space-y-5">
        {/* Galeria */}
        {images.length > 0 && (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="relative bg-gray-100 aspect-[16/9]">
              <img src={images[safeIdx]} alt={`Foto ${safeIdx + 1}`} className="w-full h-full object-cover" />
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setPhotoIdx((i) => Math.max(0, i - 1))}
                    disabled={safeIdx === 0}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white p-2 rounded-full shadow-lg disabled:opacity-30"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setPhotoIdx((i) => Math.min(images.length - 1, i + 1))}
                    disabled={safeIdx === images.length - 1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white p-2 rounded-full shadow-lg disabled:opacity-30"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full">
                    {safeIdx + 1} / {images.length}
                  </div>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto p-2 bg-gray-50">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoIdx(i)}
                    className={cn(
                      "shrink-0 w-20 h-14 rounded overflow-hidden border-2 transition-all",
                      i === safeIdx ? "border-blue-500" : "border-transparent opacity-60 hover:opacity-100"
                    )}
                  >
                    <img src={img} alt={`thumb ${i}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Info principal */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{detail?.title ?? listing.title ?? "Imóvel"}</h1>
            {detail?.address && (
              <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                <MapPin size={14} /> {detail.address}
              </p>
            )}
          </div>

          <div className="flex items-baseline justify-between flex-wrap gap-3 pb-4 border-b border-gray-100">
            <div>
              {(detail?.price ?? listing.price) && (
                <p className="text-3xl font-bold text-gray-900">
                  {(detail?.price ?? listing.price)!.toLocaleString("pt-PT")} €
                </p>
              )}
              {detail?.pricePerM2 && (
                <p className="text-xs text-gray-400 mt-0.5">{detail.pricePerM2.toLocaleString("pt-PT")} €/m²</p>
              )}
            </div>
            <div className="flex items-center gap-5 text-base text-gray-600">
              {detail?.bedrooms !== null && detail?.bedrooms !== undefined && (
                <span><b className="text-gray-800">T{detail.bedrooms}</b></span>
              )}
              {(detail?.area ?? listing.area) && (
                <span><b className="text-gray-800">{detail?.area ?? listing.area}</b> m²</span>
              )}
              {detail?.bathrooms !== null && detail?.bathrooms !== undefined && (
                <span><b className="text-gray-800">{detail.bathrooms}</b> WC</span>
              )}
            </div>
          </div>

          {/* Características */}
          {detail && detail.characteristics.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Características</h3>
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
          {detail?.description && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Descrição</h3>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{detail.description}</p>
            </div>
          )}
        </div>

        {/* CTA agente */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center gap-4 mb-4">
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt={profile.name ?? ""} className="w-14 h-14 rounded-full object-cover ring-2 ring-white/30" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">
                {profile.name?.[0] ?? "M"}
              </div>
            )}
            <div>
              <p className="text-lg font-semibold">{profile.name ?? "Agente Imobiliário"}</p>
              {profile.agency && <p className="text-sm text-white/80">{profile.agency}</p>}
              {profile.amiLicense && <p className="text-xs text-white/60 mt-0.5">AMI {profile.amiLicense}</p>}
            </div>
          </div>

          {profile.bio && <p className="text-sm text-white/90 mb-4">{profile.bio}</p>}

          <div className="flex flex-wrap gap-2">
            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className="flex items-center gap-2 bg-white text-blue-600 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-white/90 transition-colors"
              >
                <Phone size={14} /> {profile.phone}
              </a>
            )}
            {profile.email && (
              <a
                href={`mailto:${profile.email}`}
                className="flex items-center gap-2 bg-white/15 hover:bg-white/25 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                <Mail size={14} /> Enviar email
              </a>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 py-4">
          Partilhado por {profile.name ?? "agente imobiliário"} · Mittens
        </p>
      </main>
    </div>
  );
}
