/**
 * Scraper de portais imobiliários portugueses.
 *
 * Estado actual:
 *   - Imovirtual.com  ✅ via __NEXT_DATA__ (JSON estruturado, paginação até 5 páginas)
 *   - Casa Yes        ✅ via __NEXT_DATA__ (1 página, ideal para agências imobiliárias)
 *   - Idealista.pt    ⚠️  bloqueado por DataDome (HTTP 403). Requer proxy pago.
 */

export interface PropertyListing {
  externalId: string;
  source: "idealista" | "imovirtual" | "casayes";
  title: string;
  price: number | null;
  area: number | null;
  url: string;
  zone: string;
}

export interface SearchParams {
  zone: string;
  propertyType: string;       // T0 | T1 | T2 | T3 | T4 | T4+
  transactionType: "rent" | "buy";
  maxPrice?: number | null;
  minPrice?: number | null;
  minArea?: number | null;
  maxArea?: number | null;
  buildYearMin?: number | null;
  market?: "primary" | "secondary" | null;   // novo / usado
  ownerType?: "agency" | "private" | null;   // agência / particular
}

// NOTA: NÃO definir "Accept-Encoding" — undici/fetch só auto-descomprime
// gzip/br se este header não for fornecido pelo cliente. Caso contrário a
// resposta vem comprimida em binário e o regex de __NEXT_DATA__ falha.
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
};

function slugify(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// ─── Lookup distrito→municípios (PT) ─────────────────────────────────────────
// Cobre as principais zonas onde os agentes RE/MAX costumam operar.
// Se a zona for um distrito (ex: "Lisboa"), usa-se distrito/distrito.
// Se for município, procura-se o distrito na tabela.

const DISTRITOS = new Set([
  "aveiro", "beja", "braga", "braganca", "castelo-branco", "coimbra", "evora",
  "faro", "guarda", "leiria", "lisboa", "portalegre", "porto", "santarem",
  "setubal", "viana-do-castelo", "vila-real", "viseu", "acores", "madeira",
]);

const MUNICIPIO_TO_DISTRITO: Record<string, string> = {
  // Lisboa
  "amadora": "lisboa", "cascais": "lisboa", "lisboa": "lisboa", "loures": "lisboa",
  "mafra": "lisboa", "odivelas": "lisboa", "oeiras": "lisboa", "sintra": "lisboa",
  "vila-franca-de-xira": "lisboa", "alenquer": "lisboa", "torres-vedras": "lisboa",
  // Porto
  "porto": "porto", "matosinhos": "porto", "vila-nova-de-gaia": "porto",
  "maia": "porto", "gondomar": "porto", "valongo": "porto", "povoa-de-varzim": "porto",
  "santo-tirso": "porto", "trofa": "porto", "vila-do-conde": "porto",
  // Setúbal
  "almada": "setubal", "barreiro": "setubal", "moita": "setubal", "montijo": "setubal",
  "palmela": "setubal", "seixal": "setubal", "sesimbra": "setubal", "setubal": "setubal",
  // Faro
  "albufeira": "faro", "faro": "faro", "lagos": "faro", "loule": "faro",
  "olhao": "faro", "portimao": "faro", "tavira": "faro", "silves": "faro",
  // Outros
  "braga": "braga", "guimaraes": "braga", "barcelos": "braga", "famalicao": "braga",
  "coimbra": "coimbra", "leiria": "leiria", "aveiro": "aveiro",
};

function buildImovirtualPath(zone: string): string {
  const slug = slugify(zone);
  if (DISTRITOS.has(slug)) return `${slug}/${slug}`;
  const distrito = MUNICIPIO_TO_DISTRITO[slug];
  if (distrito) return `${distrito}/${slug}`;
  // Fallback: tenta como distrito puro
  return slug;
}

// ─── Imovirtual.com ───────────────────────────────────────────────────────────

const ROOMS_MAP: Record<string, string[]> = {
  T0: ["ONE"],
  T1: ["TWO"],
  T2: ["THREE"],
  T3: ["FOUR"],
  T4: ["FIVE"],
  "T4+": ["FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN"],
};

const ESTATE_MAP: Record<string, string> = {
  T0: "apartamento", T1: "apartamento", T2: "apartamento",
  T3: "apartamento", T4: "apartamento", "T4+": "apartamento",
};

interface ImovirtualAd {
  id: number;
  title: string;
  slug: string;
  estate: string;
  totalPrice: { value: number } | null;
  rentPrice: { value: number } | null;
  areaInSquareMeters: number | null;
  roomsNumber: string | null;
  location?: {
    address?: {
      city?: { name?: string };
      province?: { name?: string };
    };
  };
}

const MAX_IMOVIRTUAL_PAGES = 5; // até ~180 anúncios por scrape

async function fetchImovirtualPage(url: string): Promise<ImovirtualAd[]> {
  let html: string;
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
    if (!res.ok) {
      console.warn(`[Scraper] Imovirtual HTTP ${res.status} (${url})`);
      return [];
    }
    html = await res.text();
  } catch (err) {
    console.error(`[Scraper] Imovirtual fetch error:`, err);
    return [];
  }

  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  try {
    const data = JSON.parse(m[1]) as {
      props?: { pageProps?: { data?: { searchAds?: { items?: ImovirtualAd[]; pagination?: { totalPages: number } } } } };
    };
    return data?.props?.pageProps?.data?.searchAds?.items ?? [];
  } catch {
    return [];
  }
}

export async function scrapeImovirtual(params: SearchParams): Promise<PropertyListing[]> {
  const tx = params.transactionType === "rent" ? "arrendar" : "comprar";
  const propType = ESTATE_MAP[params.propertyType] ?? "apartamento";
  const zonePath = buildImovirtualPath(params.zone);
  const allowedRooms = ROOMS_MAP[params.propertyType] ?? [];

  // Construir filtros server-side
  const baseQs = new URLSearchParams();
  if (allowedRooms.length > 0) {
    baseQs.set("roomsNumber", `[${allowedRooms.join(",")}]`);
  }
  if (params.maxPrice) baseQs.set("priceMax", String(params.maxPrice));
  if (params.minPrice) baseQs.set("priceMin", String(params.minPrice));
  if (params.minArea) baseQs.set("areaMin", String(params.minArea));
  if (params.maxArea) baseQs.set("areaMax", String(params.maxArea));
  if (params.buildYearMin) baseQs.set("buildYearMin", String(params.buildYearMin));
  if (params.market === "primary") baseQs.set("market", "PRIMARY");
  else if (params.market === "secondary") baseQs.set("market", "SECONDARY");
  if (params.ownerType === "agency") baseQs.set("ownerTypeSingleSelect", "AGENCY");
  else if (params.ownerType === "private") baseQs.set("ownerTypeSingleSelect", "PRIVATE");

  const baseUrl = `https://www.imovirtual.com/pt/resultados/${tx}/${propType}/${zonePath}`;

  // Página 1
  const pageUrl = (page: number) => {
    const qs = new URLSearchParams(baseQs);
    if (page > 1) qs.set("page", String(page));
    const q = qs.toString();
    return q ? `${baseUrl}?${q}` : baseUrl;
  };

  const allItems: ImovirtualAd[] = [];
  for (let page = 1; page <= MAX_IMOVIRTUAL_PAGES; page++) {
    const items = await fetchImovirtualPage(pageUrl(page));
    if (items.length === 0) break;
    allItems.push(...items);
    if (items.length < 30) break; // última página tem menos de 36 anúncios
    // pequeno delay para ser bem-comportado
    await new Promise((r) => setTimeout(r, 400));
  }

  if (allItems.length === 0) {
    console.log(`[Scraper] Imovirtual: 0 anúncios para "${params.zone}"`);
    return [];
  }

  const listings: PropertyListing[] = [];
  const seenIds = new Set<string>();
  for (const ad of allItems) {
    if (!ad?.id || !ad.slug) continue;
    const idStr = String(ad.id);
    if (seenIds.has(idStr)) continue;
    seenIds.add(idStr);

    const price =
      params.transactionType === "rent"
        ? ad.rentPrice?.value ?? ad.totalPrice?.value ?? null
        : ad.totalPrice?.value ?? null;

    const cityName =
      ad.location?.address?.city?.name ??
      ad.location?.address?.province?.name ??
      params.zone;

    listings.push({
      externalId: idStr,
      source: "imovirtual",
      title: ad.title || `Anúncio ${ad.id}`,
      price,
      area: ad.areaInSquareMeters ? Math.round(ad.areaInSquareMeters) : null,
      url: `https://www.imovirtual.com/pt/anuncio/${ad.slug}`,
      zone: cityName,
    });
  }

  console.log(`[Scraper] Imovirtual ${params.zone}/${params.propertyType}: ${listings.length} resultados`);
  return listings;
}

// ─── Casa Yes ─────────────────────────────────────────────────────────────────
// URL: https://casayes.pt/pt/<comprar|arrendar>/apartamento/<distrito>/<municipio>
// Pagina via JSON interno hidden — extraímos os 20 anúncios SSG iniciais.
// Filtramos client-side por nº de quartos e preço.

interface CasaYesAd {
  publicId: string;
  listingPrice: number | null;
  totalArea: number | null;
  numberOfBedrooms: number | null;
  regionName2?: string;
  regionName3?: string;
  seoUriDescription?: string;
  listingTypeLabel?: string;
}

function bedroomsForType(propertyType: string): number[] {
  // T0=0BR, T1=1BR, T2=2BR... T4+ = 4 ou mais
  const map: Record<string, number[]> = {
    T0: [0], T1: [1], T2: [2], T3: [3], T4: [4],
    "T4+": [4, 5, 6, 7, 8, 9, 10],
  };
  return map[propertyType] ?? [];
}

export async function scrapeCasaYes(params: SearchParams): Promise<PropertyListing[]> {
  const tx = params.transactionType === "rent" ? "arrendar" : "comprar";
  const zonePath = buildImovirtualPath(params.zone); // mesmo formato distrito/municipio
  const url = `https://casayes.pt/pt/${tx}/apartamento/${zonePath}`;

  let html: string;
  try {
    const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
    if (!res.ok) {
      console.warn(`[Scraper] Casa Yes HTTP ${res.status} (${url})`);
      return [];
    }
    html = await res.text();
  } catch (err) {
    console.error(`[Scraper] Casa Yes fetch error:`, err);
    return [];
  }

  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) {
    console.warn(`[Scraper] Casa Yes: __NEXT_DATA__ não encontrado`);
    return [];
  }

  let data: {
    props?: {
      pageProps?: {
        initialSearchResultsInfo?: { items?: CasaYesAd[]; totalCount?: number };
      };
    };
  };
  try {
    data = JSON.parse(m[1]);
  } catch (err) {
    console.error(`[Scraper] Casa Yes: erro a parsear JSON:`, err);
    return [];
  }

  const items = data?.props?.pageProps?.initialSearchResultsInfo?.items ?? [];
  if (items.length === 0) {
    console.log(`[Scraper] Casa Yes: 0 anúncios para "${params.zone}"`);
    return [];
  }

  const allowedBedrooms = bedroomsForType(params.propertyType);

  const listings: PropertyListing[] = [];
  for (const ad of items) {
    if (!ad?.publicId) continue;

    if (
      allowedBedrooms.length > 0 &&
      ad.numberOfBedrooms !== null &&
      ad.numberOfBedrooms !== undefined &&
      !allowedBedrooms.includes(ad.numberOfBedrooms)
    ) {
      continue;
    }

    if (params.maxPrice && ad.listingPrice && ad.listingPrice > params.maxPrice) continue;
    if (params.minPrice && ad.listingPrice && ad.listingPrice < params.minPrice) continue;
    if (params.minArea && ad.totalArea && ad.totalArea < params.minArea) continue;
    if (params.maxArea && ad.totalArea && ad.totalArea > params.maxArea) continue;
    // Casa Yes não expõe ano construção, mercado nem tipo de anunciante na listagem.
    // Esses filtros aplicam-se apenas a Imovirtual.

    // Construir título a partir de tipologia + zona (Casa Yes não tem título livre)
    const tipologia = ad.numberOfBedrooms !== null && ad.numberOfBedrooms !== undefined
      ? `T${ad.numberOfBedrooms}`
      : "Apartamento";
    const local = [ad.regionName3, ad.regionName2].filter(Boolean).join(", ");
    const title = `${tipologia} em ${local || params.zone}`;

    const slug = ad.seoUriDescription || `${tx}-apartamento-${slugify(params.zone)}`;
    const url = `https://casayes.pt/pt/imovel/${slug}/${ad.publicId}`;

    listings.push({
      externalId: ad.publicId,
      source: "casayes",
      title,
      price: ad.listingPrice ?? null,
      area: ad.totalArea ?? null,
      url,
      zone: ad.regionName2 || params.zone,
    });
  }

  console.log(`[Scraper] Casa Yes ${params.zone}/${params.propertyType}: ${listings.length} resultados`);
  return listings;
}

// ─── Idealista.pt ─────────────────────────────────────────────────────────────
// Bloqueado por DataDome. Mantemos a função pronta para activar quando houver
// proxy pago. Por agora retorna [] e regista warning.

export async function scrapeIdealista(_params: SearchParams): Promise<PropertyListing[]> {
  // TODO: integrar serviço de proxy (ScrapeOps / BrightData / ScraperAPI).
  // Sem proxy, Idealista responde 403 sistematicamente.
  return [];
}

// ─── Função principal — corre ambos ──────────────────────────────────────────

export async function scrapeAll(params: SearchParams): Promise<PropertyListing[]> {
  const [idealista, imovirtual, casayes] = await Promise.allSettled([
    scrapeIdealista(params),
    scrapeImovirtual(params),
    scrapeCasaYes(params),
  ]);

  const results: PropertyListing[] = [];
  if (idealista.status === "fulfilled") results.push(...idealista.value);
  if (imovirtual.status === "fulfilled") results.push(...imovirtual.value);
  if (casayes.status === "fulfilled") results.push(...casayes.value);

  return results;
}
