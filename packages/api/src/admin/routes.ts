import { Hono } from "hono";
import { eq, desc, like, and, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { agents, leads, activities, conversations, messages, propertyAlerts, propertyListings, propertyShares, settings } from "../db/schema.js";
import { registry } from "../orchestrator/registry.js";
import { checkPassword, generateToken, authMiddleware } from "./auth.js";
import { addSSEClient, removeSSEClient } from "./sse.js";
import { classifyLeadStage } from "./ai-classifier.js";
import { scheduleFollowUp, summarizeConversation, getFollowUpsToday } from "./follow-up.js";
import { sendTelegramMessage } from "../telegram/sender.js";
import { scrapeAll } from "../properties/scraper.js";
import { runAlert } from "../properties/alerts.js";
import { saveSubscription, VAPID_PUBLIC } from "./push.js";
import { deduplicateAlertListings, deduplicateAllListings } from "../properties/dedup.js";
import { scrapeListingDetail } from "../properties/detail.js";
import type { AgentMessage } from "../agents/types.js";

const router = new Hono();

// ─── Auth ─────────────────────────────────────────────────────────────────────

router.post("/auth/login", async (c) => {
  const { password } = await c.req.json<{ password: string }>();
  if (!checkPassword(password)) {
    return c.json({ error: "Password incorreta" }, 401);
  }
  const token = generateToken();
  return c.json({ token });
});

// ─── SSE — Tempo Real ─────────────────────────────────────────────────────────

router.get("/sse", authMiddleware, (c) => {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const send = (data: any) => {
    writer.write(encoder.encode(`data: ${data}\n\n`)).catch(() => {});
  };

  addSSEClient(send);

  // Heartbeat a cada 30s para manter a ligação
  const heartbeat = setInterval(() => {
    writer.write(encoder.encode(": heartbeat\n\n")).catch(() => clearInterval(heartbeat));
  }, 30_000);

  // Cleanup quando a ligação fecha
  c.req.raw.signal.addEventListener("abort", () => {
    clearInterval(heartbeat);
    removeSSEClient(send);
    writer.close().catch(() => {});
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

router.get("/dashboard/stats", authMiddleware, async (c) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  const [totalLeads] = await db.select({ count: sql<number>`count(*)` }).from(leads);
  const [newToday] = await db.select({ count: sql<number>`count(*)` })
    .from(leads).where(sql`created_at >= ${todayStr}`);
  const [totalConversations] = await db.select({ count: sql<number>`count(*)` }).from(conversations);
  const [totalAgents] = await db.select({ count: sql<number>`count(*)` })
    .from(agents).where(eq(agents.enabled, true));

  // Leads por status
  const statusCounts = await db
    .select({ status: leads.status, count: sql<number>`count(*)` })
    .from(leads)
    .groupBy(leads.status);

  // Leads por mês (últimos 6 meses)
  const monthlyLeads = await db
    .select({
      month: sql<string>`strftime('%Y-%m', created_at)`,
      count: sql<number>`count(*)`,
    })
    .from(leads)
    .where(sql`created_at >= datetime('now', '-6 months')`)
    .groupBy(sql`strftime('%Y-%m', created_at)`)
    .orderBy(sql`strftime('%Y-%m', created_at)`);

  // Mensagens enviadas pelo agente por mês
  const monthlyMessages = await db
    .select({
      month: sql<string>`strftime('%Y-%m', created_at)`,
      count: sql<number>`count(*)`,
    })
    .from(messages)
    .where(sql`created_at >= datetime('now', '-6 months') AND role = 'assistant'`)
    .groupBy(sql`strftime('%Y-%m', created_at)`)
    .orderBy(sql`strftime('%Y-%m', created_at)`);

  // Follow-ups para hoje / em atraso
  const followUpsToday = await getFollowUpsToday();

  return c.json({
    totalLeads: totalLeads.count,
    newToday: newToday.count,
    totalConversations: totalConversations.count,
    activeAgents: totalAgents.count,
    leadsByStatus: statusCounts,
    monthlyLeads,
    monthlyMessages,
    followUpsToday: followUpsToday.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      telegramUsername: l.telegramUsername,
      status: l.status,
      followUpAt: l.followUpAt,
      followUpNote: l.followUpNote,
      conversationSummary: l.conversationSummary,
    })),
  });
});

// ─── Leads ────────────────────────────────────────────────────────────────────

router.get("/leads", authMiddleware, async (c) => {
  const status = c.req.query("status");
  const search = c.req.query("search");
  const page = Number(c.req.query("page") ?? 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = [];
  if (status) conditions.push(eq(leads.status, status));
  if (search) {
    conditions.push(
      or(
        like(leads.name, `%${search}%`),
        like(leads.phone ?? "", `%${search}%`),
        like(leads.telegramUsername ?? "", `%${search}%`)
      )
    );
  }

  const query = db.select().from(leads).orderBy(desc(leads.updatedAt)).limit(limit).offset(offset);
  const data = conditions.length > 0
    ? await query.where(and(...conditions))
    : await query;

  const countQuery = db.select({ count: sql<number>`count(*)` }).from(leads);
  const [{ count }] = conditions.length > 0
    ? await countQuery.where(and(...conditions))
    : await countQuery;

  return c.json({ data, total: count, page, limit });
});

router.post("/leads", authMiddleware, async (c) => {
  const body = await c.req.json<{
    name: string; phone?: string; email?: string; notes?: string; source?: string;
  }>();

  if (!body.name || !body.name.trim()) {
    return c.json({ error: "Nome é obrigatório" }, 400);
  }

  const id = `lead_manual_${Date.now()}`;
  await db.insert(leads).values({
    id,
    name: body.name,
    phone: body.phone,
    email: body.email,
    notes: body.notes,
    source: body.source ?? "manual",
    status: "new",
  });

  await db.insert(activities).values({
    id: `act_${Date.now()}`,
    leadId: id,
    type: "lead_created",
    description: `Lead criado manualmente: ${body.name}`,
  });

  const [created] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return c.json(created, 201);
});

router.get("/leads/:id", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;

  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead) return c.json({ error: "Lead não encontrado" }, 404);

  const leadActivities = await db.select().from(activities)
    .where(eq(activities.leadId, id)).orderBy(desc(activities.createdAt));

  const leadConversations = await db.select().from(conversations)
    .where(eq(conversations.leadId, id)).orderBy(desc(conversations.updatedAt));

  const leadPropertyAlerts = await db.select().from(propertyAlerts)
    .where(eq(propertyAlerts.leadId, id)).orderBy(desc(propertyAlerts.createdAt));

  return c.json({ ...lead, activities: leadActivities, conversations: leadConversations, propertyAlerts: leadPropertyAlerts });
});

router.patch("/leads/:id", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  const body = await c.req.json<Partial<{
    name: string; phone: string; email: string; status: string;
    notes: string; assignedAgentId: string;
  }>>();

  const [existing] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!existing) return c.json({ error: "Lead não encontrado" }, 404);

  await db.update(leads)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(leads.id, id));

  // Log de mudança de status
  if (body.status && body.status !== existing.status) {
    await db.insert(activities).values({
      id: `act_${Date.now()}`,
      leadId: id,
      type: "status_changed",
      description: `Status alterado: ${existing.status} → ${body.status}`,
    });
  }

  const [updated] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return c.json(updated);
});

router.delete("/leads/:id", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;

  // Apagar em cascata: mensagens → conversas → actividades → lead
  const leadConvs = await db.select({ id: conversations.id })
    .from(conversations).where(eq(conversations.leadId, id));

  for (const conv of leadConvs) {
    await db.delete(messages).where(eq(messages.conversationId, conv.id));
  }
  await db.delete(conversations).where(eq(conversations.leadId, id));
  await db.delete(activities).where(eq(activities.leadId, id));
  await db.delete(leads).where(eq(leads.id, id));

  return c.json({ ok: true });
});

router.get("/leads/:id/messages", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;

  const convs = await db.select().from(conversations).where(eq(conversations.leadId, id));
  if (convs.length === 0) return c.json([]);

  const convIds = convs.map((c) => c.id);
  // Busca mensagens de todas as conversas deste lead
  const msgs: typeof messages.$inferSelect[] = [];
  for (const convId of convIds) {
    const batch = await db.select().from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(messages.createdAt);
    msgs.push(...batch);
  }

  return c.json(msgs);
});

// ─── Conversas / Inbox ────────────────────────────────────────────────────────

router.get("/conversations", authMiddleware, async (c) => {
  const page = Number(c.req.query("page") ?? 1);
  const limit = 30;
  const offset = (page - 1) * limit;

  const convs = await db.select().from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(limit).offset(offset);

  // Enriquecer com lead info e última mensagem
  const enriched = await Promise.all(convs.map(async (conv) => {
    const lead = conv.leadId
      ? (await db.select().from(leads).where(eq(leads.id, conv.leadId)).limit(1))[0]
      : null;

    const [lastMsg] = await db.select().from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(desc(messages.createdAt))
      .limit(1);

    return { ...conv, lead, lastMessage: lastMsg ?? null };
  }));

  return c.json(enriched);
});

router.get("/conversations/:id", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) return c.json({ error: "Conversa não encontrada" }, 404);

  const msgs = await db.select().from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  const lead = conv.leadId
    ? (await db.select().from(leads).where(eq(leads.id, conv.leadId)).limit(1))[0]
    : null;

  return c.json({ ...conv, messages: msgs, lead });
});

// ─── Agentes ──────────────────────────────────────────────────────────────────

router.get("/agents", authMiddleware, async (c) => {
  const data = await db.select().from(agents).orderBy(agents.name);
  return c.json(data);
});

router.post("/agents", authMiddleware, async (c) => {
  const body = await c.req.json<{
    id: string; name: string; emoji?: string; description: string;
    type: "claude_api" | "managed_agent"; systemPrompt?: string;
    managedAgentId?: string; keywords?: string[];
  }>();

  await db.insert(agents).values({
    ...body,
    emoji: body.emoji ?? "🤖",
    keywords: JSON.stringify(body.keywords ?? []),
  });

  registry.invalidate();
  const [created] = await db.select().from(agents).where(eq(agents.id, body.id)).limit(1);
  return c.json(created, 201);
});

router.patch("/agents/:id", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  const body = await c.req.json<Partial<{
    name: string; emoji: string; description: string; enabled: boolean;
    systemPrompt: string; keywords: string[];
  }>>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = { ...body, updatedAt: new Date().toISOString() };
  if (body.keywords) updateData.keywords = JSON.stringify(body.keywords);

  await db.update(agents).set(updateData).where(eq(agents.id, id));
  registry.invalidate();

  const [updated] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  return c.json(updated);
});

router.delete("/agents/:id", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  await db.delete(agents).where(eq(agents.id, id));
  registry.invalidate();
  return c.json({ ok: true });
});

// Chat directo com um agente (para o dashboard — não cria lead)
router.post("/agents/:id/chat", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  const { message, history } = await c.req.json<{
    message: string;
    history?: AgentMessage[];
  }>();

  const adapter = await registry.getById(id);
  if (!adapter) return c.json({ error: "Agente não disponível" }, 404);

  const response = await adapter.sendMessage(
    message,
    history ?? [],
    `admin_chat_${id}_${Date.now()}`
  );

  return c.json({ text: response.text, agentId: id });
});

// ─── Follow-up ────────────────────────────────────────────────────────────────

router.post("/leads/:id/follow-up", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  const { timing, note } = await c.req.json<{ timing: string; note?: string }>();

  if (!timing) return c.json({ error: "timing é obrigatório" }, 400);

  const result = await scheduleFollowUp(id, timing, note);
  return c.json(result);
});

router.post("/leads/:id/summarize", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;

  const convs = await db.select().from(conversations).where(eq(conversations.leadId, id));
  if (convs.length === 0) return c.json({ error: "Sem conversas para resumir" }, 400);

  const allMessages: { role: "user" | "assistant"; content: string }[] = [];
  for (const conv of convs) {
    const msgs = await db.select().from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(messages.createdAt);
    allMessages.push(...msgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })));
  }

  const summary = await summarizeConversation(id, allMessages);
  if (!summary) return c.json({ error: "Não foi possível gerar resumo" }, 400);

  return c.json({ summary });
});

// ─── AI: Analisar e classificar fase do lead ──────────────────────────────────

router.post("/leads/:id/analyze", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;

  // Busca todas as mensagens do lead
  const convs = await db.select().from(conversations).where(eq(conversations.leadId, id));
  if (convs.length === 0) return c.json({ error: "Sem conversas para analisar" }, 400);

  const allMessages: { role: "user" | "assistant"; content: string }[] = [];
  for (const conv of convs) {
    const msgs = await db.select().from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(messages.createdAt);
    allMessages.push(...msgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })));
  }

  const result = await classifyLeadStage(id, allMessages, true);
  if (!result) return c.json({ error: "Não foi possível classificar" }, 400);

  return c.json(result);
});

// ─── Enviar mensagem proativa via Telegram ────────────────────────────────────

router.post("/conversations/:id/send", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  const { message } = await c.req.json<{ message: string }>();

  if (!message?.trim()) return c.json({ error: "Mensagem não pode estar vazia" }, 400);

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) return c.json({ error: "Conversa não encontrada" }, 404);
  if (!conv.telegramChatId) return c.json({ error: "Conversa sem chat Telegram associado" }, 400);

  // Envia via Telegram
  await sendTelegramMessage(conv.telegramChatId, message);

  // Guarda na DB como mensagem do assistente
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await db.insert(messages).values({
    id: msgId,
    conversationId: id,
    agentId: "manual",
    role: "assistant",
    content: message,
  });

  // Actualiza timestamp da conversa
  await db.update(conversations)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(conversations.id, id));

  // Log de actividade no lead
  if (conv.leadId) {
    await db.insert(activities).values({
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      leadId: conv.leadId,
      type: "message_sent",
      description: `Mensagem manual enviada: "${message.slice(0, 80)}"`,
    });
  }

  // Notifica dashboard via SSE
  const { sseBroadcast } = await import("./sse.js");
  sseBroadcast({ type: "new_message", conversationId: id, leadId: conv.leadId, preview: message.slice(0, 80) });

  const [saved] = await db.select().from(messages).where(eq(messages.id, msgId)).limit(1);
  return c.json(saved);
});

// ─── Alertas de Imóveis ───────────────────────────────────────────────────────

router.get("/leads/:id/property-alerts", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  const alerts = await db.select().from(propertyAlerts)
    .where(eq(propertyAlerts.leadId, id))
    .orderBy(desc(propertyAlerts.createdAt));
  return c.json(alerts);
});

router.post("/leads/:id/property-alerts", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  const body = await c.req.json<{
    zone: string;
    propertyType: string;
    transactionType: "rent" | "buy";
    maxPrice?: number;
    minPrice?: number;
    minArea?: number;
    maxArea?: number;
    buildYearMin?: number;
    market?: "primary" | "secondary" | null;
    ownerType?: "agency" | "private" | null;
  }>();

  if (body.minPrice !== undefined && body.maxPrice !== undefined && body.minPrice > body.maxPrice) {
    return c.json({ error: "Preço mínimo não pode ser superior ao máximo" }, 400);
  }
  if (body.minArea !== undefined && body.maxArea !== undefined && body.minArea > body.maxArea) {
    return c.json({ error: "Área mínima não pode ser superior à máxima" }, 400);
  }

  const alertId = `alert_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await db.insert(propertyAlerts).values({
    id: alertId,
    leadId: id,
    zone: body.zone,
    propertyType: body.propertyType,
    transactionType: body.transactionType,
    maxPrice: body.maxPrice ?? null,
    minPrice: body.minPrice ?? null,
    minArea: body.minArea ?? null,
    maxArea: body.maxArea ?? null,
    buildYearMin: body.buildYearMin ?? null,
    market: body.market ?? null,
    ownerType: body.ownerType ?? null,
  });

  // Log
  await db.insert(activities).values({
    id: `act_${Date.now()}`,
    leadId: id,
    type: "property_alert_created",
    description: `🔔 Alerta criado: ${body.propertyType} em ${body.zone}${body.maxPrice ? ` até ${body.maxPrice} €` : ""}`,
  });

  // Scrape imediato (await para devolver resultados na resposta)
  let newCount = 0;
  try {
    newCount = await runAlert(alertId, false);
  } catch (err) {
    console.error("[PropertyAlerts] Scrape imediato falhou:", err);
  }

  const [created] = await db.select().from(propertyAlerts).where(eq(propertyAlerts.id, alertId)).limit(1);
  return c.json({ ...created, newCount }, 201);
});

router.delete("/property-alerts/:id", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  await db.delete(propertyAlerts).where(eq(propertyAlerts.id, id));
  return c.json({ ok: true });
});

router.patch("/property-alerts/:id", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  const body = await c.req.json<Partial<{
    zone: string;
    propertyType: string;
    transactionType: string;
    maxPrice: number;
    minPrice: number;
    minArea: number;
    maxArea: number;
    buildYearMin: number;
    market: string;
    ownerType: string;
    active: boolean;
  }>>();

  const patchMinPrice = body.minPrice ?? null;
  const patchMaxPrice = body.maxPrice ?? null;
  if (patchMinPrice !== null && patchMaxPrice !== null && patchMinPrice > patchMaxPrice) {
    return c.json({ error: "Preço mínimo não pode ser superior ao máximo" }, 400);
  }
  const patchMinArea = body.minArea ?? null;
  const patchMaxArea = body.maxArea ?? null;
  if (patchMinArea !== null && patchMaxArea !== null && patchMinArea > patchMaxArea) {
    return c.json({ error: "Área mínima não pode ser superior à máxima" }, 400);
  }

  const updates: any = {};
  if (body.zone !== undefined) updates.zone = body.zone;
  if (body.propertyType !== undefined) updates.propertyType = body.propertyType;
  if (body.transactionType !== undefined) updates.transactionType = body.transactionType;
  if (body.maxPrice !== undefined) updates.maxPrice = body.maxPrice;
  if (body.minPrice !== undefined) updates.minPrice = body.minPrice;
  if (body.minArea !== undefined) updates.minArea = body.minArea;
  if (body.maxArea !== undefined) updates.maxArea = body.maxArea;
  if (body.buildYearMin !== undefined) updates.buildYearMin = body.buildYearMin;
  if (body.market !== undefined) updates.market = body.market;
  if (body.ownerType !== undefined) updates.ownerType = body.ownerType;
  if (body.active !== undefined) updates.active = body.active;

  await db.update(propertyAlerts).set(updates).where(eq(propertyAlerts.id, id));
  const [updated] = await db.select().from(propertyAlerts).where(eq(propertyAlerts.id, id)).limit(1);
  return c.json(updated);
});

// Todos os imóveis encontrados (página Imóveis)
router.get("/property-listings", authMiddleware, async (c) => {
  const alertId = c.req.query("alertId");
  const leadId = c.req.query("leadId");

  let query = db.select().from(propertyListings).orderBy(desc(propertyListings.foundAt));
  const rows = await query;

  const filtered = rows.filter((r) => {
    if (alertId && r.alertId !== alertId) return false;
    if (leadId && r.leadId !== leadId) return false;
    return true;
  });

  return c.json(filtered);
});

// Marcar imóvel como visto (isNew = false)
router.patch("/property-listings/:id/seen", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  await db.update(propertyListings).set({ isNew: false }).where(eq(propertyListings.id, id));
  return c.json({ ok: true });
});

// Atualizar flags do imóvel (favorito, escondido, visto)
router.patch("/property-listings/:id", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  const body = await c.req.json<Partial<{ isFavorite: boolean; isHidden: boolean; isNew: boolean }>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};
  if (body.isFavorite !== undefined) updateData.isFavorite = body.isFavorite;
  if (body.isHidden !== undefined) updateData.isHidden = body.isHidden;
  if (body.isNew !== undefined) updateData.isNew = body.isNew;
  if (Object.keys(updateData).length === 0) return c.json({ error: "Nada para atualizar" }, 400);
  await db.update(propertyListings).set(updateData).where(eq(propertyListings.id, id));
  const [updated] = await db.select().from(propertyListings).where(eq(propertyListings.id, id)).limit(1);
  return c.json(updated);
});

// Apagar imóvel
router.delete("/property-listings/:id", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  await db.delete(propertyShares).where(eq(propertyShares.listingId, id));
  await db.delete(propertyListings).where(eq(propertyListings.id, id));
  return c.json({ ok: true });
});

// Detalhes completos de um imóvel (lazy scrape com cache)
router.get("/property-listings/:id", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  const [listing] = await db.select().from(propertyListings).where(eq(propertyListings.id, id)).limit(1);
  if (!listing) return c.json({ error: "Imóvel não encontrado" }, 404);

  const refresh = c.req.query("refresh") === "1";

  if (listing.details && !refresh) {
    try {
      return c.json({ ...listing, detail: JSON.parse(listing.details) });
    } catch {
      // continua para re-scrape
    }
  }

  const detail = await scrapeListingDetail(listing.source, listing.externalId, listing.url);
  if (!detail) return c.json({ ...listing, detail: null, error: "Não foi possível obter detalhes" });

  await db.update(propertyListings)
    .set({ details: JSON.stringify(detail), detailsScrapedAt: new Date().toISOString() })
    .where(eq(propertyListings.id, id));

  return c.json({ ...listing, detail });
});

// Criar/obter link público de partilha
router.post("/property-listings/:id/share", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  const [listing] = await db.select().from(propertyListings).where(eq(propertyListings.id, id)).limit(1);
  if (!listing) return c.json({ error: "Imóvel não encontrado" }, 404);

  // Reutiliza partilha existente se houver
  const existing = await db.select().from(propertyShares).where(eq(propertyShares.listingId, id)).limit(1);
  if (existing.length > 0) {
    return c.json({ token: existing[0].id, url: `/share/${existing[0].id}`, viewCount: existing[0].viewCount });
  }

  const { generateSecureToken } = await import("../utils/token.js");
  const token = generateSecureToken("sh");
  await db.insert(propertyShares).values({ id: token, listingId: id });
  return c.json({ token, url: `/share/${token}`, viewCount: 0 }, 201);
});

// Apagar link de partilha
router.delete("/property-listings/:id/share", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  await db.delete(propertyShares).where(eq(propertyShares.listingId, id));
  return c.json({ ok: true });
});

// Página pública de partilha (sem auth)
router.get("/public/share/:token", async (c) => {
  const token = c.req.param("token") as string;
  const [share] = await db.select().from(propertyShares).where(eq(propertyShares.id, token)).limit(1);
  if (!share) return c.json({ error: "Partilha não encontrada" }, 404);

  const [listing] = await db.select().from(propertyListings).where(eq(propertyListings.id, share.listingId)).limit(1);
  if (!listing) return c.json({ error: "Imóvel não encontrado" }, 404);

  // Garante que tem detalhes
  let detail = null;
  if (listing.details) {
    try { detail = JSON.parse(listing.details); } catch { /* ignore */ }
  }
  if (!detail) {
    try {
      const { withTimeout } = await import("../utils/token.js");
      detail = await withTimeout(
        scrapeListingDetail(listing.source, listing.externalId, listing.url),
        10_000
      );
      if (detail) {
        await db.update(propertyListings)
          .set({ details: JSON.stringify(detail), detailsScrapedAt: new Date().toISOString() })
          .where(eq(propertyListings.id, listing.id));
      }
    } catch (err) {
      console.error(`[Share] Timeout ou erro ao scrape ${listing.source}/${listing.externalId}:`, err);
    }
  }

  // Incrementa view count
  await db.update(propertyShares)
    .set({ viewCount: share.viewCount + 1 })
    .where(eq(propertyShares.id, token));

  // Perfil do agente (settings)
  const profileRows = await db.select().from(settings).where(eq(settings.key, "agent_profile")).limit(1);
  let profile: Record<string, string> = {};
  if (profileRows.length > 0 && profileRows[0].value) {
    try { profile = JSON.parse(profileRows[0].value); } catch { /* ignore */ }
  }

  return c.json({ listing, detail, profile });
});

// ─── Settings: Perfil do agente ───────────────────────────────────────────────

router.get("/settings/profile", authMiddleware, async (c) => {
  const rows = await db.select().from(settings).where(eq(settings.key, "agent_profile")).limit(1);
  if (rows.length === 0 || !rows[0].value) return c.json({});
  try {
    return c.json(JSON.parse(rows[0].value));
  } catch {
    return c.json({});
  }
});

router.patch("/settings/profile", authMiddleware, async (c) => {
  const body = await c.req.json<Record<string, string>>();
  const value = JSON.stringify(body);
  const now = new Date().toISOString();
  const existing = await db.select().from(settings).where(eq(settings.key, "agent_profile")).limit(1);
  if (existing.length > 0) {
    await db.update(settings).set({ value, updatedAt: now }).where(eq(settings.key, "agent_profile"));
  } else {
    await db.insert(settings).values({ key: "agent_profile", value, updatedAt: now });
  }
  return c.json(body);
});

// Forçar re-scrape de um alerta
router.post("/property-alerts/:id/run", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  const newCount = await runAlert(id, true);
  return c.json({ newCount });
});

// Deduplicar imóveis de um alerta específico (?dryRun=1 para preview sem apagar)
router.post("/property-alerts/:id/dedup", authMiddleware, async (c) => {
  const id = c.req.param("id") as string;
  const dryRun = c.req.query("dryRun") === "1";
  const result = await deduplicateAlertListings(id, { dryRun });
  return c.json(result);
});

// Deduplicar todos os imóveis (operação global, ?dryRun=1 para preview)
router.post("/property-listings/dedup", authMiddleware, async (c) => {
  const dryRun = c.req.query("dryRun") === "1";
  const result = await deduplicateAllListings({ dryRun });
  return c.json(result);
});

// Todos os alertas (para a página Imóveis) — inclui nome da lead e contagem de imóveis
router.get("/property-alerts-all", authMiddleware, async (c) => {
  const allAlerts = await db.select().from(propertyAlerts).orderBy(desc(propertyAlerts.createdAt));
  const allLeads = await db.select().from(leads);
  const allListings = await db.select().from(propertyListings);

  const enriched = allAlerts.map((a) => {
    const lead = allLeads.find((l) => l.id === a.leadId);
    const listingsForAlert = allListings.filter((l) => l.alertId === a.id);
    return {
      ...a,
      leadName: lead?.name ?? null,
      listingsCount: listingsForAlert.length,
      newCount: listingsForAlert.filter((l) => l.isNew).length,
    };
  });

  return c.json(enriched);
});

// Testar alerta manualmente (preview sem guardar)
router.post("/leads/:id/property-alerts/test", authMiddleware, async (c) => {
  const body = await c.req.json<{
    zone: string;
    propertyType: string;
    transactionType: "rent" | "buy";
    maxPrice?: number;
    minPrice?: number;
    minArea?: number;
    maxArea?: number;
    buildYearMin?: number;
    market?: "primary" | "secondary" | null;
    ownerType?: "agency" | "private" | null;
  }>();
  const listings = await scrapeAll({
    zone: body.zone,
    propertyType: body.propertyType,
    transactionType: body.transactionType,
    maxPrice: body.maxPrice,
    minPrice: body.minPrice,
    minArea: body.minArea,
    maxArea: body.maxArea,
    buildYearMin: body.buildYearMin,
    market: body.market,
    ownerType: body.ownerType,
  });
  return c.json({ count: listings.length, listings: listings.slice(0, 5) });
});

// ─── Push Notifications ───────────────────────────────────────────────────────

router.get("/push/vapid-key", (c) => {
  return c.json({ publicKey: VAPID_PUBLIC });
});

router.post("/push/subscribe", authMiddleware, async (c) => {
  const sub = await c.req.json<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }>();
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return c.json({ error: "Subscrição inválida" }, 400);
  }
  await saveSubscription(sub);
  return c.json({ ok: true });
});

export { router as adminRoutes };
