// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { opinionAgent } from "@/mastra/agents/opinion-agent";
import { evaluatorAgent } from "@/mastra/agents/evaluator-agent";
import { skillReviewerAgent } from "@/mastra/agents/skill-reviewer-agent";
import { transcribeWorkWorkflow } from "@/mastra/workflows/transcribe-work-workflow";
import { evaluateWorkWorkflow } from "@/mastra/workflows/evaluate-work-workflow";
import { dataPath } from "@/lib/data-root";

// 绝对路径 + 正斜杠：与业务库 data/douyin.db 分离，
// 避免多进程相对路径解析不一致（Windows 反斜杠在 file: URL 中无效）
const storageUrl =
  "file:" + dataPath("mastra.db").replace(/\\/g, "/");

export const mastra = new Mastra({
  agents: { opinionAgent, evaluatorAgent, skillReviewerAgent },
  workflows: { transcribeWorkWorkflow, evaluateWorkWorkflow },
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: storageUrl,
  }),
});
