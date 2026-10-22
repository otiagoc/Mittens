/**
 * Scrapers dos sites das grandes redes imobiliárias (RE/MAX, ERA, Century 21, KW).
 *
 * Todos usam a API interna que o próprio site chama no browser — JSON
 * estruturado, sem leitura de HTML frágil e sem contornar proteções.
 *
 *   - RE/MAX      POST remax.pt/api/Listing/PaginatedMultiMatchSearchWithGeoHash (sem cookies)
 *   - ERA         POST era.pt/API/ServicesModule/Property/Search (precisa de cookie + token da página)
 *   - Century 21  GET  century21.pt/api/properties (sem cookies) + /api/autocomplete para a zona
 *   - KW          POST kwportugal.pt/api/portal/listProperties (sem cookies) + lista de concelhos/freguesias
 *
 * Mantém o mesmo contrato do scraper.ts (SearchParams → PropertyListing[]).
 * A Mittens trabalha só com apartamentos (T0…T4+), por isso todos filtram apartamentos.
 */

import type { PropertyListing, SearchParams } from "./scraper.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const MAX_RESULTS = 150; // por portal e por alerta — chega para apanhar os anúncios novos
const TIMEOUT_MS = 20_000;

// ─── Utilitários ──────────────────────────────────────────────────────────────

/** "Quinta do Conde" → "quinta do conde" (sem acentos, minúsculas, espaços simples) */
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "Quinta do Conde" → "quinta-do-conde" */
function slug(s: string): string {
  return norm(s).replace(/\s+/g, "-");
}

/** Para URLs da KW: mantém maiúsculas, tira acentos ("Setúbal" → "Setubal", "Quinta do Conde" → "Quinta-do-Conde") */
function kwSlug(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const politeDelay = () => sleep(600 + Math.random() * 600);

async function http(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "pt-PT,pt;q=0.9", ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(t);
  }
}

async function json<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await http(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return (await res.json()) as T;
}

/** "T2" → 2 ; "T4+" → 4 ; desconhecido → null */
function bedroomsOf(propertyType: string): { n: number | null; orMore: boolean } {
  const m = /^T(\d)(\+)?$/i.exec(propertyType.trim());
  if (!m) return { n: null, orMore: false };
  return { n: Number(m[1]), orMore: Boolean(m[2]) };
}

/** Alguns portais devolvem números como texto ("2") — normaliza para number|null */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function bedroomsMatch(roomsRaw: unknown, propertyType: string): boolean {
  const { n, orMore } = bedroomsOf(propertyType);
  if (n === null) return true;
  const rooms = toNum(roomsRaw);
  if (rooms === null) return true; // sem info → não excluir
  return orMore ? rooms >= n : rooms === n;
}

/** Filtros comuns aplicados no cliente (seguro mesmo quando o portal já filtrou) */
function passesFilters(
  p: { price: number | null; area: number | null; rooms?: unknown },
  params: SearchParams,
): boolean {
  if (!bedroomsMatch(p.rooms, params.propertyType)) return false;
  if (params.maxPrice && p.price && p.price > params.maxPrice) return false;
  if (params.minPrice && p.price && p.price < params.minPrice) return false;
  if (params.minArea && p.area && p.area < params.minArea) return false;
  if (params.maxArea && p.area && p.area > params.maxArea) return false;
  return true;
}

/** "359.000 €" → 359000 ; "Sob Consulta" → null */
function parseEuro(v: string | null | undefined): number | null {
  if (!v) return null;
  const digits = v.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

const positiveOrNull = (n: unknown): number | null => {
  const v = typeof n === "string" ? Number(n) : (n as number);
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
};

const TYPE_LABEL = (roomsRaw: unknown, rooms = toNum(roomsRaw)) =>
  rooms === null || rooms === undefined ? "Apartamento" : `Apartamento T${rooms}`;

// ─── RE/MAX ───────────────────────────────────────────────────────────────────

const REMAX_API = "https://remax.pt/api/Listing/PaginatedMultiMatchSearchWithGeoHash";
const REMAX_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json",
  Languageid: "9",
  TenantId: "7",
  "X-App-Platform": "web",
  Origin: "https://remax.pt",
  Referer: "https://remax.pt/pt/comprar",
};

interface RemaxFilter { field: string; operationType: string; operator: string; value: string }
interface RemaxListing {
  id: number;
  listingTitle: string;          // referência, ex. "123251300-226"
  descriptionTags: string | null; // slug, ex. "venda-apartamento-t2-..."
  listingPrice: number | null;
  numberOfBedrooms: number | null;
  livingArea: number | null;
  builtArea: number | null;
  totalArea: number | null;
  regionName2: string | null;
  regionName3: string | null;
  regionName4: string | null;
  publishDate: string | null;
  isSold?: boolean;
  isOnline?: boolean;
}
interface RemaxPage { total: number; totalPages: number; results: RemaxListing[] }

async function remaxSearch(filters: RemaxFilter[], page: number, searchValue = ""): Promise<RemaxPage> {
  return json<RemaxPage>(REMAX_API, {
    method: "POST",
    headers: REMAX_HEADERS,
    body: JSON.stringify({
      filters,
      pageNumber: page,
      pageSize: 50,
      sort: ["-PublishDate"],
      searchValue,
      precision: 14,
    }),
  });
}

export async function scrapeRemax(params: SearchParams): Promise<PropertyListing[]> {
  const f = (field: string, value: string, operator = "=", operationType = "int"): RemaxFilter =>
    ({ field, operationType, operator, value });

  const base: RemaxFilter[] = [
    f("businessTypeID", params.transactionType === "rent" ? "2" : "1"),
    f("listingClassID", "1"), // habitação
    f("listingTypeID", "1"),  // apartamento
  ];
  const { n, orMore } = bedroomsOf(params.propertyType);
  if (n !== null) base.push(orMore ? f("numberOfBedrooms", `${n};99`, "Range") : f("numberOfBedrooms", String(n)));
  if (params.minPrice || params.maxPrice) {
    base.push(f("listingPrice", `${params.minPrice ?? 0};${params.maxPrice ?? 999999999}`, "Range"));
  }

  // Zona: concelho → freguesia → localidade → pesquisa livre (primeira que devolver resultados)
  const z = slug(params.zone);
  const attempts: { filters: RemaxFilter[]; searchValue: string }[] = [
    { filters: [...base, f("regionSearch2", z, "=", "string")], searchValue: "" },
    { filters: [...base, f("regionSearch3", z, "=", "string")], searchValue: "" },
    { filters: [...base, f("regionSearch4", z, "=", "string")], searchValue: "" },
    { filters: base, searchValue: params.zone },
  ];

  let first: RemaxPage | null = null;
  let used = attempts[0];
  for (const a of attempts) {
    const p = await remaxSearch(a.filters, 1, a.searchValue);
    if (p.total > 0) { first = p; used = a; break; }
    await politeDelay();
  }
  if (!first) {
    console.log(`[Agencies] RE/MAX: 0 anúncios para "${params.zone}"`);
    return [];
  }

  const items = [...first.results];
  for (let page = 2; page <= first.totalPages && items.length < MAX_RESULTS; page++) {
    await politeDelay();
    const p = await remaxSearch(used.filters, page, used.searchValue);
    if (!p.results?.length) break;
    items.push(...p.results);
  }

  const out: PropertyListing[] = [];
  for (const l of items) {
    if (!l?.id || l.isSold || l.isOnline === false) continue;
    const area = positiveOrNull(l.livingArea) ?? positiveOrNull(l.builtArea) ?? positiveOrNull(l.totalArea);
    const price = positiveOrNull(l.listingPrice);
    if (!passesFilters({ price, area, rooms: l.numberOfBedrooms }, params)) continue;
    const local = l.regionName3 || l.regionName2 || params.zone;
    out.push({
      externalId: String(l.id),
      source: "remax",
      title: `${TYPE_LABEL(l.numberOfBedrooms)} em ${local}`,
      price,
      area,
      url: l.descriptionTags
        ? `https://remax.pt/pt/imoveis/${l.descriptionTags}/${l.listingTitle}`
        : `https://remax.pt/pt/imoveis/imovel/${l.listingTitle}`,
      zone: l.regionName2 || params.zone,
      publishedAt: l.publishDate ?? null,
    });
  }
  console.log(`[Agencies] RE/MAX ${params.zone}/${params.propertyType}: ${out.length} resultados`);
  return out;
}

// ─── ERA ──────────────────────────────────────────────────────────────────────
// O site é DNN: a API exige o cookie de sessão + o token anti-CSRF que vem
// escondido na própria página (input __RequestVerificationToken).
// A pesquisa é por texto livre ("apartamento Sesimbra") e devolve compra e
// arrendamento misturados, por isso o resto dos filtros é aplicado no cliente.

const ERA_BASE = "https://www.era.pt";
const ERA_PAGE = { buy: { path: "/comprar", moduleId: "410", tabId: "36" }, rent: { path: "/arrendar", moduleId: "411", tabId: "40" } };

interface EraPrice { Name?: string; Value?: string }
interface EraProperty {
  Id: number;
  DetailUrl: string;
  Title: string | null;
  PropertyType: string | null;
  Rooms: number | string | null; // a ERA devolve como texto ("2")
  NetArea: number | null;
  ListingArea: number | null;
  Localization: string | null;
  SellPrice?: EraPrice | null;
  RentPrice?: EraPrice | null;
  IsSold?: boolean;
  IsOnline?: boolean;
}
interface EraSearch { PropertyList: EraProperty[]; TotalPages: number; TotalRecords: number }

async function eraSession(tx: "buy" | "rent"): Promise<{ cookie: string; token: string }> {
  const res = await http(ERA_BASE + ERA_PAGE[tx].path, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`ERA HTTP ${res.status} ao abrir a página`);
  const html = await res.text();
  const m =
    /name="__RequestVerificationToken"[^>]*value="([^"]+)"/.exec(html) ??
    /value="([^"]+)"[^>]*name="__RequestVerificationToken"/.exec(html);
  if (!m) throw new Error("ERA: token anti-CSRF não encontrado na página");
  const setCookies = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  return { cookie, token: m[1] };
}

export async function scrapeEra(params: SearchParams): Promise<PropertyListing[]> {
  const tx = params.transactionType === "rent" ? "rent" : "buy";
  const { cookie, token } = await eraSession(tx);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ModuleId: ERA_PAGE[tx].moduleId,
    TabId: ERA_PAGE[tx].tabId,
    RequestVerificationToken: token,
    "X-Requested-With": "XMLHttpRequest",
    Referer: ERA_BASE + ERA_PAGE[tx].path,
  };
  if (cookie) headers.Cookie = cookie;

  const { n, orMore } = bedroomsOf(params.propertyType);
  // "apartamento T2 Sesimbra" filtra bem do lado deles; para T4+ fica só "apartamento Sesimbra"
  const searchtext = n !== null && !orMore ? `apartamento T${n} ${params.zone}` : `apartamento ${params.zone}`;

  const items: EraProperty[] = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages && items.length < MAX_RESULTS; page++) {
    if (page > 1) await politeDelay();
    const r = await json<EraSearch>(`${ERA_BASE}/API/ServicesModule/Property/Search`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        page,
        searchtext,
        onlyDevelopments: false,
        order: 3, // mais recentes
        isResidential: true,
        nonResidential: false,
      }),
    });
    totalPages = Math.min(r.TotalPages || 1, 12);
    if (!r.PropertyList?.length) break;
    items.push(...r.PropertyList);
  }

  const zoneN = norm(params.zone);
  const out: PropertyListing[] = [];
  for (const p of items) {
    if (!p?.Id || p.IsSold || p.IsOnline === false) continue;
    if (!/apartamento/i.test(p.PropertyType ?? "")) continue;
    const priceField = tx === "rent" ? p.RentPrice : p.SellPrice;
    if (!priceField?.Name) continue; // anúncio do outro tipo de negócio
    // a pesquisa por texto também apanha zonas com nome parecido ("Quinta do Anjo")
    if (zoneN && !norm(`${p.Localization} ${p.Title}`).includes(zoneN)) continue;
    const price = parseEuro(priceField.Value);
    const area = positiveOrNull(p.NetArea) ?? positiveOrNull(p.ListingArea);
    if (!passesFilters({ price, area, rooms: p.Rooms }, params)) continue;
    const parts = (p.Localization ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    out.push({
      externalId: String(p.Id),
      source: "era",
      title: p.Title?.trim() || `${TYPE_LABEL(p.Rooms)} em ${parts[0] ?? params.zone}`,
      price,
      area,
      url: p.DetailUrl.startsWith("http") ? p.DetailUrl : ERA_BASE + p.DetailUrl,
      zone: parts[parts.length - 1] ?? params.zone,
      publishedAt: null, // a ERA não expõe data de publicação na listagem
    });
  }
  console.log(`[Agencies] ERA ${params.zone}/${params.propertyType}: ${out.length} resultados`);
  return out;
}

// ─── Century 21 ───────────────────────────────────────────────────────────────

const C21_BASE = "https://century21.pt";

interface C21Place { code: string; name: string; level: number; kind: string; type: string }
interface C21Property {
  id: number;
  price: number | null;
  price_hidden?: boolean;
  asset_type: string;
  ad_type: string;
  title?: { pt?: string; en?: string } | null;
  link: string;
  reference: string;
  gross_area: number | null;
  useful_area: number | null;
  number_of_rooms: number | null;
  address: string | null;
  entered_market: string | null;
}

/** Converte o nome da zona no código INE que o site usa (ex. "Sesimbra" → "1511") */
async function c21ZoneCode(zone: string): Promise<string | null> {
  const places = await json<C21Place[]>(
    `${C21_BASE}/api/autocomplete?q=${encodeURIComponent(zone)}&limit=100`,
    { headers: { Accept: "application/json" } },
  );
  const z = norm(zone);
  const geo = places.filter((p) => p.type === "geocode");
  const exact = geo.filter((p) => norm(p.name.split(",")[0]) === z);
  // preferir concelho, depois freguesia, bairro e distrito
  const order = [2, 3, 4, 1];
  for (const lvl of order) {
    const hit = exact.find((p) => p.level === lvl);
    if (hit) return hit.code;
  }
  return geo[0]?.code ?? null;
}

export async function scrapeCentury21(params: SearchParams): Promise<PropertyListing[]> {
  const code = await c21ZoneCode(params.zone);
  if (!code) {
    console.log(`[Agencies] Century 21: zona "${params.zone}" não encontrada`);
    return [];
  }

  const qs = new URLSearchParams({
    ad_type: params.transactionType === "rent" ? "rent" : "sell",
    addresses: code,
    order_by: "entered_market_desc",
    asset_type: "apartment",
  });
  const { n, orMore } = bedroomsOf(params.propertyType);
  if (n !== null && !orMore) qs.set("number_of_rooms", String(n));
  if (params.maxPrice) qs.set("price_max", String(params.maxPrice));
  if (params.minPrice) qs.set("price_min", String(params.minPrice));

  const items: C21Property[] = [];
  let total = Infinity;
  for (let page = 1; items.length < Math.min(total, MAX_RESULTS); page++) {
    if (page > 1) await politeDelay();
    qs.set("page", String(page));
    const r = await json<{ data: C21Property[]; total: number }>(`${C21_BASE}/api/properties?${qs}`, {
      headers: { Accept: "application/json" },
    });
    total = r.total ?? 0;
    if (!r.data?.length) break;
    items.push(...r.data);
    if (page >= 10) break;
  }

  const out: PropertyListing[] = [];
  for (const p of items) {
    if (!p?.id || p.asset_type !== "apartment") continue;
    const price = p.price_hidden ? null : positiveOrNull(p.price);
    const area = positiveOrNull(p.useful_area) ?? positiveOrNull(p.gross_area);
    if (!passesFilters({ price, area, rooms: p.number_of_rooms }, params)) continue;
    out.push({
      externalId: String(p.id),
      source: "century21",
      title: p.title?.pt?.trim() || p.title?.en?.trim() || `${TYPE_LABEL(p.number_of_rooms)} em ${params.zone}`,
      price,
      area,
      url: p.link || `https://www.century21.pt/ref/${p.reference}`,
      zone: params.zone, // a morada vem às vezes em inglês ("Lisbon"), por isso fica a zona pesquisada
      publishedAt: p.entered_market ?? null,
    });
  }
  console.log(`[Agencies] Century 21 ${params.zone}/${params.propertyType}: ${out.length} resultados`);
  return out;
}

// ─── KW Portugal ──────────────────────────────────────────────────────────────

const KW_BASE = "https://www.kwportugal.pt";

interface KwRegion { id: number; description: string; idParent: number; total: number }
interface KwProperty {
  idProperty: number;
  reference: string;
  business: string;
  type: string;
  idTypology: number | null;
  typology: string | null;
  rooms: number | null;
  designation: string | null;
  price: number | null;
  livingArea: number | null;
  totalArea: number | null;
  region1: string | null;
  region2: string | null;
  region3: string | null;
  totalRecords: number;
}

const KW_COMMON = { idCurrency: 1, idCulture: 1, orderField: 11, filterDate: "null", idEnergyClasses: [] as number[] };

let kwRegionsCache: { at: number; concelhos: KwRegion[]; freguesias: KwRegion[] } | null = null;

async function kwRegions() {
  if (kwRegionsCache && Date.now() - kwRegionsCache.at < 24 * 3600_000) return kwRegionsCache;
  const list = (filterType: number) =>
    json<KwRegion[]>(`${KW_BASE}/api/portal/listPropertiesFilterValues`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...KW_COMMON, filterType, idBusinesses: "1,2" }),
    });
  const [concelhos, freguesias] = await Promise.all([list(9), list(10)]);
  kwRegionsCache = { at: Date.now(), concelhos, freguesias };
  return kwRegionsCache;
}

/** Zona → ids de região da KW (códigos INE: distrito "15", concelho "1511", freguesia "151103") */
async function kwZone(zone: string): Promise<Record<string, string> | null> {
  const { concelhos, freguesias } = await kwRegions();
  const z = norm(zone);
  const c = concelhos.find((r) => norm(r.description) === z);
  if (c) return { idRegions1: String(c.idParent), idRegions2: String(c.id) };
  const fr =
    freguesias.find((r) => norm(r.description) === z) ??
    freguesias.find((r) => norm(r.description).startsWith(z + " ") || norm(r.description).includes(z));
  if (fr) {
    const conc = concelhos.find((r) => r.id === fr.idParent);
    return {
      idRegions1: String(conc?.idParent ?? Math.floor(fr.idParent / 100)),
      idRegions2: String(fr.idParent),
      idRegions3: String(fr.id),
    };
  }
  return null;
}

export async function scrapeKw(params: SearchParams): Promise<PropertyListing[]> {
  const zone = await kwZone(params.zone);
  if (!zone) {
    console.log(`[Agencies] KW: zona "${params.zone}" não encontrada`);
    return [];
  }

  const body: Record<string, unknown> = {
    ...KW_COMMON,
    ...zone,
    filterType: 1,
    numRecords: 50,
    idBusinesses: params.transactionType === "rent" ? "2" : "1",
    idTypes: "1", // apartamento
  };
  // tipologias da KW: 1=T0, 2=T1, 3=T2, 4=T3, 5=T4, 6=T5+ (só aceita um valor;
  // para "T4+" não se filtra no portal e o filtro é feito no cliente)
  const { n, orMore } = bedroomsOf(params.propertyType);
  if (n !== null && !orMore) body.idTypologies = String(n + 1);
  if (params.maxPrice) body.priceMax = params.maxPrice;
  if (params.minPrice) body.priceMin = params.minPrice;

  const items: KwProperty[] = [];
  for (let page = 1; items.length < MAX_RESULTS; page++) {
    if (page > 1) await politeDelay();
    const r = await json<KwProperty[]>(`${KW_BASE}/api/portal/listProperties`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...body, pageNumber: page }),
    });
    if (!r?.length) break;
    items.push(...r);
    if (items.length >= (r[0]?.totalRecords ?? 0) || page >= 6) break;
  }

  const out: PropertyListing[] = [];
  for (const p of items) {
    if (!p?.idProperty || !/apartamento/i.test(p.type ?? "")) continue;
    const price = positiveOrNull(p.price);
    const area = positiveOrNull(p.livingArea) ?? positiveOrNull(p.totalArea);
    const rooms = p.rooms ?? (p.typology ? Number(/\d+/.exec(p.typology)?.[0]) : null);
    if (!passesFilters({ price, area, rooms }, params)) continue;
    const path = [p.business, p.type, p.region1, p.region2, p.region3].map(kwSlug).filter(Boolean).join("/");
    out.push({
      externalId: String(p.idProperty),
      source: "kw",
      title: p.designation?.trim() || `${TYPE_LABEL(rooms)} em ${p.region3 || p.region2 || params.zone}`,
      price,
      area,
      url: `${KW_BASE}/pt/Imovel/${path}/${p.idProperty}`,
      zone: p.region2 || params.zone,
      publishedAt: null, // a KW não expõe data de publicação (a ordem já é "mais recentes")
    });
  }
  console.log(`[Agencies] KW ${params.zone}/${params.propertyType}: ${out.length} resultados`);
  return out;
}
