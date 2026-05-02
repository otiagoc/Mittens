export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentResponse {
  text: string;
  agentId: string;
  agentName: string;
}

/**
 * Interface comum para todos os adaptadores de agentes.
 * Qualquer novo agente implementa esta interface e é automaticamente
 * suportado pelo router e pelo bot Telegram.
 */
export interface AgentAdapter {
  id: string;
  name: string;
  emoji: string;

  /**
   * Envia uma mensagem para o agente e recebe a resposta.
   * @param message     - A mensagem do utilizador
   * @param history     - Histórico da conversa (para ClaudeAPIAdapter)
   * @param conversationId - ID da conversa (para gerir sessões Managed Agent)
   */
  sendMessage(
    message: string,
    history: AgentMessage[],
    conversationId: string
  ): Promise<AgentResponse>;

  /** Verifica se o agente está disponível */
  isAvailable(): Promise<boolean>;
}
