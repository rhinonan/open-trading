// src/mastra/workflows/skill-review-workflow.ts
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { getRegisteredAgent } from "@/mastra/get-agent";
import {
  getStagingFiles,
  writeReviewResult,
  type SkillReviewResult,
} from "@/services/skills-service";
import { llmLog, llmLogError, startTimer } from "@/lib/llm-log";

const workflowInputSchema = z.object({
  batchId: z.string().describe("staging 中的批次 ID"),
});

type WorkflowInput = z.infer<typeof workflowInputSchema>;

const reviewOutputSchema = z.object({
  verdict: z.enum(["pass", "reject"]).describe("审查结论"),
  summary: z.string().describe("审查总结（中文，一句话）"),
  issues: z
    .array(
      z.object({
        dimension: z
          .enum(["security", "execution_scope", "license"])
          .describe("审查维度"),
        severity: z
          .enum(["error", "warning"])
          .describe("严重程度：error 为必须修复，warning 为建议"),
        file: z
          .string()
          .nullable()
          .describe("出问题的文件路径，全仓库问题为 null"),
        description: z.string().describe("问题描述（中文）"),
      }),
    )
    .describe("发现的问题列表，无问题则为空数组"),
});

// Step 1: prepare — 读文件，拼审查 prompt
const prepareStep = createStep({
  id: "review-prepare",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    batchId: z.string(),
    prompt: z.string(),
    fileCount: z.number(),
    totalChars: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { batchId } = inputData;
    const files = getStagingFiles(batchId);

    const parts: string[] = [`## 待审查批次: ${batchId}`, ""];

    let totalChars = 0;
    for (const f of files) {
      if (f.content === null) {
        parts.push(`### ${f.path}\n\`[binary, skipped]\`\n`);
      } else {
        // 截断超大文件（单文件上限 8000 字符）
        const truncated =
          f.content.length > 8000
            ? f.content.slice(0, 8000) +
              `\n... [截断，原文件 ${f.content.length} 字符]`
            : f.content;
        parts.push(`### ${f.path}\n\`\`\`\n${truncated}\n\`\`\`\n`);
        totalChars += f.content.length;
      }
    }

    const prompt = parts.join("\n");
    llmLog("info", {
      event: "workflow.step.start",
      workflowId: "skill-review",
      stepId: "review-prepare",
      batchId,
      fileCount: files.length,
      totalChars,
    });
    return { batchId, prompt, fileCount: files.length, totalChars };
  },
});

// Step 2: review — 调 agent（经 mastra 实例）
const reviewStep = createStep({
  id: "review-agent",
  inputSchema: z.object({
    batchId: z.string(),
    prompt: z.string(),
    fileCount: z.number(),
    totalChars: z.number(),
  }),
  outputSchema: reviewOutputSchema,
  retries: 1,
  execute: async ({ inputData }) => {
    const { batchId, prompt } = inputData;
    const timer = startTimer();
    llmLog("info", {
      event: "agent.generate.start",
      agentKey: "skillReviewerAgent",
      workflowId: "skill-review",
      stepId: "review-agent",
      batchId,
      fileCount: inputData.fileCount,
      totalChars: inputData.totalChars,
    });

    const fullPrompt = `${prompt}\n\n请对以上批次 "${batchId}" 中的所有 Skill 进行安全审查，严格按照 JSON schema 输出审查结果。`;

    const agent = await getRegisteredAgent("skillReviewerAgent");
    // newapi 上 deepseek 等模型不支持 response_format: json_schema。
    // @mastra/core@1.51 的 jsonPromptInjection 仅 boolean|'system'|'inline'（无 'auto'），
    // 必须 prompt 注入，否则会报 "This response_format type is unavailable now"。
    const result = await agent.generate(fullPrompt, {
      structuredOutput: {
        schema: reviewOutputSchema,
        jsonPromptInjection: true,
      },
      maxSteps: 10,
      modelSettings: { temperature: 0.1 },
    });

    if (!result.object) {
      llmLogError({
        event: "agent.generate.failed",
        agentKey: "skillReviewerAgent",
        workflowId: "skill-review",
        stepId: "review-agent",
        batchId,
        latencyMs: timer.elapsedMs(),
        error: "Agent 未返回有效的审查结果",
      });
      throw new Error("Agent 未返回有效的审查结果");
    }

    llmLog("info", {
      event: "agent.generate.success",
      agentKey: "skillReviewerAgent",
      workflowId: "skill-review",
      stepId: "review-agent",
      batchId,
      latencyMs: timer.elapsedMs(),
      status: "success",
    });

    return result.object as z.infer<typeof reviewOutputSchema>;
  },
});

// Step 3: persist — 写 .batch.json
const persistStep = createStep({
  id: "review-persist",
  inputSchema: reviewOutputSchema,
  outputSchema: z.object({
    status: z.enum(["passed", "rejected"]),
    batchId: z.string(),
    summary: z.string(),
  }),
  execute: async ({ inputData, getInitData }) => {
    const { batchId } = getInitData<WorkflowInput>();
    const { verdict, summary, issues } = inputData;

    const result: SkillReviewResult = {
      status: verdict === "pass" ? "passed" : "rejected",
      reviewedAt: new Date().toISOString(),
      verdict,
      summary,
      issues: issues.map((i) => ({
        dimension: i.dimension,
        severity: i.severity,
        file: i.file,
        description: i.description,
      })),
    };

    writeReviewResult(batchId, result);
    const status = verdict === "pass" ? ("passed" as const) : ("rejected" as const);
    llmLog("info", {
      event: "workflow.step.success",
      workflowId: "skill-review",
      stepId: "review-persist",
      batchId,
      status,
      summary,
    });
    return { status, batchId, summary };
  },
});

export const skillReviewWorkflow = createWorkflow({
  id: "skill-review",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    status: z.enum(["passed", "rejected"]),
    batchId: z.string(),
    summary: z.string(),
  }),
})
  .then(prepareStep)
  .then(reviewStep)
  .then(persistStep)
  .commit();
