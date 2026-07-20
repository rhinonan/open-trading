// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";
import {
  Observability,
  MastraStorageExporter,
  SensitiveDataFilter,
} from "@mastra/observability";
import { imageOpinionAgent } from "@/mastra/agents/image-opinion-agent";
import { opinionAgent } from "@/mastra/agents/opinion-agent";
import { evaluatorAgent } from "@/mastra/agents/evaluator-agent";
import { skillReviewerAgent } from "@/mastra/agents/skill-reviewer-agent";
import { transcribeWorkWorkflow } from "@/mastra/workflows/transcribe-work-workflow";
import { evaluateWorkWorkflow } from "@/mastra/workflows/evaluate-work-workflow";
import { skillReviewWorkflow } from "@/mastra/workflows/skill-review-workflow";
import { analyzeImageWorkflow } from "@/mastra/workflows/analyze-image-workflow";
import { dataPath, ensureDataRoot } from "@/lib/data-root";

// 绝对路径 + 正斜杠：与业务库 data/douyin.db 分离，
// 避免多进程相对路径解析不一致（Windows 反斜杠在 file: URL 中无效）
ensureDataRoot();
const storageUrl =
  "file:" + dataPath("mastra.db").replace(/\\/g, "/");

export const mastra = new Mastra({
  agents: { opinionAgent, imageOpinionAgent, evaluatorAgent, skillReviewerAgent },
  workflows: { transcribeWorkWorkflow, evaluateWorkWorkflow, skillReviewWorkflow, analyzeImageWorkflow },
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: storageUrl,
  }),
  // 框架日志：workflow step / tool 内 mastra.getLogger() 走这里；
  // 配置了 observability 时会自动挂 trace/span 关联。
  logger: new PinoLogger({
    name: "open-trading",
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
  }),
  observability: new Observability({
    // 注册表级默认会再补一层 SensitiveDataFilter；configs 内显式写出，避免误关。
    sensitiveDataFilter: true,
    configs: {
      default: {
        serviceName: "open-trading",
        exporters: [new MastraStorageExporter()],
        // 脱敏 span 里的 key/token/password 等字段（apiKey、authorization…）
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
