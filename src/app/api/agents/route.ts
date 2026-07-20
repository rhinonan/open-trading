// src/app/api/agents/route.ts
import { jsonError } from "@/lib/api-error";
import { mastra } from "@/mastra";
import { AGENT_META, type AgentKey } from "@/mastra/agent-meta";
import { isAgentKey } from "@/mastra/get-agent";
import { getLlmModel } from "@/services/settings-service";

export async function GET() {
  try {
    const agents = mastra.listAgents();
    const list = await Promise.all(
      Object.entries(agents).map(async ([key, agent]) => {
        const meta = isAgentKey(key) ? AGENT_META[key as AgentKey] : undefined;
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
    return jsonError(err, { status: 500, fallback: "Internal error" });
  }
}
