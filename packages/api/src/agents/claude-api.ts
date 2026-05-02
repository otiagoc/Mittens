import Anthropic from "@anthropic-ai/sdk";
import type { AgentAdapter, AgentMessage, AgentResponse } from "./types.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Adaptador para agentes que correm diretamente na API Claude.
 * Usa o system prompt configurado na base de dados.
 */
export class ClaudeAPIAdapter implements AgentAdapter {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly emoji: string,
    private readonly systemPrompt: string,
    private readonly model: string = "claude-sonnet-4-5"
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendMessage(message: string, history: AgentMessage[], _conversationId: string): Promise<AgentResponse> {
    // Mantém apenas as últimas 20 mensagens para não exceder o context window
    const recentHistory = history.slice(-20);

    const response = await anthropic.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: this.systemPrompt,
      messages: [
        ...recentHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user", content: message },
      ],
    });

    const text =
      response.content[0].type === "text"
        ? response.content[0].text
        : "Não foi possível gerar uma resposta.";

    return { text, agentId: this.id, agentName: this.name };
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY;
  }
}
