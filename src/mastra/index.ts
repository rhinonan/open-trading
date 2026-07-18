// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { Observability, MastraStorageExporter } from "@mastra/observability";
import { imageOpinionAgent } from "@/mastra/agents/image-opinion-agent";
import { opinionAgent } from "@/mastra/agents/opinion-agent";
import { evaluatorAgent } from "@/mastra/agents/evaluator-agent";
import { skillReviewerAgent } from "@/mastra/agents/skill-reviewer-agent";
import { transcribeWorkWorkflow } from "@/mastra/workflows/transcribe-work-workflow";
import { evaluateWorkWorkflow } from "@/mastra/workflows/evaluate-work-workflow";
import { skillReviewWorkflow } from "@/mastra/workflows/skill-review-workflow";
import { dataPath } from "@/lib/data-root";

// 绝对路径 + 正斜杠：与业务库 data/douyin.db 分离，
// 避免多进程相对路径解析不一致（Windows 反斜杠在 file: URL 中无效）
const storageUrl =
  "file:" + dataPath("mastra.db").replace(/\\/g, "/");

export const mastra = new Mastra({
  agents: { opinionAgent, imageOpinionAgent, evaluatorAgent, skillReviewerAgent },
  workflows: { transcribeWorkWorkflow, evaluateWorkWorkflow, skillReviewWorkflow },
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: storageUrl,
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "open-trading",
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
});
