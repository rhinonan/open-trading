// src/app/api/agents/route.ts
import { mastra } from "@/mastra";
import { AGENT_META } from "@/mastra/agent-meta";
import { getLlmModel } from "@/services/settings-service";

export async function GET() {
  try {
    const agents = mastra.listAgents();
    const list = await Promise.all(
      Object.entries(agents).map(async ([key, agent]) => {
        const meta = AGENT_META[key];
        const instructions = await agent.getInstructions();
        return {
          key,
          name: agent.name,
          description: meta?.description ?? "",
          flow: meta?.flow ?? "",
          model: meta ? await getLlmModel(meta.flow) : "",
          instructions:
            typeof instructions === "string"
              ? instructions
              : JSON.stringify(instructions),
        };
      })
    );
    return Response.json({ agents: list });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
