/**
 * Leitura da página pública de uma agência no Imovirtual.
 *
 *   https://www.imovirtual.com/pt/empresas/agencias-imobiliarias/{slug}
 *     ?transaction=SELL|RENT &by=LATEST &direction=DESC &page=N
 *
 * A página é Next.js e traz o inventário em __NEXT_DATA__ → props.pageProps.searchAds
 * (6 anúncios por página, com paginação). Ordenamos por mais recentes para que a
 * varredura incremental possa parar assim que só encontra anúncios já conhecidos.
 *
 * Pedidos simples de HTML, sequenciais e com pausa entre eles — o mesmo que um
 * visitante a folhear a página da agência.
 */

const BASE = "https://www.imovirtual.com/pt/empresas/agencias-imobiliarias";

// Sem Accept-Encoding: o fetch do Node só descomprime sozinho se o cliente não o definir.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
};

export type AgencyTx = "SELL" | "RENT";

interface RawAd {
  id: number;
  title?: string;
  slug: string;
  estate?: string;
  transaction?: string;
  location?: {
    address?: {
      street?: { name?: string } | null;
      city?: { name?: string } | null;
      province?: { name?: string } | null;
    };
    reverseGeocoding?: { locations?: { id?: string; fullName?: string }[] };
  };
  images?: { medium?: string; large?: string }[];
  totalPrice?: { value: number } | null;
  rentPrice?: { value: number } | null;
  hidePrice?: boolean;
  areaInSquareMeters?: number | null;
  roomsNumber?: string | null;
  floorNumber?: string | null;
  createdAtFirst?: string | null;
  pushedUpAt?: string | null;
}

export interface AgencyAd {
  externalId: string;
  agencyId: string;
  transaction: AgencyTx;
  estate: string | null;
  title: string;
  url: string;
  price: number | null;
  area: number | null;
  /** Tipologia T0..T10 (o Imovirtual conta divisões: roomsNumber = T + 1) */
  typology: string | null;
  floor: string | null;
  parish: string | null;
  municipality: string | null;
  district: string | null;
  image: string | null;
  createdAt: string | null;
}

export interface AgencyPage {
  ads: AgencyAd[];
  totalItems: number;
  totalPages: number;
  page: number;
}

const WORD_NUM: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, MORE: 11,
};

function typologyOf(rooms: string | null | undefined, estate: string | undefined): string | null {
  if (!rooms || (estate && estate !== "FLAT" && estate !== "HOUSE")) return null;
  const n = WORD_NUM[rooms];
  return n ? `T${n - 1}` : null;
}

/** Concelho a partir do reverse geocoding: o id com 2 níveis ("setubal/moita"). */
function municipalityOf(ad: RawAd): string | null {
  const locs = ad.location?.reverseGeocoding?.locations ?? [];
  const council = locs.find((l) => (l.id ?? "").split("/").length === 2);
  return council?.fullName ? council.fullName.split(",")[0].trim() : null;
}

function mapAd(ad: RawAd, agencyId: string, tx: AgencyTx): AgencyAd {
  const price = tx === "RENT" ? ad.rentPrice?.value ?? ad.totalPrice?.value : ad.totalPrice?.value;
  return {
    externalId: String(ad.id),
    agencyId,
    transaction: tx,
    estate: ad.estate ?? null,
    title: ad.title || `Anúncio ${ad.id}`,
    url: `https://www.imovirtual.com/pt/anuncio/${ad.slug}`,
    price: ad.hidePrice ? null : price ?? null,
    area: ad.areaInSquareMeters ? Math.round(ad.areaInSquareMeters) : null,
    typology: typologyOf(ad.roomsNumber, ad.estate),
    floor: ad.floorNumber ?? null,
    parish: ad.location?.address?.city?.name ?? null,
    municipality: municipalityOf(ad),
    district: ad.location?.address?.province?.name ?? null,
    image: ad.images?.[0]?.large ?? ad.images?.[0]?.medium ?? null,
    createdAt: ad.createdAtFirst ?? null,
  };
}

export class ImovirtualHttpError extends Error {
  constructor(public status: number, url: string) {
    super(`Imovirtual HTTP ${status} (${url})`);
  }
}

export function agencyPageUrl(slug: string, tx: AgencyTx, page: number): string {
  const qs = new URLSearchParams({ transaction: tx, by: "LATEST", direction: "DESC" });
  if (page > 1) qs.set("page", String(page));
  return `${BASE}/${slug}?${qs}`;
}

export async function fetchAgencyPage(
  slug: string,
  agencyId: string,
  tx: AgencyTx,
  page: number,
): Promise<AgencyPage> {
  const url = agencyPageUrl(slug, tx, page);
  const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!res.ok) throw new ImovirtualHttpError(res.status, url);
  const html = await res.text();

  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`__NEXT_DATA__ em falta (${url})`);

  const data = JSON.parse(m[1]) as {
    props?: {
      pageProps?: {
        searchAds?: {
          items?: RawAd[];
          pagination?: { totalItems: number; totalPages: number; currentPage: number };
        };
      };
    };
  };
  const sa = data.props?.pageProps?.searchAds;
  const items = sa?.items ?? [];
  const pg = sa?.pagination;
  return {
    ads: items.filter((a) => a?.id && a.slug).map((a) => mapAd(a, agencyId, tx)),
    totalItems: pg?.totalItems ?? items.length,
    totalPages: pg?.totalPages ?? 1,
    page: pg?.currentPage ?? page,
  };
}
