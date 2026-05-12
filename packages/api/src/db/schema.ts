import { sql } from "drizzle-orm";
import { integer, text, sqliteTable } from "drizzle-orm/sqlite-core";

// ─── Agentes ─────────────────────────────────────────────────────────────────

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🤖"),
  description: text("description").notNull(),
  keywords: text("keywords").notNull().default("[]"), // JSON array
  type: text("type", { enum: ["claude_api", "managed_agent", "n8n_workflow"] }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  systemPrompt: text("system_prompt"),
  managedAgentId: text("managed_agent_id"),
  n8nWorkflowId: text("n8n_workflow_id"),
  createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

// ─── Leads ────────────────────────────────────────────────────────────────────

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  source: text("source").notNull().default("telegram"), // "telegram" | "manual" | "import"
  status: text("status").notNull().default("new"),
  // "new" | "contacted" | "qualified" | "visit_scheduled" | "proposal" | "closed_won" | "closed_lost"
  notes: text("notes"),
  telegramChatId: text("telegram_chat_id"),
  telegramUsername: text("telegram_username"),
  assignedAgentId: text("assigned_agent_id"),
  followUpAt: text("follow_up_at"),             // data de próximo follow-up (ISO)
  followUpNote: text("follow_up_note"),          // nota do follow-up
  conversationSummary: text("conversation_summary"), // resumo da conversa gerado pela IA
  createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
});

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;

// ─── Actividades ──────────────────────────────────────────────────────────────

export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").references(() => leads.id),
  type: text("type").notNull(),
  // "message_sent" | "message_received" | "status_changed" | "note_added" | "lead_created"
  description: text("description").notNull(),
  metadata: text("metadata"), // JSON livre
  createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
});

export type Activity = typeof activities.$inferSelect;

// ─── Conversas ───────────────────────────────────────────────────────────────

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  telegramChatId: text("telegram_chat_id").notNull(),
  telegramFirstName: text("telegram_first_name"),
  telegramUsername: text("telegram_username"),
  leadId: text("lead_id").references(() => leads.id),
  activeAgentId: text("active_agent_id"),
  activeAgentSetAt: text("active_agent_set_at"),
  managedAgentSessionId: text("managed_agent_session_id"),
  createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
});

export type Conversation = typeof conversations.$inferSelect;

// ─── Mensagens ───────────────────────────────────────────────────────────────

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  agentId: text("agent_id"),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  routerConfidence: text("router_confidence"),
  createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
});

export type Message = typeof messages.$inferSelect;

// ─── Alertas de Imóveis ───────────────────────────────────────────────────────

export const propertyAlerts = sqliteTable("property_alerts", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").references(() => leads.id),
  zone: text("zone").notNull(),                          // ex: "Oeiras", "Lisboa"
  propertyType: text("property_type").notNull().default("T2"), // T1 | T2 | T3 | T4+
  transactionType: text("transaction_type").notNull().default("rent"), // rent | buy
  maxPrice: integer("max_price"),                        // preço máximo em €
  minPrice: integer("min_price"),                        // preço mínimo em €
  minArea: integer("min_area"),                          // área mínima em m²
  maxArea: integer("max_area"),                          // área máxima em m²
  buildYearMin: integer("build_year_min"),               // ano construção mínimo
  market: text("market"),                                // "primary" | "secondary" | null (qualquer)
  ownerType: text("owner_type"),                         // "agency" | "private" | null (qualquer)
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  seenIds: text("seen_ids").notNull().default("[]"),     // JSON array de IDs já vistos/enviados
  lastCheckedAt: text("last_checked_at"),
  createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
});

export type PropertyAlert = typeof propertyAlerts.$inferSelect;

export const propertyListings = sqliteTable("property_listings", {
  id: text("id").primaryKey(),
  alertId: text("alert_id").references(() => propertyAlerts.id),
  leadId: text("lead_id"),
  externalId: text("external_id").notNull(),
  source: text("source").notNull(),        // "idealista" | "imovirtual"
  title: text("title"),
  price: integer("price"),
  area: integer("area"),
  zone: text("zone"),
  url: text("url").notNull(),
  isNew: integer("is_new", { mode: "boolean" }).notNull().default(true),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
  details: text("details"),                // JSON cache do scrape detalhado
  detailsScrapedAt: text("details_scraped_at"),
  notifiedAt: text("notified_at"),         // quando foi enviado por Telegram
  foundAt: text("found_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
  publishedAt: text("published_at"),  // data de publicação no portal (quando disponível)
});

export type PropertyListing = typeof propertyListings.$inferSelect;

// ─── Partilhas (links públicos personalizados) ────────────────────────────────

export const propertyShares = sqliteTable("property_shares", {
  id: text("id").primaryKey(),               // token usado no URL público
  listingId: text("listing_id").notNull().references(() => propertyListings.id),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
});

export type PropertyShare = typeof propertyShares.$inferSelect;

// ─── Settings (chave-valor: perfil do agente, etc.) ───────────────────────────

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: text("updated_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`),
});

export type Setting = typeof settings.$inferSelect;
