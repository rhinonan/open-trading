// src/mastra/agent-meta.ts
//
// ## Agent 命名合同（P0-5）
//
// 两套标识，禁止混用或漂移：
//
// 1. **注册键（AgentKey）** —— camelCase，如 `opinionAgent`
//    - `new Mastra({ agents: { opinionAgent } })` 的对象键
//    - `mastra.getAgent("opinionAgent")` / `mastra.listAgents()` 的键
//    - 本文件 `AGENT_META` 的键
//    - skills 挂载 settings 中的 agent key（`resolveAgentSkills`）
//    - HTTP：`/api/chat?agentKey=`、`/api/agents` 返回的 `key`
//
// 2. **Agent id** —— kebab-case，如 `opinion-agent`
//    - `new Agent({ id: "opinion-agent", name: "opinion-agent", ... })`
//    - Mastra / `@mastra/ai-sdk` 的 `agentId`（chat stream 内部）
//    - 不出现在 AGENT_META / skills mount / 业务 getAgent 入参
//
// 新增 agent 时必须：
// - 在 `src/mastra/agents/` 建文件，id/name 用 kebab-case
// - 在 `src/mastra/index.ts` 以 camelCase 键注册
// - 在下方 `AGENT_META` 补同一 camelCase 键
// - 业务路径只经 `getRegisteredAgent(key)` / `mastra.getAgent(key)` 调用
//
import type { LlmFlow } from "@/services/settings-service";

export interface AgentMeta {
  flow: LlmFlow; // 模型选择归属的流程（settings 表维度）
  description: string; // 页面展示用中文描述
}

/** 已注册 agent 的注册键（与 Mastra agents 对象键 / AGENT_META 键一致） */
export const AGENT_KEYS = [
  "opinionAgent",
  "imageOpinionAgent",
  "evaluatorAgent",
  "skillReviewerAgent",
] as const;

export type AgentKey = (typeof AGENT_KEYS)[number];

/**
 * 注册键 → Agent.id（kebab-case）。
 * Observability span 的 entityName 记的是 id，不是注册键。
 */
export const AGENT_ID_BY_KEY: Record<AgentKey, string> = {
  opinionAgent: "opinion-agent",
  imageOpinionAgent: "image-opinion-agent",
  evaluatorAgent: "evaluator-agent",
  skillReviewerAgent: "skill-reviewer-agent",
};

/** Agent.id → 注册键（日志展示用） */
export const AGENT_KEY_BY_ID: Record<string, AgentKey> = Object.fromEntries(
  (Object.entries(AGENT_ID_BY_KEY) as [AgentKey, string][]).map(
    ([key, id]) => [id, key],
  ),
) as Record<string, AgentKey>;

// agent 注册键 → 页面元数据；新增 agent 时在此补一行
export const AGENT_META: Record<AgentKey, AgentMeta> = {
  opinionAgent: { flow: "opinion", description: "抖音博主观点摘要提取" },
  imageOpinionAgent: {
    flow: "imageOpinion",
    description: "抖音博主图集观点提取（vision 模型）",
  },
  evaluatorAgent: {
    flow: "evaluation",
    description: "抖音博主观点准确度评判，对比行情数据判定预测正确性",
  },
  skillReviewerAgent: {
    flow: "skills-review",
    description: "Skill 安装自动审查：安全/执行边界/开源协议",
  },
};
