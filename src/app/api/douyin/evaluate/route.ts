import { enqueueForEvaluation } from "@/services/douyin/eval-queue";
import { getEvalRunner } from "@/services/douyin/eval-runner";

export async function POST() {
  try {
    const count = enqueueForEvaluation();
    getEvalRunner().kick();
    return Response.json({ success: true, enqueued: count });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "入队失败" },
      { status: 500 }
    );
  }
}
