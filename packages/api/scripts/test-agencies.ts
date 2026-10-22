/**
 * Teste rápido dos scrapers das agências, sem tocar na base de dados.
 *   npx tsx packages/api/scripts/test-agencies.ts "Sesimbra" T2 buy [precoMax]
 */
import { scrapeRemax, scrapeEra, scrapeCentury21, scrapeKw } from "../src/properties/agencies.js";

const [zone = "Sesimbra", propertyType = "T2", tx = "buy", maxPrice] = process.argv.slice(2);
const params = {
  zone,
  propertyType,
  transactionType: (tx === "rent" ? "rent" : "buy") as "rent" | "buy",
  maxPrice: maxPrice ? Number(maxPrice) : null,
};

for (const [name, fn] of [["RE/MAX", scrapeRemax], ["ERA", scrapeEra], ["Century 21", scrapeCentury21], ["KW", scrapeKw]] as const) {
  const t0 = Date.now();
  try {
    const r = await fn(params);
    console.log(`\n✅ ${name}: ${r.length} imóveis (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    for (const l of r.slice(0, 3)) console.log(`   ${l.price ?? "?"} € · ${l.area ?? "?"} m² · ${l.title}\n   ${l.url}`);
  } catch (e) {
    console.log(`\n❌ ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
