/**
 * Seed: cria os agentes iniciais na base de dados.
 * Executar apenas uma vez na instalação: npx tsx src/db/seed.ts
 */
import { db } from "./client.js";
import { agents } from "./schema.js";

const initialAgents = [
  {
    id: "dnd",
    name: "D&D Group",
    emoji: "🏠",
    description:
      "Assistente imobiliário do D&D Group (RE/MAX). Responde a perguntas sobre imóveis em Portugal, pesquisa propriedades, agenda visitas e reativa leads. Especialista em imóveis de luxo, investimento e expatriados.",
    keywords: JSON.stringify([
      "imóvel", "apartamento", "moradia", "casa", "comprar", "vender", "arrendar",
      "investimento", "lisboa", "cascais", "remax", "visita", "avaliação",
      "imobiliário", "propriedade", "luxo", "expatriados", "lead",
    ]),
    type: "managed_agent" as const,
    managedAgentId: "agent_011CZtoQYyM8Bc9C7E45RTHC",
    enabled: true,
  },
  {
    id: "brain",
    name: "Brain Wiki",
    emoji: "🧠",
    description:
      "Wiki de conhecimento pessoal sobre imobiliário português, inteligência artificial aplicada, automação com n8n, otimização comercial, processos administrativos (CPCV, escrituras, licenciamento), marketing digital e desenvolvimento pessoal.",
    keywords: JSON.stringify([
      "wiki", "conhecimento", "explicar", "o que é", "como funciona", "rag",
      "n8n", "automação", "agente", "ia", "ghl", "crm", "cpcv", "escritura",
      "caderneta", "certificação energética", "meta ads", "copywriting",
      "segundo cérebro", "nota", "conceito", "guia",
    ]),
    type: "claude_api" as const,
    enabled: true,
  },
  {
    id: "opensquad",
    name: "Opensquad Arquiteto",
    emoji: "🤖",
    description:
      "Especialista em design de equipas multi-agente e pipelines de automação. Ajuda a criar squads de agentes IA, definir fluxos de trabalho automáticos, estratégia de automação, e arquitetura de sistemas de agentes. Modo consultivo.",
    keywords: JSON.stringify([
      "squad", "agente", "pipeline", "automação", "arquitetura", "multi-agente",
      "criar squad", "fluxo", "workflow", "opensquad", "sherlock",
      "instagram", "conteúdo", "publicar", "redes sociais", "estratégia",
    ]),
    type: "claude_api" as const,
    enabled: true,
  },
];

async function seed() {
  console.log("🌱 A inicializar base de dados...");

  for (const agent of initialAgents) {
    await db
      .insert(agents)
      .values(agent)
      .onConflictDoNothing();
    console.log(`  ✅ Agente '${agent.name}' inserido`);
  }

  console.log("\n✨ Base de dados pronta!");
}

seed().catch(console.error);
