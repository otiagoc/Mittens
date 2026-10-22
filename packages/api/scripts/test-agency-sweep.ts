/**
 * Teste sem base de dados: lê a 1.ª página (venda e arrendamento) de algumas agências
 * no Imovirtual e mostra o que seria gravado.
 *
 *   npx tsx packages/api/scripts/test-agency-sweep.ts              # 3 primeiras agências
 *   npx tsx packages/api/scripts/test-agency-sweep.ts 267469 161597 # por ID
 *   npx tsx packages/api/scripts/test-agency-sweep.ts --all        # todas (≈400 pedidos, ~15 min)
 */
import { AGENCIES, AGENCY_BY_ID } from "../src/agencies/registry.js";
import { fetchAgencyPage } from "../src/agencies/imovirtual-agency.js";

const args = process.argv.slice(2);
const list = args.includes("--all")
  ? AGENCIES
  : args.length
    ? args.map((id) => AGENCY_BY_ID.get(id)).filter((a): a is NonNullable<typeof a> => !!a)
    : AGENCIES.slice(0, 3);

const pause = () => new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
let ok = 0;
let fail = 0;

for (const a of list) {
  for (const tx of ["SELL", "RENT"] as const) {
    try {
      const p = await fetchAgencyPage(a.imovirtualSlug, a.id, tx, 1);
      ok++;
      const ex = p.ads[0];
      console.log(
        `✓ ${a.name.padEnd(40).slice(0, 40)} ${tx.padEnd(4)} total ${String(p.totalItems).padStart(5)} · ${p.totalPages} pág.` +
          (ex ? ` · ex.: ${ex.typology ?? ex.estate} ${ex.price ?? "s/ preço"}€ ${ex.area ?? "?"}m² ${ex.municipality ?? ex.parish ?? ""}` : ""),
      );
    } catch (err) {
      fail++;
      console.log(`✗ ${a.name} ${tx}: ${err instanceof Error ? err.message : err}`);
    }
    await pause();
  }
}
console.log(`\n${ok} páginas lidas, ${fail} falhas`);
