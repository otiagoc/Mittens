/**
 * Scrape de detalhes individuais de cada anúncio.
 * Chamado lazy (on-demand) quando o utilizador abre um imóvel no CRM.
 */

export interface ListingDetail {
  source: "imovirtual" | "casayes" | "idealista";
  externalId: string;
  url: string;
  title: string;
  description: string;
  images: string[];                   // URLs grandes, ordenadas
  price: number | null;
  area: number | null;                // m² (área útil)
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  constructionYear: number | null;
  energyRating: string | null;
  hasElevator: boolean | null;
  hasParking: boolean | null;
  pricePerM2: number | null;
  zone: string | null;
  address: string | null;
  characteristics: { label: string; value: string }[];
  scrapedAt: string;
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
};

function extractNextData(html: string): unknown | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

// ─── Imovirtual ───────────────────────────────────────────────────────────────

interface ImovirtualImage {
  thumbnail?: string;
  small?: string;
  medium?: string;
  large?: string;
}

interface ImovirtualCharacteristic {
  key: string;
  value: string;
  localizedValue?: string;
  currency?: string;
}

const IMV_LABELS: Record<string, string> = {
  price: "Preço",
  price_per_m: "Preço por m²",
  m: "Área",
  market: "Mercado",
  energy_certificate: "Certificado energético",
  rooms_num: "Tipologia",
  floor_no: "Andar",
  build_year: "Ano de construção",
  building_type: "Tipo de edifício",
  heating: "Aquecimento",
  windows_type: "Janelas",
  building_material: "Material",
};

async function scrapeImovirtualDetail(url: string, externalId: string): Promise<ListingDetail | null> {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!res.ok) {
    console.warn(`[Detail] Imovirtual HTTP ${res.status} (${url})`);
    return null;
  }
  const html = await res.text();
  const data = extractNextData(html) as { props?: { pageProps?: { ad?: unknown } } } | null;
  const ad = data?.props?.pageProps?.ad as {
    title?: string;
    description?: string;
    images?: ImovirtualImage[];
    characteristics?: ImovirtualCharacteristic[];
    location?: { address?: { street?: { name?: string }; city?: { name?: string }; province?: { name?: string } } };
    market?: string;
    target?: Record<string, unknown>;
  } | undefined;

  if (!ad) return null;

  // Strip HTML tags from description (Imovirtual mete <p>, <br>, <strong>...)
  const description = (ad.description ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const images = (ad.images ?? [])
    .map((i) => i.large ?? i.medium ?? i.small)
    .filter((u): u is string => !!u);

  const charsRaw = ad.characteristics ?? [];
  const charMap = new Map(charsRaw.map((c) => [c.key, c]));
  const num = (key: string) => {
    const v = charMap.get(key)?.value;
    if (!v) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  const characteristics = charsRaw
    .filter((c) => !["price", "price_per_m", "m"].includes(c.key))
    .map((c) => ({
      label: IMV_LABELS[c.key] ?? c.key.replace(/_/g, " "),
      value: c.localizedValue || c.value,
    }))
    .filter((c) => c.value && c.value.trim() !== "");

  const addr = ad.location?.address;
  const address = [addr?.street?.name, addr?.city?.name, addr?.province?.name]
    .filter(Boolean)
    .join(", ") || null;

  return {
    source: "imovirtual",
    externalId,
    url,
    title: ad.title ?? "",
    description,
    images,
    price: num("price"),
    area: num("m") ? Math.round(num("m")!) : null,
    bedrooms: num("rooms_num") !== null ? Math.max(0, num("rooms_num")! - 1) : null, // T1=2 rooms
    bathrooms: num("bathrooms_num"),
    floor: num("floor_no"),
    constructionYear: num("build_year"),
    energyRating: charMap.get("energy_certificate")?.value?.toUpperCase() ?? null,
    hasElevator: null,
    hasParking: null,
    pricePerM2: num("price_per_m"),
    zone: addr?.city?.name ?? addr?.province?.name ?? null,
    address,
    characteristics,
    scrapedAt: new Date().toISOString(),
  };
}

// ─── Casa Yes ─────────────────────────────────────────────────────────────────

const CY_IMG_BASE = "https://i.casayes.pt/l-view/";

interface CasaYesDetailRaw {
  livingArea?: number;
  builtArea?: number;
  lotArea?: number;
  parking?: boolean;
  addressFloor?: number;
  constructionYear?: number;
  elevator?: boolean;
  listingPrice?: number;
  priceM2?: number;
  numberOfBedrooms?: number;
  numberOfBathrooms?: number;
  listingPictures?: string[];
  descriptions?: { languageId: number; labelValue: string }[];
  regionName1?: string;
  regionName2?: string;
  regionName3?: string;
  address?: string;
  listingTypeLabel?: string;
  listingEnergyEfficiencyLabel?: string;
}

async function scrapeCasaYesDetail(url: string, externalId: string): Promise<ListingDetail | null> {
  const res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!res.ok) {
    console.warn(`[Detail] Casa Yes HTTP ${res.status} (${url})`);
    return null;
  }
  const html = await res.text();
  const data = extractNextData(html) as { props?: { pageProps?: { listingEncoded?: string } } } | null;
  const enc = data?.props?.pageProps?.listingEncoded;
  if (!enc) return null;

  let raw: CasaYesDetailRaw;
  try {
    raw = JSON.parse(Buffer.from(enc, "base64").toString("utf-8"));
  } catch {
    return null;
  }

  // Descrição: pega na PT (languageId=1)
  const desc =
    raw.descriptions?.find((d) => d.languageId === 1)?.labelValue ??
    raw.descriptions?.[0]?.labelValue ??
    "";

  const description = desc
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const images = (raw.listingPictures ?? []).map((p) => CY_IMG_BASE + p);

  const characteristics: { label: string; value: string }[] = [];
  if (raw.numberOfBedrooms !== undefined && raw.numberOfBedrooms !== null) {
    characteristics.push({ label: "Quartos", value: String(raw.numberOfBedrooms) });
  }
  if (raw.numberOfBathrooms !== undefined && raw.numberOfBathrooms !== null) {
    characteristics.push({ label: "Casas de banho", value: String(raw.numberOfBathrooms) });
  }
  if (raw.builtArea && raw.builtArea > 0) {
    characteristics.push({ label: "Área bruta", value: `${raw.builtArea} m²` });
  }
  if (raw.lotArea && raw.lotArea > 0) {
    characteristics.push({ label: "Terreno", value: `${raw.lotArea} m²` });
  }
  if (raw.constructionYear) {
    characteristics.push({ label: "Ano de construção", value: String(raw.constructionYear) });
  }
  if (raw.addressFloor !== undefined && raw.addressFloor !== null) {
    characteristics.push({ label: "Andar", value: String(raw.addressFloor) });
  }
  if (raw.priceM2) {
    characteristics.push({ label: "Preço por m²", value: `${raw.priceM2.toLocaleString("pt-PT")} €/m²` });
  }
  if (raw.elevator !== undefined) {
    characteristics.push({ label: "Elevador", value: raw.elevator ? "Sim" : "Não" });
  }
  if (raw.parking !== undefined) {
    characteristics.push({ label: "Estacionamento", value: raw.parking ? "Sim" : "Não" });
  }
  if (raw.listingEnergyEfficiencyLabel) {
    characteristics.push({ label: "Certificado energético", value: raw.listingEnergyEfficiencyLabel });
  }

  const address = [raw.address, raw.regionName3, raw.regionName2].filter(Boolean).join(", ") || null;

  return {
    source: "casayes",
    externalId,
    url,
    title: raw.listingTypeLabel
      ? `${raw.numberOfBedrooms !== undefined ? `T${raw.numberOfBedrooms} · ` : ""}${raw.regionName3 ?? raw.regionName2 ?? ""}`
      : "Imóvel",
    description,
    images,
    price: raw.listingPrice ?? null,
    area: raw.livingArea && raw.livingArea > 0 ? raw.livingArea : raw.builtArea ?? null,
    bedrooms: raw.numberOfBedrooms ?? null,
    bathrooms: raw.numberOfBathrooms ?? null,
    floor: raw.addressFloor ?? null,
    constructionYear: raw.constructionYear ?? null,
    energyRating: raw.listingEnergyEfficiencyLabel ?? null,
    hasElevator: raw.elevator ?? null,
    hasParking: raw.parking ?? null,
    pricePerM2: raw.priceM2 ?? null,
    zone: raw.regionName2 ?? null,
    address,
    characteristics,
    scrapedAt: new Date().toISOString(),
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function scrapeListingDetail(
  source: string,
  externalId: string,
  url: string
): Promise<ListingDetail | null> {
  try {
    if (source === "imovirtual") return await scrapeImovirtualDetail(url, externalId);
    if (source === "casayes") return await scrapeCasaYesDetail(url, externalId);
    return null; // idealista bloqueado
  } catch (err) {
    console.error(`[Detail] Erro a fazer scrape de ${source} ${externalId}:`, err);
    return null;
  }
}
