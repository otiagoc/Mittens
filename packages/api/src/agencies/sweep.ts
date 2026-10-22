/**
 * Varredura do inventário das 199 agências (página de cada agência no Imovirtual).
 *
 * Incremental (por defeito): para cada agência e tipo de negócio lê as páginas
 * mais recentes e pára assim que uma página inteira só tem anúncios já conhecidos.
 * Numa execução normal são 1–2 pedidos por agência e por negócio.
 *
 * Completa: percorre o inventário até FULL_MAX_PAGES. Se chegar ao fim, os anúncios
 * que não apareceram ficam marcados como removidos (removedAt). Corre na primeira
 * vez que uma agência é vista e depois uma vez por semana, no máximo
 * FULL_PER_RUN agências por execução, para espalhar a carga.
 *
 * Base vs. novidades: tudo o que é recolhido antes de a agência ter a primeira
 * varredura completa fica com isBaseline = true (inventário que já existia).
 * Daí em diante, cada anúncio que aparece pela primeira vez é uma novidade.
 *
 * Tudo sequencial, com pausa de 1–2 s entre pedidos.
 */
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { agencyListings, agencyStatus } from "../db/schema.js";
import { AGENCIES, type Agency } from "./registry.js";
import { fetchAgencyPage, type AgencyAd, type AgencyTx } from "./imovirtual-agency.js";

const INCREMENTAL_MAX_PAGES = 10; // 60 anúncios novos por agência/negócio entre varreduras
const FULL_MAX_PAGES = 1000; // 6000 anúncios (a maior agência tem ~5200)
const FULL_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
const FULL_PER_RUN = 15;

const pause = () => new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
const nowIso = () => new Date().toISOString();

export interface TxResult {
  pages: number;
  seen: number;
  inserted: number;
  priceChanged: number;
  removed: number;
  total: number;
  complete: boolean;
}

export interface AgencySweepResult {
  agencyId: string;
  name: string;
  full: boolean;
  baseline: boolean;
  sell?: TxResult;
  rent?: TxResult;
  error?: string;
}

type PriceEntry = { at: string; price: number | null };

/** Grava uma página de anúncios. Devolve quantos já existiam antes desta varredura. */
async function upsertAds(ads: AgencyAd[], passStart: string, r: TxResult, baseline: boolean): Promise<number> {
  if (ads.length === 0) return 0;
  const ids = ads.map((a) => `imv:${a.externalId}`);
  const existing = await db
    .select({
      id: agencyListings.id,
      price: agencyListings.price,
      priceHistory: agencyListings.priceHistory,
      lastSeenAt: agencyListings.lastSeenAt,
    })
    .from(agencyListings)
    .where(inArray(agencyListings.id, ids));
  const byId = new Map(existing.map((e) => [e.id, e]));
  const now = nowIso();
  let known = 0;

  for (const ad of ads) {
    const id = `imv:${ad.externalId}`;
    const prev = byId.get(id);
    r.seen++;
    if (!prev) {
      await db
        .insert(agencyListings)
        .values({
          id,
          agencyId: ad.agencyId,
          externalId: ad.externalId,
          source: "imovirtual",
          transaction: ad.transaction,
          estate: ad.estate,
          typology: ad.typology,
          title: ad.title,
          url: ad.url,
          price: ad.price,
          area: ad.area,
          floor: ad.floor,
          parish: ad.parish,
          municipality: ad.municipality,
          district: ad.district,
          image: ad.image,
          publishedAt: ad.createdAt,
          firstSeenAt: now,
          lastSeenAt: now,
          priceHistory: JSON.stringify([{ at: now, price: ad.price }] satisfies PriceEntry[]),
          isBaseline: baseline,
        })
        .onConflictDoNothing();
      r.inserted++;
      continue;
    }

    // Já tínhamos o anúncio. Se foi visto antes desta varredura, conta como "conhecido".
    if (prev.lastSeenAt < passStart) known++;
    const changed = prev.price !== ad.price;
    let history = prev.priceHistory;
    if (changed) {
      const h = JSON.parse(prev.priceHistory || "[]") as PriceEntry[];
      h.push({ at: now, price: ad.price });
      history = JSON.stringify(h.slice(-30));
      r.priceChanged++;
    }
    await db
      .update(agencyListings)
      .set({
        lastSeenAt: now,
        removedAt: null,
        price: ad.price,
        priceHistory: history,
        title: ad.title,
        area: ad.area,
        image: ad.image,
        ...(changed ? { priceChangedAt: now } : {}),
      })
      .where(eq(agencyListings.id, id));
  }
  return known;
}

async function sweepTx(agency: Agency, tx: AgencyTx, full: boolean, passStart: string, baseline: boolean): Promise<TxResult> {
  const r: TxResult = { pages: 0, seen: 0, inserted: 0, priceChanged: 0, removed: 0, total: 0, complete: false };
  const maxPages = full ? FULL_MAX_PAGES : INCREMENTAL_MAX_PAGES;

  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await pause();
    const res = await fetchAgencyPage(agency.imovirtualSlug, agency.id, tx, page);
    r.pages++;
    r.total = res.totalItems;
    // Proteção: se o site ignorar a paginação, não repetir a mesma página.
    if (res.page !== page) break;
    const known = await upsertAds(res.ads, passStart, r, baseline);

    if (res.ads.length === 0 || page >= res.totalPages) {
      r.complete = true;
      break;
    }
    // Ordenado por mais recentes: página toda conhecida → o resto também é.
    if (!full && known === res.ads.length) break;
  }

  // Só com a lista completa se pode afirmar que um anúncio saiu do ar.
  if (full && r.complete) {
    const gone = await db
      .update(agencyListings)
      .set({ removedAt: nowIso() })
      .where(
        and(
          eq(agencyListings.agencyId, agency.id),
          eq(agencyListings.transaction, tx),
          isNull(agencyListings.removedAt),
          lt(agencyListings.lastSeenAt, passStart),
        ),
      )
      .returning({ id: agencyListings.id });
    r.removed = gone.length;
  }
  return r;
}

export async function sweepAgency(agency: Agency, opts: { full?: boolean } = {}): Promise<AgencySweepResult> {
  const [status] = await db.select().from(agencyStatus).where(eq(agencyStatus.agencyId, agency.id));
  const full =
    opts.full ?? (!status?.lastFullAt || Date.now() - Date.parse(status.lastFullAt) > FULL_EVERY_MS);
  const passStart = nowIso();
  // Enquanto a agência não tiver uma varredura completa, tudo o que entra é inventário de base.
  const baseline = !status?.lastFullAt;
  const out: AgencySweepResult = { agencyId: agency.id, name: agency.name, full, baseline };

  try {
    out.sell = await sweepTx(agency, "SELL", full, passStart, baseline);
    await pause();
    out.rent = await sweepTx(agency, "RENT", full, passStart, baseline);
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }

  const values = {
    agencyId: agency.id,
    lastSweepAt: passStart,
    lastError: out.error ?? null,
    totalSell: out.sell?.total ?? status?.totalSell ?? null,
    totalRent: out.rent?.total ?? status?.totalRent ?? null,
    newLastSweep: (out.sell?.inserted ?? 0) + (out.rent?.inserted ?? 0),
    ...(full && !out.error ? { lastFullAt: passStart } : {}),
  };
  await db
    .insert(agencyStatus)
    .values(values)
    .onConflictDoUpdate({ target: agencyStatus.agencyId, set: values });
  return out;
}

// ─── Execução global ──────────────────────────────────────────────────────────

let running: { startedAt: string; done: number; total: number } | null = null;
export const sweepState = () => running;

export interface SweepSummary {
  startedAt: string;
  finishedAt: string;
  agencies: number;
  inserted: number;
  /** anúncios novos de verdade (agências que já tinham inventário de base) */
  fresh: number;
  removed: number;
  priceChanged: number;
  errors: { agencyId: string; name: string; error: string }[];
  aborted?: string;
}

/**
 * Varre todas as agências (ou só as indicadas). Agências que precisam de varredura
 * completa entram no máximo FULL_PER_RUN de cada vez; as restantes fazem incremental.
 */
export async function sweepAllAgencies(opts: { agencyIds?: string[]; full?: boolean } = {}): Promise<SweepSummary> {
  if (running) throw new Error("Já há uma varredura a correr");
  const list = opts.agencyIds?.length ? AGENCIES.filter((a) => opts.agencyIds!.includes(a.id)) : AGENCIES;
  const startedAt = nowIso();
  running = { startedAt, done: 0, total: list.length };
  const summary: SweepSummary = {
    startedAt, finishedAt: startedAt, agencies: 0, inserted: 0, fresh: 0, removed: 0, priceChanged: 0, errors: [],
  };

  try {
    const statuses = await db.select().from(agencyStatus);
    const lastFull = new Map(statuses.map((s) => [s.agencyId, s.lastFullAt]));
    let fullBudget = opts.full === undefined ? FULL_PER_RUN : Infinity;
    let consecutiveBlocks = 0;

    for (const agency of list) {
      const lf = lastFull.get(agency.id);
      const due = !lf || Date.now() - Date.parse(lf) > FULL_EVERY_MS;
      let full = opts.full ?? false;
      if (opts.full === undefined && !lf) full = true; // ainda sem base → recolha completa já
      else if (opts.full === undefined && due && fullBudget > 0) {
        full = true;
        fullBudget--;
      }

      const res = await sweepAgency(agency, { full });
      summary.agencies++;
      running.done++;
      const ins = (res.sell?.inserted ?? 0) + (res.rent?.inserted ?? 0);
      console.log(
        `[Agências] ${running.done}/${running.total} ${agency.name}: ` +
          (res.error ? `erro — ${res.error}` : `${ins} ${res.baseline ? "de base" : "novos"}${res.full ? " (completa)" : ""}`),
      );
      for (const t of [res.sell, res.rent]) {
        if (!t) continue;
        summary.inserted += t.inserted;
        if (!res.baseline) summary.fresh += t.inserted;
        summary.removed += t.removed;
        summary.priceChanged += t.priceChanged;
      }
      if (res.error) {
        summary.errors.push({ agencyId: agency.id, name: agency.name, error: res.error });
        // 403/429 seguidos: o site está a recusar pedidos → parar e tentar na próxima janela.
        if (/HTTP (403|429)/.test(res.error)) {
          if (++consecutiveBlocks >= 3) {
            summary.aborted = "Imovirtual recusou 3 pedidos seguidos (403/429); varredura interrompida";
            break;
          }
        } else consecutiveBlocks = 0;
      } else consecutiveBlocks = 0;
      await pause();
    }
  } finally {
    running = null;
    summary.finishedAt = nowIso();
  }
  console.log(
    `[Agências] ${summary.agencies} agências · ${summary.fresh} novidades (+${summary.inserted - summary.fresh} de base) · ${summary.priceChanged} preços alterados · ${summary.removed} removidos · ${summary.errors.length} erros`,
  );
  return summary;
}
