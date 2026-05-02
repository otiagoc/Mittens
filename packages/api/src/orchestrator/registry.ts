import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { agents } from "../db/schema.js";
import { ClaudeAPIAdapter } from "../agents/claude-api.js";
import { ManagedAgentAdapter } from "../agents/managed-agent.js";
import { OPENSQUAD_SYSTEM_PROMPT } from "../agents/configs/opensquad.js";
import { BRAIN_SYSTEM_PROMPT } from "../agents/configs/brain.js";
import type { AgentAdapter } from "../agents/types.js";

// System prompts locais (fallback quando a DB não tem systemPrompt)
const LOCAL_SYSTEM_PROMPTS: Record<string, string> = {
  opensquad: OPENSQUAD_SYSTEM_PROMPT,
  brain: BRAIN_SYSTEM_PROMPT,
};

/**
 * Registo de agentes — carrega os agentes ativos da DB e instancia os adaptadores.
 * Cache em memória renovada a cada 5 minutos.
 */
export class AgentRegistry {
  private adapters = new Map<string, AgentAdapter>();
  private lastRefresh = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

  async getAll(): Promise<AgentAdapter[]> {
    await this.refreshIfStale();
    return Array.from(this.adapters.values());
  }

  async getById(id: string): Promise<AgentAdapter | undefined> {
    await this.refreshIfStale();
    return this.adapters.get(id);
  }

  /** Força refresh imediato (útil após alterações via admin) */
  invalidate() {
    this.lastRefresh = 0;
  }

  private async refreshIfStale() {
    const now = Date.now();
    if (now - this.lastRefresh < this.CACHE_TTL_MS) return;

    const enabledAgents = await db
      .select()
      .from(agents)
      .where(eq(agents.enabled, true));

    this.adapters.clear();

    for (const agent of enabledAgents) {
      let adapter: AgentAdapter | null = null;

      if (agent.type === "managed_agent" && agent.managedAgentId) {
        adapter = new ManagedAgentAdapter(
          agent.id,
          agent.name,
          agent.emoji,
          agent.managedAgentId
        );
      } else if (agent.type === "claude_api") {
        // Usa o system prompt da DB ou o local como fallback
        const systemPrompt =
          agent.systemPrompt ?? LOCAL_SYSTEM_PROMPTS[agent.id] ?? "";
        adapter = new ClaudeAPIAdapter(
          agent.id,
          agent.name,
          agent.emoji,
          systemPrompt
        );
      }

      if (adapter) {
        this.adapters.set(agent.id, adapter);
      }
    }

    this.lastRefresh = now;
    console.log(`[Registry] ${this.adapters.size} agentes carregados`);
  }
}

// Singleton partilhado por toda a app
export const registry = new AgentRegistry();
