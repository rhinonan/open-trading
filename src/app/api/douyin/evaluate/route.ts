import { enqueueEvalFromDb } from "@/queue/producers/eval";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureSchedulerStarted } from "@/services/scheduler";
import { jsonError } from "@/lib/api-error";

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  ensureSchedulerStarted();

  try {
    const { marked, jobs } = await enqueueEvalFromDb();
    return Response.json({ success: true, enqueued: marked, jobs });
  } catch (err) {
    return jsonError(err, { request: request, status: 500, body: "success-false", fallback: "入队失败" });
  }
}
