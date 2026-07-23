// src/app/api/douyin/works/[id]/evaluate/route.ts
import { jsonError } from "@/lib/api-error";
import { NextRequest } from "next/server";
import { enqueueEvalWork } from "@/queue/producers/eval";
import { ensureSchedulerStarted } from "@/services/scheduler";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  ensureSchedulerStarted();

  try {
    const { id } = await ctx.params;
    const workId = parseInt(id, 10);
    if (isNaN(workId)) {
      return Response.json({ success: false, error: "Invalid work ID" }, { status: 400 });
    }
    const result = await enqueueEvalWork(workId);
    if (!result.success) {
      return Response.json({ success: false, error: result.error }, { status: 400 });
    }
    return Response.json({ success: true, workId });
  } catch (err) {
    return jsonError(err, { request: _req, status: 500, body: "success-false", fallback: "入队失败" });
  }
}
