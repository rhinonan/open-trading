import { enqueueForEvaluation } from "@/services/douyin/eval-queue";
import { getEvalRunner } from "@/services/douyin/eval-runner";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureSchedulerStarted } from "@/services/scheduler";
import { jsonError } from "@/lib/api-error";

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  ensureSchedulerStarted();

  try {
    const count = enqueueForEvaluation();
    getEvalRunner().kick();
    return Response.json({ success: true, enqueued: count });
  } catch (err) {
    return jsonError(err, { request: request, status: 500, body: "success-false", fallback: "入队失败" });
  }
}
