// src/services/douyin/processors/eval.ts
// 评判编排：仍复用 Mastra evaluateWorkWorkflow（AI + 写库）；上游仅 load + 进度。
import { db, type Db } from "@/db";
import { works } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mastra } from "@/mastra";
import { markEvalFailed } from "@/services/douyin/eval-queue";
import { setWorkProgress } from "@/services/douyin/pipeline-progress";
import { llmLog, llmLogError, startTimer } from "@/lib/llm-log";

const WORKFLOW_ID = "evaluateWorkWorkflow";

export interface ProcessResult {
  ok: boolean;
  error?: string;
}

export async function processEvalWork(
  workId: number,
  opts?: { dbi?: Db; rethrow?: boolean },
): Promise<ProcessResult> {
  const dbi = opts?.dbi ?? db;
  const timer = startTimer();
  const work = await dbi.select().from(works).where(eq(works.id, workId)).get();
  if (!work) {
    return { ok: false, error: "作品不存在" };
  }

  const now = Math.floor(Date.now() / 1000);
  await dbi
    .update(works)
    .set({ evalStatus: "processing", evalClaimedAt: now })
    .where(eq(works.id, workId));
  await setWorkProgress(workId, "evaluating", 50, { dbi });

  let runId: string | undefined;
  try {
    const run = await mastra.getWorkflow(WORKFLOW_ID).createRun();
    runId = run.runId;
    llmLog("info", {
      event: "workflow.run.start",
      workflowId: WORKFLOW_ID,
      runId,
      workId,
      awemeId: work.awemeId,
    });
    const result = await run.start({
      inputData: {
        workId: work.id,
        awemeId: work.awemeId,
        desc: work.desc,
        transcript: work.transcript,
        opinionSummary: work.opinionSummary,
        publishedAt: work.publishedAt,
        bloggerId: work.bloggerId,
      },
    });
    if (result.status !== "success") {
      throw new Error(
        result.status === "failed"
          ? String(result.error)
          : `status: ${result.status}`,
      );
    }
    llmLog("info", {
      event: "workflow.run.success",
      workflowId: WORKFLOW_ID,
      runId,
      workId,
      awemeId: work.awemeId,
      latencyMs: timer.elapsedMs(),
      status: "success",
    });
    return { ok: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    llmLogError({
      event: "workflow.run.failed",
      workflowId: WORKFLOW_ID,
      runId,
      workId,
      awemeId: work.awemeId,
      latencyMs: timer.elapsedMs(),
      error: err,
    });
    markEvalFailed(workId, errorMsg, dbi);
    if (opts?.rethrow) throw err;
    return { ok: false, error: errorMsg };
  }
}
