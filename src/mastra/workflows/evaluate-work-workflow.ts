// src/mastra/workflows/evaluate-work-workflow.ts
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { db } from "@/db";
import { works, predictionItems, bloggers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRegisteredAgent } from "@/mastra/get-agent";
import { llmLog, llmLogError, startTimer } from "@/lib/llm-log";

const workflowInputSchema = z.object({
  workId: z.number(),
  awemeId: z.string(),
  desc: z.string(),
  transcript: z.string().nullable(),
  opinionSummary: z.string(),
  publishedAt: z.number(),
  bloggerId: z.number(),
});

type WorkflowInput = z.infer<typeof workflowInputSchema>;

/**
 * 评判 evidence 字段合同（P0-3）。
 * 旧库中可能是任意 JSON 对象；展示侧按字符串原样显示，解析失败不炸页。
 * 允许有限 extra 扩展，避免 agent 偶发附加字段导致整次 generate 失败。
 */
export const evidenceSchema = z
  .object({
    /** 标的代码或名称，如 000001 / 上证指数 */
    symbol: z.string().optional().describe("标的代码或名称"),
    /** 观察区间起点 YYYY-MM-DD */
    rangeStart: z.string().optional().describe("观察区间起点 YYYY-MM-DD"),
    /** 观察区间终点 YYYY-MM-DD */
    rangeEnd: z.string().optional().describe("观察区间终点 YYYY-MM-DD"),
    /** 关键价/点位（发布日附近） */
    openPrice: z.number().optional().describe("关键价/点位"),
    /** 收盘价/点位（验证日） */
    closePrice: z.number().optional().describe("收盘价/点位"),
    /** 区间涨跌幅（百分比数值，如 2.5 表示 +2.5%） */
    changePercent: z.number().optional().describe("区间涨跌幅百分比"),
    /** 数据源标识，如 tencent / mootdx / eastmoney */
    source: z.string().optional().describe("数据源"),
    /** 取数时间 ISO 或可读字符串 */
    fetchedAt: z.string().optional().describe("取数时间"),
    /** 补充说明 */
    notes: z.string().optional().describe("补充说明"),
  })
  .catchall(z.unknown())
  .describe("支撑判定的行情数据快照");

// 预测条目输出 schema
const predictionsSchema = z.object({
  predictions: z.array(
    z.object({
      content: z.string().describe("预测内容表述"),
      target: z.string().describe("预测标的：大盘/板块/个股等"),
      symbols: z.array(z.string()).describe("涉及股票代码或指数名"),
      judgment: z
        .enum([
          "correct",
          "mostly_correct",
          "incorrect",
          "not_yet",
          "not_applicable",
        ])
        .describe("判定结果"),
      verifiableAfter: z
        .string()
        .optional()
        .describe("YYYY-MM-DD，not_yet 时必填"),
      reasoning: z.string().describe("判定理由"),
      evidence: evidenceSchema,
    }),
  ),
});

// Step 1: prepare — 读取博主昵称，返回扩展后的输入
const prepareStep = createStep({
  id: "eval-prepare",
  inputSchema: workflowInputSchema,
  outputSchema: workflowInputSchema.extend({ bloggerNickname: z.string() }),
  execute: async ({ inputData }) => {
    const { workId, awemeId } = inputData;
    llmLog("info", {
      event: "workflow.step.start",
      workflowId: "evaluate-work",
      stepId: "eval-prepare",
      workId,
      awemeId,
    });

    const blogger = db
      .select({ nickname: bloggers.nickname })
      .from(bloggers)
      .where(eq(bloggers.id, inputData.bloggerId))
      .get();

    return {
      ...inputData,
      bloggerNickname: blogger?.nickname ?? "未知",
    };
  },
});

// Step 2: agentic_judge — evaluator agent 结构化输出
const judgeStep = createStep({
  id: "eval-judge",
  inputSchema: workflowInputSchema.extend({ bloggerNickname: z.string() }),
  outputSchema: predictionsSchema,
  retries: 2,
  execute: async ({ inputData }) => {
    const {
      workId,
      awemeId,
      desc,
      transcript,
      opinionSummary,
      publishedAt,
      bloggerNickname,
    } = inputData;

    const prompt = buildJudgePrompt({
      workId,
      awemeId,
      desc,
      transcript,
      opinionSummary,
      publishedAt,
      bloggerNickname,
    });

    const timer = startTimer();
    llmLog("info", {
      event: "agent.generate.start",
      agentKey: "evaluatorAgent",
      workflowId: "evaluate-work",
      stepId: "eval-judge",
      workId,
      awemeId,
    });

    const agent = await getRegisteredAgent("evaluatorAgent");
    const result = await agent.generate(prompt, {
      // newapi 上部分模型不支持原生 response_format，改用 prompt 注入强制 JSON。
      structuredOutput: {
        schema: predictionsSchema,
        jsonPromptInjection: true,
      },
      maxSteps: 15,
      modelSettings: { temperature: 0.3 },
    });

    if (!result.object) {
      llmLogError({
        event: "agent.generate.failed",
        agentKey: "evaluatorAgent",
        workflowId: "evaluate-work",
        stepId: "eval-judge",
        workId,
        awemeId,
        latencyMs: timer.elapsedMs(),
        error: "Agent 未返回有效的结构化输出",
      });
      throw new Error("Agent 未返回有效的结构化输出");
    }

    llmLog("info", {
      event: "agent.generate.success",
      agentKey: "evaluatorAgent",
      workflowId: "evaluate-work",
      stepId: "eval-judge",
      workId,
      awemeId,
      latencyMs: timer.elapsedMs(),
      status: "success",
    });

    return result.object as z.infer<typeof predictionsSchema>;
  },
});

// Step 3: persist — 写入 DB（事务）
const persistStep = createStep({
  id: "eval-persist",
  inputSchema: predictionsSchema,
  outputSchema: z.object({ persisted: z.number() }),
  execute: async ({ inputData, getInitData }) => {
    const { workId, awemeId } = getInitData<WorkflowInput>();
    const { predictions } = inputData;
    const now = Math.floor(Date.now() / 1000);

    const count = db.transaction((tx) => {
      // 删旧条目（重评场景）
      tx.delete(predictionItems)
        .where(eq(predictionItems.workId, workId))
        .run();
      // 插新条目
      for (const p of predictions) {
        tx.insert(predictionItems)
          .values({
            workId,
            predictedContent: p.content,
            predictionTarget: p.target,
            relatedSymbols: JSON.stringify(p.symbols),
            judgment: p.judgment,
            verifiableAfter: p.verifiableAfter?.trim() || null,
            reasoning: p.reasoning,
            evidence: JSON.stringify(p.evidence),
            judgedAt: now,
          })
          .run();
      }
      // 更新 works
      tx.update(works)
        .set({ evalStatus: "done", evaluatedAt: now })
        .where(eq(works.id, workId))
        .run();

      return predictions.length;
    });

    llmLog("info", {
      event: "workflow.step.success",
      workflowId: "evaluate-work",
      stepId: "eval-persist",
      workId,
      awemeId,
      status: "success",
      persisted: count,
    });

    return { persisted: count };
  },
});

// prompt 构建
function buildJudgePrompt(input: {
  workId: number;
  awemeId: string;
  desc: string;
  transcript: string | null;
  opinionSummary: string;
  publishedAt: number;
  bloggerNickname: string;
}): string {
  const { desc, transcript, opinionSummary, publishedAt, bloggerNickname } =
    input;
  const pubDate = new Date(publishedAt * 1000).toISOString().slice(0, 10);

  return [
    `## 作品信息`,
    `- 博主: ${bloggerNickname}`,
    `- 发布日期: ${pubDate} (unix: ${publishedAt})`,
    `- 标题: ${desc || "(无)"}`,
    ``,
    `## 观点摘要`,
    opinionSummary || "(无)",
    ``,
    `## 完整转写`,
    (transcript || "").slice(0, 8000),
    ``,
    `请根据以上转写文本，提取所有可验证的行情预测并判定正确性。`,
    `发布日期 ${pubDate} 是时间锚点——取数时以该日期为基准。`,
    `evidence 请尽量填写 symbol、区间、开收价/涨跌、source、fetchedAt。`,
  ].join("\n");
}

// compose workflow
export const evaluateWorkWorkflow = createWorkflow({
  id: "evaluate-work",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({ persisted: z.number() }),
})
  .then(prepareStep)
  .then(judgeStep)
  .then(persistStep)
  .commit();
