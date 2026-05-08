/**
 * Deduplicação de anúncios imobiliários entre portais.
 *
 * Critério: dentro do mesmo alerta, dois listings de fontes diferentes
 * com preço igual (exacto) e área igual (±1 m²) são considerados o
 * mesmo imóvel publicado em dois portais.
 *
 * Política: mantém sempre o anúncio do Casa Yes e apaga o do Imovirtual
 * (o Imovirtual tem menos detalhe e URLs menos estáveis).
 *
 * Salvaguardas:
 *  - Nunca apaga favoritos (isFavorite = true)
 *  - Nunca apaga se price ou area for null (sem dados suficientes)
 *  - Nunca apaga se o alerta tiver apenas um portal activo
 */

import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { propertyListings } from "../db/schema.js";

export interface DedupResult {
  alertId: string | null;
  removed: number;
  pairs: { keptId: string; deletedId: string; price: number; area: number }[];
}

/**
 * Deduplica os listings de um alerta específico.
 * Devolve o número de registos eliminados.
 */
export async function deduplicateAlertListings(alertId: string): Promise<DedupResult> {
  // Busca todos os listings do alerta com price e area preenchidos
  const rows = await db
    .select()
    .from(propertyListings)
    .where(
      and(
        eq(propertyListings.alertId, alertId),
        isNotNull(propertyListings.price),
        isNotNull(propertyListings.area),
      ),
    );

  return _findAndDelete(rows, alertId);
}

/**
 * Deduplica todos os listings da base de dados (todos os alertas).
 */
export async function deduplicateAllListings(): Promise<DedupResult> {
  const rows = await db
    .select()
    .from(propertyListings)
    .where(
      and(
        isNotNull(propertyListings.price),
        isNotNull(propertyListings.area),
      ),
    );

  return _findAndDelete(rows, null);
}

// ─── Implementação interna ─────────────────────────────────────────────────

interface Row {
  id: string;
  alertId: string | null;
  source: string;
  price: number | null;
  area: number | null;
  isFavorite: boolean;
}

async function _findAndDelete(rows: Row[], scopeAlertId: string | null): Promise<DedupResult> {
  // Agrupa por alerta para evitar cross-alert matches
  const byAlert = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.alertId ?? "__no_alert__";
    if (!byAlert.has(key)) byAlert.set(key, []);
    byAlert.get(key)!.push(r);
  }

  const toDelete: string[] = [];
  const pairs: DedupResult["pairs"] = [];

  for (const alertRows of byAlert.values()) {
    // Separar por portal
    const imovirtual = alertRows.filter((r) => r.source === "imovirtual" && !r.isFavorite);
    const casayes    = alertRows.filter((r) => r.source === "casayes");

    // Se só há um portal, nada a deduplinar
    if (imovirtual.length === 0 || casayes.length === 0) continue;

    // Para cada anúncio do Imovirtual, procura correspondência no Casa Yes
    for (const imo of imovirtual) {
      if (imo.price === null || imo.area === null) continue;

      const imoPrice = imo.price!;
      const imoArea  = imo.area!;
      const match = casayes.find((cy) => {
        if (cy.price === null || cy.area === null) return false;
        const samePrice = imoPrice === cy.price;                    // preço exacto
        const sameArea  = Math.abs(imoArea - cy.area) <= 1;         // área ±1 m²
        return samePrice && sameArea;
      });

      if (match && !toDelete.includes(imo.id)) {
        toDelete.push(imo.id);
        pairs.push({
          keptId:    match.id,
          deletedId: imo.id,
          price:     imoPrice,
          area:      imoArea,
        });
      }
    }
  }

  // Apaga em batch
  if (toDelete.length > 0) {
    await db.delete(propertyListings).where(inArray(propertyListings.id, toDelete));
  }

  console.log(
    `[Dedup] ${scopeAlertId ? `Alerta ${scopeAlertId}` : "Global"}: ${pairs.length} duplicado(s) removido(s)`,
  );

  return { alertId: scopeAlertId, removed: toDelete.length, pairs };
}
