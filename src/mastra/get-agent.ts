// src/mastra/get-agent.ts
// 统一业务侧 agent 获取入口：经 mastra 实例，便于 tracing / 中间件 / 未来 gateway。
// 动态 import 打断 index ↔ workflow 循环依赖（workflow 在 execute 时才加载 mastra）。
import type { Agent } from "@mastra/core/agent";
import type { AgentKey } from "@/mastra/agent-meta";
import { AGENT_KEYS } from "@/mastra/agent-meta";

export function isAgentKey(value: string): value is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(value);
}

/**
 * 按注册键取已注册 Agent。业务 / workflow 步骤内请用此函数或
 * `mastra.getAgent`，禁止 `import { xxxAgent } from agents` 后直接 `.generate`
 *（仅 `index.ts` 注册与测试 fixture 可 import 单例）。
 */
export async function getRegisteredAgent(key: AgentKey): Promise<Agent> {
  const { mastra } = await import("@/mastra");
  return mastra.getAgent(key);
}
