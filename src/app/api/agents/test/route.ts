// src/app/api/agents/test/route.ts
import { jsonError } from "@/lib/api-error";
import { mastra } from "@/mastra";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const body: { agentKey?: unknown; input?: unknown } = await request.json();

    if (typeof body.agentKey !== "string" || !body.agentKey.trim()) {
      return Response.json(
        { error: "agentKey 必须是非空字符串" },
        { status: 400 }
      );
    }
    if (typeof body.input !== "string" || !body.input.trim()) {
      return Response.json(
        { error: "input 必须是非空字符串" },
        { status: 400 }
      );
    }

    const agents = mastra.listAgents();
    const agent = agents[body.agentKey as keyof typeof agents];
    if (!agent) {
      return Response.json(
        { error: `未注册的 agent: ${body.agentKey}` },
        { status: 404 }
      );
    }

    const result = await agent.generate(
      body.input.slice(0, 4000), // 限制输入长度
      { modelSettings: { maxOutputTokens: 500, temperature: 0.3 } }
    );

    return Response.json({ text: result.text });
  } catch (err) {
    return jsonError(err, { request: request, status: 500, fallback: "Internal error" });
  }
}
