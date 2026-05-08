/**
 * Deduplicação de anúncios imobiliários — três passes independentes.
 *
 * PASSE 1 — URL exacto (intra-source, risco zero)
 *   Dentro do mesmo alerta e fonte, URLs iguais = mesmo anúncio reindexado.
 *   Mantém o mais antigo (foundAt menor). Elimina os restantes.
 *
 * PASSE 2 — Slug base + título + preço (intra-source, risco negligível)
 *   O Imovirtual por vezes reindexia um anúncio com um ID novo, mantendo
 *   o mesmo slug base. Ex: ".../apartamento-t3-benfica-ID1igMk" e
 *   ".../apartamento-t3-benfica-ID1ii8d" são o mesmo imóvel.
 *   Critério: mesmo alerta + mesma fonte + mesmo título + mesmo preço
 *             + mesmo slug (URL sem o sufixo -IDxxx).
 *   Mantém o mais antigo.
 *
 * PASSE 3 — Cross-portal preço + área (entre portais, risco baixo)
 *   Dentro do mesmo alerta, anúncios de fontes diferentes com preço
 *   exacto e área ±1 m² são considerados o mesmo imóvel.
 *   Política: mantém sempre o Casa Yes, elimina o Imovirtual.
 *
 * Salvaguardas (todos os passes):
 *  - Nunca apaga favoritos (isFavorite = true)
 *  - Nunca apaga anúncios sem URL
 *  - Passes 3: só actua se ambos os portais estiverem presentes no alerta
 */

import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { propertyListings, propertyShares } from "../db/schema.js";

export interface DedupResult {
  alertId: string | null;
  removed: number;
  byPass: { pass: string; removed: number }[];
  pairs: { keptId: string; deletedId: string; reason: string }[];
}

/**
 * Deduplica os listings de um alerta específico.
 */
export async function deduplicateAlertListings(alertId: string): Promise<DedupResult> {
  const rows = await db
    .select()
    .from(propertyListings)
    .where(eq(propertyListings.alertId, alertId));

  return _findAndDelete(rows, alertId);
}

/**
 * Deduplica todos os listings da base de dados (todos os alertas).
 */
export async function deduplicateAllListings(): Promise<DedupResult> {
  const rows = await db.select().from(propertyListings);
  return _findAndDelete(rows, null);
}

// ─── Implementação interna ─────────────────────────────────────────────────

interface Row {
  id: string;
  alertId: string | null;
  source: string;
  url: string;
  title: string | null;
  price: number | null;
  area: number | null;
  isFavorite: boolean;
  foundAt: string;
}

/** Extrai o slug base de um URL do Imovirtual, removendo o sufixo -IDxxx. */
function urlSlug(url: string): string {
  // https://www.imovirtual.com/pt/anuncio/apartamento-t3-benfica-ID1igMk
  // → apartamento-t3-benfica
  const path = url.split("?")[0].split("/").pop() ?? url;
  return path.replace(/-ID[A-Za-z0-9]+$/, "");
}

async function _findAndDelete(rows: Row[], scopeAlertId: string | null): Promise<DedupResult> {
  // Agrupa por alerta
  const byAlert = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.alertId ?? "__no_alert__";
    if (!byAlert.has(key)) byAlert.set(key, []);
    byAlert.get(key)!.push(r);
  }

  const toDelete = new Set<string>();
  const pairs: DedupResult["pairs"] = [];
  const passCounts = { url: 0, slug: 0, crossPortal: 0 };

  for (const alertRows of byAlert.values()) {

    // ── PASSE 1: URL exacto (intra-source) ──────────────────────────────
    const bySourceUrl = new Map<string, Row[]>();
    for (const r of alertRows) {
      if (r.isFavorite || !r.url) continue;
      const key = `${r.source}||${r.url}`;
      if (!bySourceUrl.has(key)) bySourceUrl.set(key, []);
      bySourceUrl.get(key)!.push(r);
    }
    for (const group of bySourceUrl.values()) {
      if (group.length < 2) continue;
      // Mantém o mais antigo
      group.sort((a, b) => a.foundAt.localeCompare(b.foundAt));
      const [keep, ...dupes] = group;
      for (const d of dupes) {
        if (!toDelete.has(d.id)) {
          toDelete.add(d.id);
          pairs.push({ keptId: keep.id, deletedId: d.id, reason: "url_exact" });
          passCounts.url++;
        }
      }
    }

    // ── PASSE 2: Slug base + título + preço (intra-source) ───────────────
    const bySourceSlugTitlePrice = new Map<string, Row[]>();
    for (const r of alertRows) {
      if (r.isFavorite || !r.url || !r.title || r.price === null) continue;
      if (toDelete.has(r.id)) continue; // já apagado no passe 1
      const slug = urlSlug(r.url);
      if (!slug) continue;
      const key = `${r.source}||${slug}||${r.title}||${r.price}`;
      if (!bySourceSlugTitlePrice.has(key)) bySourceSlugTitlePrice.set(key, []);
      bySourceSlugTitlePrice.get(key)!.push(r);
    }
    for (const group of bySourceSlugTitlePrice.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => a.foundAt.localeCompare(b.foundAt));
      const [keep, ...dupes] = group;
      for (const d of dupes) {
        if (!toDelete.has(d.id)) {
          toDelete.add(d.id);
          pairs.push({ keptId: keep.id, deletedId: d.id, reason: "slug_title_price" });
          passCounts.slug++;
        }
      }
    }

    // ── PASSE 3: Cross-portal preço + área ──────────────────────────────
    const imovirtual = alertRows.filter((r) =>
      r.source === "imovirtual" && !r.isFavorite && !toDelete.has(r.id) &&
      r.price !== null && r.area !== null
    );
    const casayes = alertRows.filter((r) =>
      r.source === "casayes" && !toDelete.has(r.id) &&
      r.price !== null && r.area !== null
    );
    if (imovirtual.length === 0 || casayes.length === 0) continue;

    for (const imo of imovirtual) {
      const match = casayes.find((cy) => {
        const samePrice = imo.price === cy.price;
        const sameArea  = Math.abs(imo.area! - cy.area!) <= 1;
        return samePrice && sameArea;
      });
      if (match && !toDelete.has(imo.id)) {
        toDelete.add(imo.id);
        pairs.push({ keptId: match.id, deletedId: imo.id, reason: "cross_portal_price_area" });
        passCounts.crossPortal++;
      }
    }
  }

  // Apaga em batch (primeiro os shares dependentes, depois os listings)
  const toDeleteArr = Array.from(toDelete);
  if (toDeleteArr.length > 0) {
    await db.delete(propertyShares).where(inArray(propertyShares.listingId, toDeleteArr));
    await db.delete(propertyListings).where(inArray(propertyListings.id, toDeleteArr));
  }

  const total = toDeleteArr.length;
  console.log(
    `[Dedup] ${scopeAlertId ? `Alerta ${scopeAlertId}` : "Global"}: ` +
    `${total} removido(s) — url:${passCounts.url} slug:${passCounts.slug} cross:${passCounts.crossPortal}`
  );

  return {
    alertId: scopeAlertId,
    removed: total,
    byPass: [
      { pass: "url_exact",            removed: passCounts.url },
      { pass: "slug_title_price",     removed: passCounts.slug },
      { pass: "cross_portal",         removed: passCounts.crossPortal },
    ],
    pairs,
  };
}
