// src/app/api/douyin/transcribe/route.ts
// 触发即返回：入队计数立即响应，转写由 BullMQ Worker 后台执行。
import { jsonError } from "@/lib/api-error";
import { startTranscribePendingWorks } from "@/services/douyin/pipeline-service";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    return Response.json(await startTranscribePendingWorks());
  } catch (err) {
    return jsonError(err, { request: request, status: 500, fallback: "Transcription failed" });
  }
}
