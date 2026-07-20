// src/app/api/douyin/works/[id]/evaluate/route.ts
import { jsonError } from "@/lib/api-error";
import { NextRequest } from "next/server";
import { enqueueForEvaluation } from "@/services/douyin/eval-queue";
import { getEvalRunner } from "@/services/douyin/eval-runner";
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
      return Response.json({ error: "Invalid work ID" }, { status: 400 });
    }

    const count = enqueueForEvaluation({ workIds: [workId] });
    if (count === 0) {
      return Response.json(
        { error: "该作品不满足评判条件（需已转写且未评判）" },
        { status: 400 }
      );
    }
    getEvalRunner().kick();
    return Response.json({ success: true, workId });
  } catch (err) {
    return jsonError(err, { status: 500, fallback: "Evaluation failed" });
  }
}
