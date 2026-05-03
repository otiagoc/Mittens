import { Bot } from "grammy";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { conversations, messages, leads, activities } from "../db/schema.js";
import { registry } from "../orchestrator/registry.js";
import { sseBroadcast } from "../admin/sse.js";
import { classifyLeadStage } from "../admin/ai-classifier.js";
import { summarizeConversation, detectAndScheduleFollowUp } from "../admin/follow-up.js";
import type { AgentMessage } from "../agents/types.js";

// O bot Telegram está dedicado exclusivamente ao agente D&D Group (imobiliário)
const DND_AGENT_ID = "dnd";

// Rate limiting: 10 messages per 60 seconds per chatId
const messageTimestamps = new Map<string, number[]>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Per-chat message processing queue to prevent race conditions
const chatProcessingQueues = new Map<string, Promise<void>>();

async function enqueueMessage(chatId: string, handler: () => Promise<void>): Promise<void> {
  const currentQueue = chatProcessingQueues.get(chatId) ?? Promise.resolve();
  const nextQueue = currentQueue.then(handler).catch((err) => {
    console.error(`[Bot] Erro na fila de processamento para chat ${chatId}:`, err);
  });
  chatProcessingQueues.set(chatId, nextQueue);
  await nextQueue;
}

function checkRateLimit(chatId: string): boolean {
  const now = Date.now();
  const timestamps = messageTimestamps.get(chatId) ?? [];

  // Remove timestamps older than the rate limit window
  const recentTimestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

  if (recentTimestamps.length >= RATE_LIMIT_MAX) {
    return false; // Rate limit exceeded
  }

  recentTimestamps.push(now);
  messageTimestamps.set(chatId, recentTimestamps);
  return true; // Rate limit OK
}

export function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN não definido");

  const bot = new Bot(token);

  // ─── /start ────────────────────────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    await ctx.reply(
      `👋 Olá! Sou o assistente do *D&D Group* — RE/MAX.\n\n` +
      `Estou aqui para te ajudar a encontrar o imóvel ideal em Portugal, ` +
      `seja para compra, arrendamento ou investimento.\n\n` +
      `Conta-me o que procuras e eu trato do resto! 🏠`,
      { parse_mode: "Markdown" }
    );
  });

  // ─── /ajuda ────────────────────────────────────────────────────────────────
  bot.command("ajuda", async (ctx) => {
    await ctx.reply(
      `*Como posso ajudar-te:*\n\n` +
      `🏠 Pesquisar imóveis por zona, tipologia e orçamento\n` +
      `📅 Agendar visitas a propriedades\n` +
      `💰 Informação sobre preços e investimento\n` +
      `📋 Esclarecer dúvidas sobre processos de compra/arrendamento\n\n` +
      `Envia-me uma mensagem a descrever o que procuras!`,
      { parse_mode: "Markdown" }
    );
  });

  // ─── /meu_id ───────────────────────────────────────────────────────────────
  bot.command("meu_id", async (ctx) => {
    await ctx.reply(
      `*O teu ID Telegram é:* \`${ctx.chat.id}\`\n\n` +
      `_Cola este número em Definições → ID Telegram, no CRM Mittens, para receberes os alertas de imóveis._`,
      { parse_mode: "Markdown" }
    );
  });

  // ─── /reset ────────────────────────────────────────────────────────────────
  bot.command("reset", async (ctx) => {
    const chatId = String(ctx.chat.id);
    await db
      .update(conversations)
      .set({
        managedAgentSessionId: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(conversations.telegramChatId, chatId));

    await ctx.reply("✅ Conversa reiniciada. Como posso ajudar-te?");
  });

  // ─── Mensagens de texto ────────────────────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const userMessage = ctx.message.text;
    const from = ctx.message.from;

    // Rate limiting
    if (!checkRateLimit(chatId)) {
      await ctx.reply("⏳ Estás a enviar mensagens muito rapidamente. Aguarda um momento e tenta novamente.");
      return;
    }

    // Enqueue message to prevent race conditions from concurrent messages in the same chat
    await enqueueMessage(chatId, async () => {
      // Typing indicator
      await ctx.replyWithChatAction("typing");

      try {
        // Obtém/cria lead e conversa
        const { conv, lead } = await getOrCreateConversationWithLead(chatId, from);
        const history = await getConversationHistory(conv.id);

        // Obtém o adaptador D&D
        const adapter = await registry.getById(DND_AGENT_ID);
        if (!adapter) {
          await ctx.reply("⚠️ Serviço temporariamente indisponível. Tenta novamente mais tarde.");
          return;
        }

        // Indicador "a pensar..."
        const thinkingMsg = await ctx.reply(`🏠 _A verificar as melhores opções para si..._`, {
          parse_mode: "Markdown",
        });

        // Guarda mensagem do utilizador
        await saveMessage(conv.id, null, "user", userMessage);

        // Log de actividade
        await logActivity(lead.id, "message_received", `Mensagem recebida: "${userMessage.slice(0, 100)}"`);

        // Chama o agente
        const response = await adapter.sendMessage(userMessage, history, conv.id);

        // Guarda resposta
        await saveMessage(conv.id, DND_AGENT_ID, "assistant", response.text);

        // Actualiza timestamp da conversa
        await db.update(conversations)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(conversations.id, conv.id));

        // Log de actividade
        await logActivity(lead.id, "message_sent", `Resposta enviada pelo agente D&D`);

        // Classificação automática de fase + resumo (não bloqueiam a resposta)
        const fullHistory = await getConversationHistory(conv.id);

        classifyLeadStage(lead.id, fullHistory).then((classification) => {
          if (classification?.changed) {
            sseBroadcast({ type: "lead_updated", leadId: lead.id, leadName: lead.name, newStage: classification.stage });
          }
        }).catch(() => {});

        // Gera resumo a cada 5 mensagens do utilizador
        const userMsgCount = fullHistory.filter((m) => m.role === "user").length;
        if (userMsgCount > 0 && userMsgCount % 5 === 0) {
          summarizeConversation(lead.id, fullHistory).catch(() => {});
        }

        // Deteta e agenda follow-up automaticamente se o agente mencionou um
        detectAndScheduleFollowUp(lead.id, response.text).catch(() => {});

        // Remove "a pensar..."
        await ctx.api.deleteMessage(ctx.chat.id, thinkingMsg.message_id).catch(() => {});

        // Envia resposta
        const chunks = splitMessage(response.text);
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(() => ctx.reply(chunk));
        }

        // Notifica o dashboard via SSE
        sseBroadcast({
          type: "new_message",
          conversationId: conv.id,
          leadId: lead.id,
          leadName: lead.name,
          preview: userMessage.slice(0, 80),
        });

      } catch (err) {
        console.error("[Bot] Erro ao processar mensagem:", err);
        await ctx.reply("😕 Ocorreu um erro. Por favor tenta novamente.");
      }
    });
  });

  return bot;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateConversationWithLead(
  telegramChatId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: any
) {
  // Conversa existente?
  const [existingConv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.telegramChatId, telegramChatId))
    .limit(1);

  if (existingConv && existingConv.leadId) {
    const [existingLead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, existingConv.leadId))
      .limit(1);

    if (existingLead) return { conv: existingConv, lead: existingLead };
  }

  // Cria lead se não existe
  const leadId = `lead_${telegramChatId}_${Date.now()}`;
  const firstName = from?.first_name ?? "";
  const lastName = from?.last_name ?? "";
  const username = from?.username ?? null;
  const leadName = [firstName, lastName].filter(Boolean).join(" ") || `Utilizador ${telegramChatId}`;

  await db.insert(leads).values({
    id: leadId,
    name: leadName,
    telegramChatId,
    telegramUsername: username,
    source: "telegram",
    status: "new",
    assignedAgentId: DND_AGENT_ID,
  }).onConflictDoNothing();

  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);

  // Cria/actualiza conversa com o leadId
  let conv = existingConv;
  if (!conv) {
    const convId = `conv_${telegramChatId}_${Date.now()}`;
    await db.insert(conversations).values({
      id: convId,
      telegramChatId,
      telegramFirstName: firstName || null,
      telegramUsername: username,
      leadId: lead.id,
      activeAgentId: DND_AGENT_ID,
      activeAgentSetAt: new Date().toISOString(),
    });
    const [created] = await db.select().from(conversations).where(eq(conversations.id, convId)).limit(1);
    conv = created;
  } else {
    await db.update(conversations)
      .set({ leadId: lead.id, updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, conv.id));
    const [updated] = await db.select().from(conversations).where(eq(conversations.id, conv.id)).limit(1);
    conv = updated;
  }

  // Log criação do lead
  await logActivity(lead.id, "lead_created", `Lead criado via Telegram: @${username ?? telegramChatId}`);

  // Notifica o dashboard
  sseBroadcast({ type: "new_lead", leadId: lead.id, leadName: lead.name });

  return { conv, lead };
}

async function getConversationHistory(conversationId: string): Promise<AgentMessage[]> {
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  return msgs.slice(-20).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

async function saveMessage(
  conversationId: string,
  agentId: string | null,
  role: "user" | "assistant",
  content: string
) {
  await db.insert(messages).values({
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    conversationId,
    agentId,
    role,
    content,
  });
}

async function logActivity(leadId: string, type: string, description: string, metadata?: object) {
  await db.insert(activities).values({
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    leadId,
    type,
    description,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

/** Divide mensagens longas em chunks de 4000 chars (limite Telegram: 4096) */
function splitMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return chunks;
}
