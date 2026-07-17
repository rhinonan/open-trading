import { mastra } from "@/mastra";
import { handleChatStream } from "@mastra/ai-sdk";
import { createUIMessageStreamResponse } from "ai";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentKey = searchParams.get("agentKey");

    if (!agentKey) {
      return Response.json(
        { error: "agentKey 不能为空" },
        { status: 400 }
      );
    }

    // Resolve agent by its JS key (same key used by /api/agents)
    const agents = mastra.listAgents();
    const agent = agents[agentKey as keyof typeof agents];

    if (!agent) {
      return Response.json(
        { error: `未注册的 agent: ${agentKey}` },
        { status: 404 }
      );
    }

    const params = await request.json();

    const stream = await handleChatStream({
      mastra,
      agentId: agent.id,
      params,
      version: "v6",
    });

    return createUIMessageStreamResponse({ stream });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
