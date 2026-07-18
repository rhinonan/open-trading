// src/app/api/douyin/transcribe/route.ts
// 触发即返回：入队计数立即响应，转写由 pipeline-runner 后台执行，
// 进度通过 /api/douyin/works 的 transcriptStatus 轮询。
// （旧参数 concurrency/maxTasks 已废弃：runner 固定并发，跑到队列清空。）
import { startTranscribePendingWorks } from "@/services/douyin/pipeline-service";

export async function POST() {
  try {
    return Response.json(startTranscribePendingWorks());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
