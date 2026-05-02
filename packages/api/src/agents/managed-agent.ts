import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { conversations } from "../db/schema.js";
import type { AgentAdapter, AgentMessage, AgentResponse } from "./types.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Adaptador para agentes hospedados no Anthropic Managed Agents.
 *
 * Fluxo correcto:
 * 1. Por conversa, cria uma Sessão que referencia o Agent ID
 * 2. Envia mensagens via sessions.events.send()
 * 3. Recebe respostas via sessions.events.stream() (SSE)
 *
 * Desta forma, todas as ferramentas configuradas no agente ficam activas:
 * - web_fetch (base de dados de imóveis CSV)
 * - Calendly (agendamento de visitas)
 * - web search (pesquisa de mercado)
 */
export class ManagedAgentAdapter implements AgentAdapter {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly emoji: string,
    private readonly agentId: string
  ) {}

  async sendMessage(
    message: string,
    _history: AgentMessage[], // Managed Agents gere o histórico internamente
    conversationId: string
  ): Promise<AgentResponse> {
    const envId = process.env.ANTHROPIC_ENV_ID;
    if (!envId) {
      throw new Error(
        "ANTHROPIC_ENV_ID não definido. Corre 'npx tsx src/db/setup-env.ts' primeiro."
      );
    }

    // Obtém ou cria sessão para esta conversa
    const sessionId = await this.getOrCreateSession(conversationId, envId);

    // Abre o stream ANTES de enviar a mensagem (para não perder eventos iniciais)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamPromise = (anthropic.beta as any).sessions.events.stream(sessionId);

    // Envia a mensagem do utilizador
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (anthropic.beta as any).sessions.events.send(sessionId, {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: message }],
        },
      ],
    });

    // Recolhe a resposta via streaming
    const stream = await streamPromise;
    let responseText = "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const event of stream as any) {
      if (event.type === "agent.message") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const block of event.content as any[]) {
          if (block.type === "text") {
            responseText += block.text;
          }
        }
      }

      // Terminar o loop quando o agente terminar
      if (event.type === "session.status_terminated") break;
      if (
        event.type === "session.status_idle" &&
        event.stop_reason?.type !== "requires_action"
      ) {
        break;
      }
    }

    if (!responseText) {
      responseText = "Não obtive resposta do agente. Tenta novamente.";
    }

    return { text: responseText, agentId: this.id, agentName: this.name };
  }

  async isAvailable(): Promise<boolean> {
    return (
      !!process.env.ANTHROPIC_API_KEY &&
      !!process.env.ANTHROPIC_ENV_ID &&
      !!this.agentId
    );
  }

  /**
   * Obtém a sessão existente para esta conversa, ou cria uma nova.
   * A sessão é guardada na base de dados para reutilização.
   */
  private async getOrCreateSession(
    conversationId: string,
    envId: string
  ): Promise<string> {
    // Verifica se já existe sessão guardada
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (conv?.managedAgentSessionId) {
      // Valida se a sessão ainda está activa
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const session = await (anthropic.beta as any).sessions.retrieve(
          conv.managedAgentSessionId
        );
        if (session.status !== "terminated") {
          return conv.managedAgentSessionId;
        }
        console.log(`[ManagedAgent] Sessão ${conv.managedAgentSessionId} terminada — criando nova`);
      } catch {
        console.log(`[ManagedAgent] Sessão inválida — criando nova`);
      }
    }

    // Cria nova sessão
    console.log(`[ManagedAgent] Criando nova sessão para agente ${this.agentId}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await (anthropic.beta as any).sessions.create({
      agent: this.agentId,
      environment_id: envId,
      title: `Mittens — ${this.name} — ${new Date().toISOString()}`,
    });

    // Guarda o session_id na conversa
    await db
      .update(conversations)
      .set({
        managedAgentSessionId: session.id,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(conversations.id, conversationId));

    console.log(`[ManagedAgent] Nova sessão criada: ${session.id}`);
    return session.id;
  }
}
