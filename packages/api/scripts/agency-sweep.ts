/**
 * Corre a varredura das agências a partir do Mac, gravando na base de dados do .env.
 *
 *   npx tsx --env-file=.env packages/api/scripts/agency-sweep.ts            # normal
 *   npx tsx --env-file=.env packages/api/scripts/agency-sweep.ts --full     # inventário completo de todas
 *   npx tsx --env-file=.env packages/api/scripts/agency-sweep.ts 267469     # só estas agências
 *
 * Primeira vez: recolhe o inventário de base das 199 (~2,5 h). Pode ser interrompida
 * com Ctrl+C e retomada — as agências já concluídas não voltam a contar como base.
 */
import { sweepAllAgencies } from "../src/agencies/sweep.js";

const args = process.argv.slice(2);
const full = args.includes("--full") ? true : undefined;
const agencyIds = args.filter((a) => /^\d+$/.test(a));

if (!process.env.TURSO_DATABASE_URL) {
  console.warn("Aviso: TURSO_DATABASE_URL não definido — a gravar em ./local.db");
}

const t0 = Date.now();
const s = await sweepAllAgencies({ agencyIds, full });
console.log(`\nConcluído em ${Math.round((Date.now() - t0) / 60000)} min`);
console.log(`  agências: ${s.agencies}`);
console.log(`  novidades: ${s.fresh}`);
console.log(`  inventário de base: ${s.inserted - s.fresh}`);
console.log(`  preços alterados: ${s.priceChanged} · removidos: ${s.removed}`);
if (s.errors.length) console.log(`  erros:\n${s.errors.map((e) => `    ${e.name}: ${e.error}`).join("\n")}`);
if (s.aborted) console.log(`  ${s.aborted}`);
process.exit(0);
