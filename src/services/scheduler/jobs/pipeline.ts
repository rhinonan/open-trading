// src/services/scheduler/jobs/pipeline.ts
import { enqueuePendingTranscribes } from "@/queue/producers/transcribe";

export async function runPipelineJob(): Promise<{ summary: string }> {
  const r = await enqueuePendingTranscribes();
  if (r.queued === 0) return { summary: "转写队列为空，无需处理" };
  return {
    summary: `已入队转写 ${r.queued} 条（pending ${r.pending} / processing ${r.processing}）`,
  };
}
