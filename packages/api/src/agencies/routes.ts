/**
 * API das agências independentes.
 *
 *   GET  /api/agencies                 registo + estado da última varredura + anúncios ativos
 *   GET  /api/agencies/status          estado global (a correr? última execução)
 *   GET  /api/agencies/listings        anúncios recolhidos, com filtros (ver abaixo)
 *   GET  /api/agencies/new             só novidades por ver (= listings?onlyNew=1&unseen=1)
 *   POST /api/agencies/new/seen        marca novidades como vistas. body: { ids?: string[] } (sem ids = todas)
 *   POST /api/agencies/sweep           lança uma varredura em segundo plano
 *        body opcional: { agencyIds?: string[], full?: boolean }
 */
import { Hono, type Context } from "hono";
import { and, desc, eq, gte, isNull, lte, sql, inArray, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { agencyListings, agencyStatus } from "../db/schema.js";
import { authMiddleware } from "../admin/auth.js";
import { AGENCIES, AGENCY_BY_ID } from "./registry.js";
import { sweepAllAgencies, sweepState, type SweepSummary } from "./sweep.js";

const router = new Hono();
let lastSummary: SweepSummary | null = null;

export async function runAgencySweep(opts: { agencyIds?: string[]; full?: boolean } = {}) {
  lastSummary = await sweepAllAgencies(opts);
  return lastSummary;
}

router.get("/agencies", authMiddleware, async (c) => {
  const [statuses, counts] = await Promise.all([
    db.select().from(agencyStatus),
    db
      .select({
        agencyId: agencyListings.agencyId,
        transaction: agencyListings.transaction,
        n: sql<number>`count(*)`,
      })
      .from(agencyListings)
      .where(isNull(agencyListings.removedAt))
      .groupBy(agencyListings.agencyId, agencyListings.transaction),
  ]);
  const st = new Map(statuses.map((s) => [s.agencyId, s]));
  const cnt = new Map<string, { sell: number; rent: number }>();
  for (const r of counts) {
    const e = cnt.get(r.agencyId) ?? { sell: 0, rent: 0 };
    if (r.transaction === "SELL") e.sell = Number(r.n);
    else e.rent = Number(r.n);
    cnt.set(r.agencyId, e);
  }
  return c.json(
    AGENCIES.map((a) => ({
      ...a,
      status: st.get(a.id) ?? null,
      stored: cnt.get(a.id) ?? { sell: 0, rent: 0 },
    })),
  );
});

router.get("/agencies/status", authMiddleware, (c) =>
  c.json({ running: sweepState(), lastSummary, enabled: process.env.AGENCY_SWEEP === "on" }),
);

/**
 * Filtros: agency (id, pode repetir), municipality, tx (SELL|RENT), typology (T2),
 * estate (FLAT|HOUSE…), minPrice, maxPrice, minArea, since (ISO, anúncios vistos pela
 * 1.ª vez depois disto), includeRemoved=1, onlyNew=1 (exclui o inventário de base),
 * unseen=1 (só as que ainda não marquei como vistas), limit (máx. 500), offset.
 */
async function listListings(c: Context, forced: Record<string, string> = {}) {
  const q = { ...c.req.query(), ...forced };
  const conds: SQL[] = [];
  const agencies = c.req.queries("agency");
  if (agencies?.length) conds.push(inArray(agencyListings.agencyId, agencies));
  if (q.municipality) conds.push(sql`lower(${agencyListings.municipality}) = lower(${q.municipality})`);
  if (q.tx) conds.push(eq(agencyListings.transaction, q.tx.toUpperCase()));
  if (q.typology) conds.push(eq(agencyListings.typology, q.typology.toUpperCase()));
  if (q.estate) conds.push(eq(agencyListings.estate, q.estate.toUpperCase()));
  if (q.minPrice) conds.push(gte(agencyListings.price, Number(q.minPrice)));
  if (q.maxPrice) conds.push(lte(agencyListings.price, Number(q.maxPrice)));
  if (q.minArea) conds.push(gte(agencyListings.area, Number(q.minArea)));
  if (q.since) conds.push(gte(agencyListings.firstSeenAt, q.since));
  if (q.includeRemoved !== "1") conds.push(isNull(agencyListings.removedAt));
  if (q.onlyNew === "1") conds.push(eq(agencyListings.isBaseline, false));
  if (q.unseen === "1") conds.push(isNull(agencyListings.seenAt));

  const limit = Math.min(Number(q.limit) || 100, 500);
  const offset = Number(q.offset) || 0;
  const where = conds.length ? and(...conds) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(agencyListings).where(where).orderBy(desc(agencyListings.firstSeenAt)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)` }).from(agencyListings).where(where),
  ]);
  return c.json({
    total: Number(total),
    items: rows.map((r) => ({
      ...r,
      priceHistory: JSON.parse(r.priceHistory || "[]"),
      agency: AGENCY_BY_ID.get(r.agencyId)?.name ?? null,
    })),
  });
}

router.get("/agencies/listings", authMiddleware, (c) => listListings(c));
router.get("/agencies/new", authMiddleware, (c) => listListings(c, { onlyNew: "1", unseen: "1" }));

router.post("/agencies/new/seen", authMiddleware, async (c) => {
  const body = await c.req.json<{ ids?: string[] }>().catch(() => ({}) as { ids?: string[] });
  const conds: SQL[] = [eq(agencyListings.isBaseline, false), isNull(agencyListings.seenAt)];
  if (body.ids?.length) conds.push(inArray(agencyListings.id, body.ids));
  const rows = await db
    .update(agencyListings)
    .set({ seenAt: new Date().toISOString() })
    .where(and(...conds))
    .returning({ id: agencyListings.id });
  return c.json({ marked: rows.length });
});

router.post("/agencies/sweep", authMiddleware, async (c) => {
  if (sweepState()) return c.json({ error: "Já há uma varredura a correr", running: sweepState() }, 409);
  const body = await c.req.json<{ agencyIds?: string[]; full?: boolean }>().catch(() => ({}) as { agencyIds?: string[]; full?: boolean });
  const unknown = (body.agencyIds ?? []).filter((id) => !AGENCY_BY_ID.has(id));
  if (unknown.length) return c.json({ error: `Agências desconhecidas: ${unknown.join(", ")}` }, 400);
  runAgencySweep(body).catch((err) => console.error("[Agências] varredura falhou:", err));
  return c.json({ started: true, agencies: body.agencyIds?.length ?? AGENCIES.length }, 202);
});

export { router as agencyRoutes };
