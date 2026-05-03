/**
 * Follow-up scheduler — classifica o timing da conversa e agenda o próximo contacto.
 * Inspirado no workflow "Flávio | Tool | Follow Up" do N8n.
 *
 * Também gera resumos automáticos da conversa para o perfil do lead.
 */

import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { leads, activities, conversations, messages } from "../db/schema.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type FollowUpTiming = "1_semana" | "2_semanas" | "1_mes" | "3_meses" | "6_meses" | "data_especifica";

export interface FollowUpResult {
  timing: FollowUpTiming;
  followUpAt: string;     // ISO date
  followUpFormatted: string; // "15 de julho de 2026"
  note?: string;
}

const PT_MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);
  // Corrige overflow (ex: 31 jan + 1 mês = 28 fev)
  if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setDate(0);
  }
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDatePt(date: Date): string {
  return `${date.getDate()} de ${PT_MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatDateIso(date: Date): string {
  return date.toISOString().split("T")[0];
}

/** Classifica texto livre de timing para uma categoria */
async function classifyTiming(text: string): Promise<FollowUpTiming> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 50,
    system: `Classifica o texto em UMA destas categorias. Responde APENAS com a categoria, nada mais.

Categorias:
- 1_semana: esta semana, em breve, nos próximos dias, 1 semana
- 2_semanas: duas semanas, quinze dias, em duas semanas
- 1_mes: próximo mês, um mês, daqui a um mês, mês que vem
- 3_meses: alguns meses, breve, proximamente, 2-3 meses, daqui a pouco
- 6_meses: mais tarde, futuramente, final do ano, meio ano, 4-6 meses, bastante tempo
- data_especifica: mencionou data concreta (ex: "dia 15", "em junho", "na semana de 20")`,
    messages: [{ role: "user", content: text }],
  });
  const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "3_meses";
  const valid: FollowUpTiming[] = ["1_semana", "2_semanas", "1_mes", "3_meses", "6_meses", "data_especifica"];
  return valid.includes(raw as FollowUpTiming) ? (raw as FollowUpTiming) : "3_meses";
}

function timingToDate(timing: FollowUpTiming): Date {
  const now = new Date();
  switch (timing) {
    case "1_semana":      return addDays(now, 7);
    case "2_semanas":     return addDays(now, 14);
    case "1_mes":         return addMonths(now, 1);
    case "3_meses":       return addMonths(now, 3);
    case "6_meses":       return addMonths(now, 6);
    case "data_especifica": return addMonths(now, 1); // fallback
    default:              return addMonths(now, 3);
  }
}

/**
 * Agenda follow-up para um lead.
 * Aceita texto livre ("daqui a 3 meses") ou data ISO direta.
 */
export async function scheduleFollowUp(
  leadId: string,
  timingText: string,
  note?: string
): Promise<FollowUpResult> {
  let timing: FollowUpTiming;
  let followUpDate: Date;

  // Tenta parsear como data ISO directa
  const isoDate = new Date(timingText);
  if (!isNaN(isoDate.getTime()) && timingText.includes("-")) {
    followUpDate = isoDate;
    timing = "data_especifica";
  } else {
    timing = await classifyTiming(timingText);
    followUpDate = timingToDate(timing);
  }

  const followUpAt = followUpDate.toISOString();
  const followUpFormatted = formatDatePt(followUpDate);

  // Guarda na DB
  await db.update(leads)
    .set({
      followUpAt,
      followUpNote: note ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(leads.id, leadId));

  // Log de actividade
  await db.insert(activities).values({
    id: `act_fu_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    leadId,
    type: "follow_up_scheduled",
    description: `📅 Follow-up agendado para ${followUpFormatted}${note ? `: "${note}"` : ""}`,
    metadata: JSON.stringify({ timing, followUpAt, note }),
  });

  return { timing, followUpAt, followUpFormatted, note };
}

/**
 * Gera um resumo da conversa usando Claude e guarda no lead.
 * Chamado automaticamente após algumas mensagens.
 */
export async function summarizeConversation(
  leadId: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<string | null> {
  if (history.length < 4) return null; // precisa de substância

  const conversationText = history
    .map((m) => `${m.role === "user" ? "Lead" : "Agente"}: ${m.content}`)
    .join("\n\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: `És um assistente que resume conversas imobiliárias de forma concisa.
Extrai apenas o essencial: o que o lead procura, o seu interesse, e qualquer informação relevante sobre follow-up ou visitas.
Escreve em português de Portugal, em texto corrido, máximo 3-4 frases.`,
      messages: [{
        role: "user",
        content: `Resume esta conversa:\n\n${conversationText}`,
      }],
    });

    const summary = response.content[0].type === "text" ? response.content[0].text.trim() : null;
    if (!summary) return null;

    await db.update(leads)
      .set({ conversationSummary: summary, updatedAt: new Date().toISOString() })
      .where(eq(leads.id, leadId));

    return summary;
  } catch (err) {
    console.error("[Summarize] Erro:", err);
    return null;
  }
}

/**
 * Detecta automaticamente se a resposta do agente menciona um follow-up e agenda-o.
 * Chamado de forma não-bloqueante após cada resposta no bot.
 */
export async function detectAndScheduleFollowUp(
  leadId: string,
  agentResponseText: string
): Promise<void> {
  // Só corre se ainda não há follow-up agendado
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead || lead.followUpAt) return;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 150,
      system: `Analisa o texto e detecta se menciona agendar um próximo contacto, follow-up, ou que foi combinado contactar mais tarde.
Responde APENAS com JSON válido, sem markdown, sem explicações:
{"detected": true, "timing": "<texto do timing mencionado>", "note": "<breve nota>"}
ou
{"detected": false}

Exemplos que devem devolver detected=true:
- "contacto daqui a 2 meses" → timing: "2 meses"
- "follow-up agendado para daqui a 2 meses" → timing: "2 meses"
- "ligo-te em junho" → timing: "junho"
- "falamos mais para a frente" → timing: "3 meses"
- "retomo o contacto em 3 meses" → timing: "3 meses"
- "contactarei brevemente" → timing: "1 semana"`,
      messages: [{ role: "user", content: agentResponseText }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    console.log(`[FollowUp Detect] lead=${leadId} raw="${raw}"`);

    // Extrai JSON mesmo que venha com markdown
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.detected && parsed.timing) {
      await scheduleFollowUp(leadId, parsed.timing, parsed.note ?? undefined);
      console.log(`[FollowUp] ✓ Auto-agendado para lead ${leadId}: "${parsed.timing}"`);
    }
  } catch (err) {
    console.error(`[FollowUp Detect] Erro lead=${leadId}:`, err);
  }
}

/**
 * Processa follow-ups em atraso: gera mensagem personalizada e envia via Telegram.
 * Chamado periodicamente (cron diário) a partir de index.ts.
 */
export async function processFollowUps(): Promise<void> {
  const due = await getFollowUpsToday();
  if (due.length === 0) return;

  console.log(`[FollowUp] A processar ${due.length} follow-up(s) em atraso...`);

  // Import lazy para evitar dependência circular
  const { sendTelegramMessage } = await import("../telegram/sender.js");

  for (const lead of due) {
    if (!lead.telegramChatId) continue;

    try {
      // Gera mensagem personalizada com base no resumo + nota do follow-up
      const context = [
        lead.conversationSummary ? `Contexto da última conversa: ${lead.conversationSummary}` : "",
        lead.followUpNote ? `Motivo do follow-up: ${lead.followUpNote}` : "",
      ].filter(Boolean).join("\n");

      const msgResponse = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 200,
        system: `És a Joana, assistente do D&D Group RE/MAX. Escreve uma mensagem curta e natural (2-3 frases) em português de Portugal para retomar contacto com um cliente com quem já falaste anteriormente. Sê calorosa, não uses linguagem de chatbot. Menciona que estás a seguir com o contacto conforme combinado.`,
        messages: [{
          role: "user",
          content: context || `Retoma o contacto com ${lead.name}, cliente imobiliário.`,
        }],
      });

      const outreachText = msgResponse.content[0].type === "text"
        ? msgResponse.content[0].text.trim()
        : `Olá ${lead.name}! 👋 Conforme combinámos, estou a retomar o contacto. Continuas à procura do teu imóvel? Estou aqui para ajudar!`;

      // Envia via Telegram
      await sendTelegramMessage(lead.telegramChatId, outreachText);

      // Guarda mensagem na conversa
      const [conv] = await db.select().from(conversations)
        .where(eq(conversations.leadId, lead.id)).limit(1);

      if (conv) {
        await db.insert(messages).values({
          id: `msg_fu_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          conversationId: conv.id,
          agentId: "follow-up",
          role: "assistant",
          content: outreachText,
        });
        await db.update(conversations)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(conversations.id, conv.id));
      }

      // Limpa o follow-up e loga actividade
      await db.update(leads)
        .set({ followUpAt: null, followUpNote: null, updatedAt: new Date().toISOString() })
        .where(eq(leads.id, lead.id));

      await db.insert(activities).values({
        id: `act_fu_sent_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        leadId: lead.id,
        type: "follow_up_sent",
        description: `📨 Follow-up automático enviado: "${outreachText.slice(0, 80)}"`,
      });

      console.log(`[FollowUp] ✓ Enviado para ${lead.name} (@${lead.telegramUsername ?? lead.telegramChatId})`);
    } catch (err) {
      console.error(`[FollowUp] Erro ao processar ${lead.name}:`, err);
    }
  }
}

/**
 * Backfill: corre no arranque e analisa conversas existentes sem follow-up agendado.
 * Deteta menções de follow-up em mensagens passadas do agente.
 *
 * Limita a 20 leads e adiciona 500ms delay entre detecções para evitar rate limiting da API Claude durante boot.
 */
export async function backfillFollowUpDetection(): Promise<void> {
  const allLeads = await db.select().from(leads);
  const pending = allLeads.filter((l) =>
    !l.followUpAt &&
    l.status !== "closed_won" &&
    l.status !== "closed_lost"
  );

  if (pending.length === 0) return;

  // Ordena por createdAt DESC (mais recentes primeiro) e limita a 20
  const toProcess = pending
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  const skipped = pending.length - toProcess.length;
  console.log(`[FollowUp Backfill] A verificar ${toProcess.length} lead(s) sem follow-up...`);
  if (skipped > 0) {
    console.log(`[FollowUp Backfill] Skipping ${skipped} leads, will retry next boot.`);
  }

  for (const lead of toProcess) {
    try {
      const textSources: string[] = [];

      // 1. Resumo da conversa (fonte mais fiável — já processada pela IA)
      if (lead.conversationSummary) {
        textSources.push(lead.conversationSummary);
      }

      // 2. Últimas mensagens do agente
      const convs = await db.select().from(conversations)
        .where(eq(conversations.leadId, lead.id));
      for (const conv of convs) {
        const msgs = await db.select().from(messages)
          .where(eq(messages.conversationId, conv.id));
        msgs
          .filter((m) => m.role === "assistant")
          .slice(-5)
          .forEach((m) => textSources.push(m.content));
      }

      if (textSources.length === 0) continue;

      const combined = textSources.join("\n\n");
      await detectAndScheduleFollowUp(lead.id, combined);

      // 500ms sequential delay to prevent API rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`[FollowUp Backfill] Erro lead=${lead.id}:`, err);
    }
  }
  console.log("[FollowUp Backfill] Concluído.");
}

/** Devolve leads com follow-up hoje ou em atraso */
export async function getFollowUpsToday() {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayIso = today.toISOString();

  const allLeads = await db.select().from(leads);
  return allLeads.filter((l) => {
    if (!l.followUpAt) return false;
    const d = new Date(l.followUpAt);
    return d <= today && l.status !== "closed_won" && l.status !== "closed_lost";
  }).sort((a, b) => new Date(a.followUpAt!).getTime() - new Date(b.followUpAt!).getTime());
}
