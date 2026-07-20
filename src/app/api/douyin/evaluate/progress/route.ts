import { getEvalProgress } from "@/services/douyin/eval-queue";
import { jsonError } from "@/lib/api-error";

export async function GET() {
  try {
    const progress = getEvalProgress();
    return Response.json({ success: true, ...progress });
  } catch (err) {
    return jsonError(err, { status: 500, body: "success-false", fallback: "获取进度失败" });
  }
}
