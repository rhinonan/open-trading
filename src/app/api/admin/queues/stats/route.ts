// src/app/api/admin/queues/stats/route.ts
// 队列计数（轻量，不依赖 Bull Board UI）
import { requireAdmin } from "@/lib/admin-auth";
import { jsonError } from "@/lib/api-error";
import { ensureQueueRuntime } from "@/queue/bootstrap";
import { ALL_QUEUE_NAMES } from "@/queue/names";
import { getQueue } from "@/queue/queues";

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  ensureQueueRuntime();
  try {
    const queues = await Promise.all(
      ALL_QUEUE_NAMES.map(async (name) => {
        const q = getQueue(name);
        const counts = await q.getJobCounts(
          "waiting",
          "active",
          "completed",
          "failed",
          "delayed",
          "paused",
        );
        return { name, counts };
      }),
    );
    return Response.json({ success: true, queues });
  } catch (err) {
    return jsonError(err, {
      request,
      status: 503,
      body: "success-false",
      fallback: "队列服务不可用（检查 Redis）",
    });
  }
}
