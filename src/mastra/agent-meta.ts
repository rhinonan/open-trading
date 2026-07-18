// src/mastra/agent-meta.ts
import type { LlmFlow } from "@/services/settings-service";

export interface AgentMeta {
  flow: LlmFlow; // 模型选择归属的流程（settings 表维度）
  description: string; // 页面展示用中文描述
}

// agent 注册键 → 页面元数据；新增 agent 时在此补一行
export const AGENT_META: Record<string, AgentMeta> = {
  opinionAgent: { flow: "opinion", description: "抖音博主观点摘要提取" },
  evaluatorAgent: { flow: "evaluation", description: "抖音博主观点准确度评判，对比行情数据判定预测正确性" },
};
