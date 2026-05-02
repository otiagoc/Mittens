import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createBot } from "./telegram/bot.js";
import { initSender } from "./telegram/sender.js";
import { adminRoutes } from "./admin/routes.js";
import { processFollowUps, backfillFollowUpDetection } from "./admin/follow-up.js";
import { processPropertyAlerts } from "./properties/alerts.js";

const app = new Hono();
const PORT = Number(process.env.PORT ?? 3000);

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use("*", cors({
  origin: ["http://localhost:5173", "http://localhost:4173", process.env.WEB_URL ?? ""].filter(Boolean),
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/", (c) => c.json({ status: "ok", service: "mittens-api" }));
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

// ─── Follow-up cron (corre diariamente às 9h e 1h após arranque) ──────────────
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
  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`🚀 Mittens API a correr na porta ${PORT}`);
    console.log(`📊 Dashboard API disponível em http://localhost:${PORT}/api`);
    scheduleFollowUpCron();
  });
}).catch((err) => {
  console.error("Erro ao iniciar:", err);
  process.exit(1);
});
