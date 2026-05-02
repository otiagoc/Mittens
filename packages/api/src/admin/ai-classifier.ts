/**
 * Classificador de fase do lead baseado em IA.
 *
 * Após cada troca de mensagens, analisa a conversa com Claude Haiku
 * e determina em que fase do funil o lead se encontra.
 * Se a confiança for suficiente, atualiza o status automaticamente.
 */

import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { leads, activities } from "../db/schema.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type LeadStage =
  | "new"
  | "contacted"
  | "qualified"
  | "visit_scheduled"
  | "proposal"
  | "closed_won"
  | "closed_lost";

export interface ClassificationResult {
  stage: LeadStage;
  confidence: number;
  reasoning: string;
  previousStage: string;
  changed: boolean;
}

const STAGE_DESCRIPTIONS = `
- new: Lead recém-chegado, ainda não houve contacto real ou a conversa foi muito breve
- contacted: Houve contacto/resposta inicial, mas ainda não se percebeu o que procura
- qualified: O lead mostrou interesse claro e partilhou o que procura (zona, tipologia, orçamento, etc.)
- visit_scheduled: Foi marcada ou confirmada uma visita a um imóvel
- proposal: Foi apresentada uma proposta concreta de um imóvel específico
- closed_won: Lead confirmou compra/arrendamento ou assinou contrato
- closed_lost: Lead perdeu interesse, não responde há muito tempo, ou desistiu explicitamente
`;

/**
 * Analisa a conversa e determina a fase atual do lead.
 * Chamado automaticamente após cada resposta do agente.
 */
export async function classifyLeadStage(
  leadId: string,
  conversationHistory: { role: "user" | "assistant"; content: string }[],
  autoUpdate = true
): Promise<ClassificationResult | null> {
  if (conversationHistory.length < 2) return null; // precisa de pelo menos 1 troca

  const [currentLead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!currentLead) return null;

  // Não reclassifica leads já fechados
  if (currentLead.status === "closed_won" || currentLead.status === "closed_lost") return null;

  const conversationText = conversationHistory
    .slice(-10) // últimas 10 msgs para contexto
    .map((m) => `${m.role === "user" ? "Lead" : "Agente"}: ${m.content}`)
    .join("\n\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      system: `És um classificador de funil de vendas imobiliário. Analisa conversas entre um lead e um agente imobiliário e determina em que fase do funil o lead está.

Fases possíveis:
${STAGE_DESCRIPTIONS}

Responde APENAS com JSON válido neste formato (sem mais texto):
{"stage": "...", "confidence": 0.0-1.0, "reasoning": "..."}`,
      messages: [
        {
          role: "user",
          content: `Fase atual do lead: "${currentLead.status}"

Conversa recente:
${conversationText}

Determina a fase correta do lead.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const result = JSON.parse(text.trim()) as {
      stage: LeadStage;
      confidence: number;
      reasoning: string;
    };

    const changed = result.stage !== currentLead.status;

    if (autoUpdate && changed && result.confidence >= 0.75) {
      await db.update(leads)
        .set({ status: result.stage, updatedAt: new Date().toISOString() })
        .where(eq(leads.id, leadId));

      await db.insert(activities).values({
        id: `act_ai_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        leadId,
        type: "status_changed",
        description: `🤖 IA moveu lead: ${currentLead.status} → ${result.stage} (confiança: ${Math.round(result.confidence * 100)}%)`,
        metadata: JSON.stringify({ reasoning: result.reasoning, confidence: result.confidence, source: "ai_classifier" }),
      });

      console.log(`[AI Classifier] Lead ${leadId}: ${currentLead.status} → ${result.stage} (${Math.round(result.confidence * 100)}%)`);
    }

    return { ...result, previousStage: currentLead.status, changed };
  } catch (err) {
    console.error("[AI Classifier] Erro:", err);
    return null;
  }
}
