import { eq, desc, and, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { propertyAlerts, propertyListings, leads, activities, settings } from "../db/schema.js";
import { scrapeAll } from "./scraper.js";
import { sendTelegramMessage } from "../telegram/sender.js";
import { deduplicateAlertListings } from "./dedup.js";

/**
 * Lê o `telegramChatId` do perfil do consultor em `settings.agent_profile`.
 * É para aqui que vão os alertas de imóveis (não para o chat da lead).
 */
async function getConsultantChatId(): Promise<string | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, "agent_profile")).limit(1);
  if (rows.length === 0 || !rows[0].value) return null;
  try {
    const profile = JSON.parse(rows[0].value) as { telegramChatId?: string };
    const id = profile.telegramChatId?.trim();
    return id && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Estratégia de notificação:
 *  - Inserir em DB todos os listings que ainda não estão (por source+externalId+alertId).
 *  - "A notificar" = listings em DB para este alerta com `notifiedAt IS NULL`.
 *  - Quando `notifyTelegram=false` (scrape inicial ao criar o alerta), marcar imediatamente
 *    `notifiedAt = now()` — entram como histórico e nunca disparam Telegram.
 *  - Em caso de crash a meio do envio, `notifiedAt` é gravado *antes* do envio para evitar
 *    reenvios; perde-se no máximo a última mensagem se Telegram cair.
 */
export async function runAlert(alertId: string, notifyTelegram = true): Promise<number> {
  const [alert] = await db.select().from(propertyAlerts)
    .where(eq(propertyAlerts.id, alertId)).limit(1);
  if (!alert) return 0;

  const lead = alert.leadId
    ? (await db.select().from(leads).where(eq(leads.id, alert.leadId)).limit(1))[0]
    : null;

  const listings = await scrapeAll({
    zone: alert.zone,
    propertyType: alert.propertyType,
    transactionType: alert.transactionType as "rent" | "buy",
    maxPrice: alert.maxPrice,
    minPrice: alert.minPrice,
    minArea: alert.minArea,
    maxArea: alert.maxArea,
    buildYearMin: alert.buildYearMin,
    market: alert.market as "primary" | "secondary" | null,
    ownerType: alert.ownerType as "agency" | "private" | null,
  });

  // 1) Listings já em DB para este alerta
  const existing = await db.select({
    externalId: propertyListings.externalId,
    source: propertyListings.source,
  }).from(propertyListings).where(eq(propertyListings.alertId, alert.id));

  const existingKey = new Set(existing.map((l) => `${l.source}:${l.externalId}`));
  const toInsert = listings.filter((l) => !existingKey.has(`${l.source}:${l.externalId}`));

  // 2) Inserir novos. Se for scrape silencioso (criação de alerta), marca como histórico.
  const seedNotifiedAt = notifyTelegram ? null : new Date().toISOString();

  for (const listing of toInsert) {
    const id = `pl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await db.insert(propertyListings).values({
      id,
      alertId: alert.id,
      leadId: alert.leadId,
      externalId: listing.externalId,
      source: listing.source,
      title: listing.title,
      price: listing.price ?? null,
      area: listing.area ?? null,
      zone: listing.zone,
      url: listing.url,
      isNew: true,
      notifiedAt: seedNotifiedAt,
    }).onConflictDoNothing();
  }

  // 3) Notificações: tudo o que está em DB para este alerta sem `notifiedAt`
  // Vão para o chat do CONSULTOR (perfil em settings), não para o chat da lead.
  let notifiedCount = 0;
  const consultantChatId = notifyTelegram ? await getConsultantChatId() : null;

  if (notifyTelegram && consultantChatId) {
    const pending = await db.select().from(propertyListings)
      .where(and(
        eq(propertyListings.alertId, alert.id),
        isNull(propertyListings.notifiedAt),
      ))
      .orderBy(desc(propertyListings.foundAt));

    const toSend = pending.slice(0, 3);

    for (const listing of toSend) {
      const priceText = listing.price
        ? `${listing.price.toLocaleString("pt-PT")} €${alert.transactionType === "rent" ? "/mês" : ""}`
        : "Preço não disponível";

      const leadLabel = lead?.name ? `Lead: ${lead.name} · ` : "";
      const msg = [
        `🏠 *Novo imóvel encontrado!*`,
        ``,
        `📍 *${listing.title ?? "Sem título"}*`,
        `💰 ${priceText}`,
        listing.area ? `📐 ${listing.area} m²` : "",
        `🔗 ${listing.url}`,
        ``,
        `_${leadLabel}${alert.propertyType} em ${alert.zone}${alert.maxPrice ? ` até ${alert.maxPrice.toLocaleString("pt-PT")} €` : ""}_`,
      ].filter(Boolean).join("\n");

      // Marca antes de enviar (evita reenvio em caso de crash)
      await db.update(propertyListings)
        .set({ notifiedAt: new Date().toISOString() })
        .where(eq(propertyListings.id, listing.id));

      await sendTelegramMessage(consultantChatId, msg);
      notifiedCount++;

      await new Promise((r) => setTimeout(r, 1000));
    }

    // Se há mais que 3 pendentes, manda resumo e marca os restantes como notificados
    if (pending.length > 3) {
      await sendTelegramMessage(
        consultantChatId,
        `_...e mais ${pending.length - 3} imóvel(is). Abre o CRM para ver todos._`
      );

      const restIds = pending.slice(3).map((p) => p.id);
      if (restIds.length > 0) {
        await db.update(propertyListings)
          .set({ notifiedAt: new Date().toISOString() })
          .where(and(
            eq(propertyListings.alertId, alert.id),
            isNull(propertyListings.notifiedAt),
          ));
      }
    }

    if (alert.leadId && notifiedCount > 0) {
      await db.insert(activities).values({
        id: `act_prop_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        leadId: alert.leadId,
        type: "property_alert",
        description: `🏠 ${pending.length} novo(s) imóvel(is) encontrado(s) em ${alert.zone}`,
      });
    }
  }

  // Deduplicar antes de actualizar lastCheckedAt
  const dedup = await deduplicateAlertListings(alertId);

  // Actualiza lastCheckedAt
  await db.update(propertyAlerts)
    .set({ lastCheckedAt: new Date().toISOString() })
    .where(eq(propertyAlerts.id, alertId));

  console.log(
    `[PropertyAlerts] Alerta ${alertId}: ${listings.length} dos portais, ${toInsert.length} novos em DB, ${notifiedCount} notificados, ${dedup.removed} duplicados removidos`
  );
  return toInsert.length;
}

/** Cron: processa todos os alertas activos */
export async function processPropertyAlerts(): Promise<void> {
  const alerts = await db.select().from(propertyAlerts).where(eq(propertyAlerts.active, true));
  if (alerts.length === 0) return;
  console.log(`[PropertyAlerts] A verificar ${alerts.length} alerta(s)...`);
  for (const alert of alerts) {
    await runAlert(alert.id, true).catch((err) =>
      console.error(`[PropertyAlerts] Erro no alerta ${alert.id}:`, err)
    );
    // Serialized with delay to prevent scraper bans (5-7 seconds between requests)
    const delay = 5000 + Math.random() * 2000;
    await new Promise((r) => setTimeout(r, delay));
  }
  console.log("[PropertyAlerts] Verificação concluída.");
}

/** Devolve todos os imóveis guardados (para a página Imóveis) */
export async function getAllListings() {
  return db.select().from(propertyListings).orderBy(desc(propertyListings.foundAt));
}
