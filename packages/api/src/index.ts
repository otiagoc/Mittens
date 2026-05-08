import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createBot } from "./telegram/bot.js";
import { initSender } from "./telegram/sender.js";
import { adminRoutes } from "./admin/routes.js";
import { processFollowUps, backfillFollowUpDetection } from "./admin/follow-up.js";
import { processPropertyAlerts } from "./properties/alerts.js";

// ─── Validação de env vars ────────────────────────────────────────────────────
// Falha imediatamente em produção se faltar algo crítico.
const REQUIRED_VARS = ["ANTHROPIC_API_KEY", "TELEGRAM_BOT_TOKEN", "ADMIN_PASSWORD", "JWT_SECRET"] as const;
const missing = REQUIRED_VARS.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[Config] Faltam env vars: ${missing.join(", ")}`);
  process.exit(1);
}

const IS_PROD = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT ?? 3000);
const WEB_URL = process.env.WEB_URL ?? "";

const app = new Hono();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Em desenvolvimento o frontend corre em vite (porta 5173/4173) → precisa de CORS.
// Em produção o frontend é servido pelo mesmo processo (same-origin) → CORS apenas
// para domínios externos opcionais via WEB_URL.
const corsOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
  WEB_URL,
].filter(Boolean);

app.use("/api/*", cors({
  origin: corsOrigins,
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok" }));

// ─── Admin API ────────────────────────────────────────────────────────────────
app.route("/api", adminRoutes);

// ─── Bot Telegram ─────────────────────────────────────────────────────────────
let bot: ReturnType<typeof createBot>;

async function startBot() {
  bot = createBot();
  initSender(bot);

  const webhookUrl = process.env.WEBHOOK_URL;

  if (webhookUrl) {
    // Produção: webhook
    await bot.api.setWebhook(`${webhookUrl}/telegram`);
    console.log(`[Bot] Webhook configurado: ${webhookUrl}/telegram`);

    app.post("/telegram", async (c) => {
      const body = await c.req.json();
      await bot.handleUpdate(body);
      return c.json({ ok: true });
    });
  } else {
    // Desenvolvimento: long polling
    console.log("[Bot] A iniciar em modo long polling (desenvolvimento)...");
    bot.start();
  }
}

// ─── Servir frontend (PWA) em produção ────────────────────────────────────────
// O build do React/Vite está em packages/web/dist. Em produção, o backend
// serve esses ficheiros como ficheiros estáticos. Em SPA, qualquer rota
// desconhecida devolve index.html para o React Router tratar.
function setupStaticServing() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // dist está em packages/api/dist; queremos packages/web/dist
  const webDist = resolve(__dirname, "../../web/dist");

  if (!existsSync(webDist)) {
    console.warn(`[Web] ${webDist} não existe — frontend não será servido.`);
    console.warn("[Web] Corre 'npm run build -w packages/web' para gerar o build.");
    return;
  }

  console.log(`[Web] A servir frontend de ${webDist}`);

  // Assets (ficheiros gerados pelo Vite com hashes — JS, CSS, imagens)
  app.use("/assets/*", serveStatic({ root: webDist }));
  // Ficheiros estáticos no root (manifest, sw.js, ícones, favicon)
  app.use("/*", serveStatic({ root: webDist }));

  // Fallback SPA: qualquer rota não-API e não-Telegram devolve index.html
  // para o React Router tratar do routing client-side.
  const indexHtml = readFileSync(resolve(webDist, "index.html"), "utf-8");
  app.get("*", (c) => {
    const path = c.req.path;
    if (path.startsWith("/api/") || path === "/telegram" || path === "/health") {
      return c.notFound();
    }
    return c.html(indexHtml);
  });
}

// ─── Cron jobs (corre 1 min após arranque, depois em intervalos fixos) ────────
function scheduleFollowUpCron() {
  // Backfill imediato: deteta follow-ups em conversas existentes
  setTimeout(() => {
    backfillFollowUpDetection().catch((err) => console.error("[FollowUp Backfill]", err));
  }, 5_000);

  // Corre 1 minuto após arranque (deixa o bot inicializar)
  setTimeout(() => {
    processFollowUps().catch((err) => console.error("[FollowUp Cron]", err));
  }, 60_000);

  // Follow-ups: verifica de hora a hora, dispara às 9h
  setInterval(() => {
    const hour = new Date().getHours();
    if (hour === 9) {
      processFollowUps().catch((err) => console.error("[FollowUp Cron]", err));
    }
  }, 60 * 60 * 1000);

  // Alertas de imóveis: verifica a cada 30 minutos
  setInterval(() => {
    processPropertyAlerts().catch((err) => console.error("[PropertyAlerts Cron]", err));
  }, 30 * 60 * 1000);
}

// ─── Start ────────────────────────────────────────────────────────────────────
startBot().then(() => {
  // Servir frontend se o build existir (em prod o build foi feito; em dev não).
  // O setup só corre se a pasta packages/web/dist existir.
  setupStaticServing();

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`🚀 Mittens API a correr na porta ${PORT}${IS_PROD ? " (produção)" : " (dev)"}`);
    console.log(`📊 API: http://localhost:${PORT}/api`);
    scheduleFollowUpCron();
  });
}).catch((err) => {
  console.error("Erro ao iniciar:", err);
  process.exit(1);
});
