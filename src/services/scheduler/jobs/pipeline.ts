// src/services/scheduler/jobs/pipeline.ts
import { getTranscribeRunner } from "@/services/douyin/pipeline-runner";

export async function runPipelineJob(): Promise<{ summary: string }> {
  const runner = getTranscribeRunner();
  // 取快照仅在本次 kick+drain 窗口内统计处理量
  const before = runner.getStats();
  runner.kick();
  const after = await runner.awaitDrain();
  const processed = after.processed - before.processed;
  const failed = after.failed - before.failed;
  const succeeded = processed - failed;
  if (processed === 0) return { summary: "转写队列为空，无需处理" };
  return { summary: `转写 ${succeeded} 成功 / ${failed} 失败（共 ${processed} 条）` };
}
