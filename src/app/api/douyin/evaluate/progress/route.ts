import { getEvalProgress } from "@/services/douyin/eval-queue";

export async function GET() {
  try {
    const progress = getEvalProgress();
    return Response.json({ success: true, ...progress });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "获取进度失败" },
      { status: 500 }
    );
  }
}
