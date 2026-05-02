import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { propertyAlerts, propertyListings, leads, activities } from "../db/schema.js";
import { scrapeAll, type SearchParams } from "./scraper.js";
import { sendTelegramMessage } from "../telegram/sender.js";

/**
 * Corre o scrape para um alerta, guarda novos imóveis na DB e envia notificações.
 * Pode ser chamado manualmente (ao criar alerta) ou pelo cron.
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

  const seenIds: string[] = JSON.parse(alert.seenIds ?? "[]");
  const newListings = listings.filter(
    (l) => !seenIds.includes(`${l.source}:${l.externalId}`)
  );

  // Guarda novos imóveis na DB
  for (const listing of newListings) {
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
    }).onConflictDoNothing();
  }

  // Envia notificação Telegram se solicitado e há lead com chatId
  if (notifyTelegram && newListings.length > 0 && lead?.telegramChatId) {
    for (const listing of newListings.slice(0, 3)) {
      const priceText = listing.price
        ? `${listing.price.toLocaleString("pt-PT")} €${alert.transactionType === "rent" ? "/mês" : ""}`
        : "Preço não disponível";

      const msg = [
        `🏠 *Novo imóvel encontrado!*`,
        ``,
        `📍 *${listing.title}*`,
        `💰 ${priceText}`,
        listing.area ? `📐 ${listing.area} m²` : "",
        `🔗 ${listing.url}`,
        ``,
        `_Alerta: ${alert.propertyType} em ${alert.zone}${alert.maxPrice ? ` até ${alert.maxPrice.toLocaleString("pt-PT")} €` : ""}_`,
      ].filter(Boolean).join("\n");

      await sendTelegramMessage(lead.telegramChatId, msg);

      // Marca como notificado
      await db.update(propertyListings)
        .set({ notifiedAt: new Date().toISOString() })
        .where(eq(propertyListings.externalId, listing.externalId));

      await new Promise((r) => setTimeout(r, 1000));
    }

    if (newListings.length > 3) {
      await sendTelegramMessage(
        lead.telegramChatId,
        `_...e mais ${newListings.length - 3} imóvel(is). Abre o CRM para ver todos._`
      );
    }

    // Log de actividade
    if (alert.leadId) {
      await db.insert(activities).values({
        id: `act_prop_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        leadId: alert.leadId,
        type: "property_alert",
        description: `🏠 ${newListings.length} novo(s) imóvel(is) encontrado(s) em ${alert.zone}`,
      });
    }
  }

  // Actualiza seenIds e lastCheckedAt
  const allSeen = [...new Set([
    ...seenIds,
    ...listings.map((l) => `${l.source}:${l.externalId}`),
  ])].slice(-500);

  await db.update(propertyAlerts)
    .set({ seenIds: JSON.stringify(allSeen), lastCheckedAt: new Date().toISOString() })
    .where(eq(propertyAlerts.id, alertId));

  console.log(`[PropertyAlerts] Alerta ${alertId}: ${listings.length} total, ${newListings.length} novos`);
  return newListings.length;
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
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log("[PropertyAlerts] Verificação concluída.");
}

/** Devolve todos os imóveis guardados (para a página Imóveis) */
export async function getAllListings() {
  return db.select().from(propertyListings).orderBy(desc(propertyListings.foundAt));
}
