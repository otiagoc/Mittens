/**
 * Script de setup — corre UMA VEZ para criar o Environment no Anthropic Managed Agents.
 *
 * Uso:
 *   cp .env.example .env          # preenche ANTHROPIC_API_KEY e TELEGRAM_BOT_TOKEN
 *   npx tsx src/db/setup-env.ts   # cria o environment e mostra o ID
 *
 * Depois adiciona ao .env:
 *   ANTHROPIC_ENV_ID=env_xxx
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function setup() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY não definido. Cria o ficheiro .env primeiro.");
    process.exit(1);
  }

  console.log("🚀 A criar Anthropic Managed Agents Environment...\n");

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = await (anthropic.beta as any).environments.create({
      name: "mittens-production",
      config: {
        type: "cloud",
        networking: { type: "unrestricted" }, // necessário para web_fetch do D&D agent
      },
    });

    console.log("✅ Environment criado com sucesso!\n");
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║  Adiciona esta linha ao teu ficheiro .env:       ║");
    console.log(`║  ANTHROPIC_ENV_ID=${env.id}${" ".repeat(Math.max(0, 31 - env.id.length))}║`);
    console.log("╚══════════════════════════════════════════════════╝\n");
    console.log(`Environment ID: ${env.id}`);
    console.log(`Status: ${env.status ?? "active"}`);

    console.log("\n📋 Próximos passos:");
    console.log("  1. Adiciona ANTHROPIC_ENV_ID ao .env");
    console.log("  2. Executa: npx tsx src/db/seed.ts");
    console.log("  3. Inicia o servidor: npm run dev");

  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = err as any;
    if (error?.status === 401) {
      console.error("❌ API key inválida. Verifica o ANTHROPIC_API_KEY no .env");
    } else if (error?.message?.includes("managed-agents")) {
      console.error("❌ A tua conta Anthropic pode não ter acesso aos Managed Agents.");
      console.error("   Verifica em: https://console.anthropic.com");
    } else {
      console.error("❌ Erro ao criar environment:", error?.message ?? err);
    }
    process.exit(1);
  }
}

setup();
