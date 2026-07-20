// src/app/api/skills/route.ts
import { NextRequest } from "next/server";
import * as skillService from "@/services/skills-service";
import { mastra } from "@/mastra";
import { requireAdmin } from "@/lib/admin-auth";
import { llmLog, llmLogError, startTimer } from "@/lib/llm-log";
import { jsonError } from "@/lib/api-error";

export async function GET() {
  try {
    const skills = skillService.listSkills();
    return Response.json({ success: true, skills });
  } catch (err) {
    return jsonError(err, { status: 500, body: "success-false", fallback: "获取列表失败" });
  }
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { url, force } = await req.json();
    if (!url || typeof url !== "string" || !url.trim()) {
      return Response.json({ success: false, error: "请提供 GitHub 仓库 URL" }, { status: 400 });
    }

    // 1. 下载到 staging
    const batch = await skillService.installToStaging(url.trim(), {
      force: force === true,
    });

    // 2. 触发审查
    const run = await mastra.getWorkflow("skillReviewWorkflow").createRun();
    const timer = startTimer();
    llmLog("info", {
      event: "workflow.run.start",
      workflowId: "skillReviewWorkflow",
      runId: run.runId,
      batchId: batch.batchId,
    });
    const result = await run.start({ inputData: { batchId: batch.batchId } });
    if (result.status !== "success") {
      llmLogError({
        event: "workflow.run.failed",
        workflowId: "skillReviewWorkflow",
        runId: run.runId,
        batchId: batch.batchId,
        latencyMs: timer.elapsedMs(),
        error: result.status === "failed" ? result.error : result.status,
      });
    } else {
      llmLog("info", {
        event: "workflow.run.success",
        workflowId: "skillReviewWorkflow",
        runId: run.runId,
        batchId: batch.batchId,
        latencyMs: timer.elapsedMs(),
        status: "success",
      });
    }

    // 3. 返回批次信息
    const stagingInfo = skillService.getStaging(batch.batchId);
    return Response.json({
      success: true,
      batch: stagingInfo,
    });
  } catch (err) {
    return jsonError(err, { request: req, status: 500, body: "success-false", fallback: "安装失败" });
  }
}
