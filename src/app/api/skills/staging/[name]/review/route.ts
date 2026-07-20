// src/app/api/skills/staging/[name]/review/route.ts
import { NextRequest } from "next/server";
import { mastra } from "@/mastra";
import { requireAdmin } from "@/lib/admin-auth";
import { llmLog, llmLogError, startTimer } from "@/lib/llm-log";
import { jsonError } from "@/lib/api-error";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> },
) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { name: batchId } = await ctx.params;
    const timer = startTimer();
    const run = await mastra.getWorkflow("skillReviewWorkflow").createRun();
    llmLog("info", {
      event: "workflow.run.start",
      workflowId: "skillReviewWorkflow",
      runId: run.runId,
      batchId,
    });
    const result = await run.start({ inputData: { batchId } });
    if (result.status !== "success") {
      llmLogError({
        event: "workflow.run.failed",
        workflowId: "skillReviewWorkflow",
        runId: run.runId,
        batchId,
        latencyMs: timer.elapsedMs(),
        error: result.status === "failed" ? result.error : result.status,
      });
    } else {
      llmLog("info", {
        event: "workflow.run.success",
        workflowId: "skillReviewWorkflow",
        runId: run.runId,
        batchId,
        latencyMs: timer.elapsedMs(),
        status: "success",
      });
    }
    return Response.json({ success: true, ...result });
  } catch (err) {
    llmLogError({
      event: "workflow.run.failed",
      workflowId: "skillReviewWorkflow",
      error: err,
    });
    return jsonError(err, { request: req, status: 500, body: "success-false", fallback: "审查失败", log: false });
  }
}
