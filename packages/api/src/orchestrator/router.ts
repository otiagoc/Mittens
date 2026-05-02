import Anthropic from "@anthropic-ai/sdk";
import { registry } from "./registry.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface RouterResult {
  agentId: string;
  confidence: number;
  reasoning: string;
}

/**
 * Classifica a mensagem e decide qual agente deve responder.
 * Usa Claude Haiku para manter o custo baixo.
 */
export async function routeMessage(
  message: string,
  currentAgentId?: string
): Promise<RouterResult> {
  const allAgents = await registry.getAll();

  if (allAgents.length === 0) {
    return { agentId: "unknown", confidence: 0, reasoning: "Sem agentes disponíveis" };
  }

  // Se só há um agente, vai sempre para ele
  if (allAgents.length === 1) {
    return { agentId: allAgents[0].id, confidence: 1, reasoning: "Único agente disponível" };
  }

  const agentDescriptions = allAgents
    .map((a) => `- ID: "${a.id}" | Nome: "${a.name}" | Descrição: "${(a as any).description ?? ""}"`)
    .join("\n");

  const contextHint = currentAgentId
    ? `\n\nContexto: o utilizador estava a falar com o agente "${currentAgentId}". Se a mensagem for um follow-up natural, mantém esse agente (confiança alta). Só muda se houver mudança clara de tópico.`
    : "";

  const systemPrompt = `És um classificador de intenções. A tua única tarefa é decidir qual agente deve responder a uma mensagem.

Agentes disponíveis:
${agentDescriptions}
${contextHint}

IMPORTANTE:
- Responde APENAS em JSON válido, sem texto adicional
- Formato obrigatório: {"agent": "id_do_agente", "confidence": 0.0, "reasoning": "razão breve"}
- Se nenhum agente for adequado: {"agent": "unknown", "confidence": 0, "reasoning": "razão"}
- confidence deve ser entre 0.0 e 1.0`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 150,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
    });

    const raw =
      response.content[0].type === "text" ? response.content[0].text.trim() : "";

    // Extrai JSON mesmo que haja texto extra
    const jsonMatch = raw.match(/\{[^}]+\}/);
    if (!jsonMatch) throw new Error("JSON não encontrado na resposta do router");

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      agentId: parsed.agent ?? "unknown",
      confidence: parsed.confidence ?? 0,
      reasoning: parsed.reasoning ?? "",
    };
  } catch (err) {
    console.error("[Router] Erro na classificação:", err);
    // Fallback: vai para o primeiro agente disponível
    return {
      agentId: allAgents[0].id,
      confidence: 0.3,
      reasoning: "Fallback: erro no router",
    };
  }
}
