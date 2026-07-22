// src/services/scheduler/jobs/eval.ts
import { enqueueForEvaluation, enqueueReevaluation } from "@/services/douyin/eval-queue";
import { getEvalRunner } from "@/services/douyin/eval-runner";

export async function runEvalJob(): Promise<{ summary: string }> {
  const newCount = enqueueForEvaluation();
  const reEvalCount = enqueueReevaluation();
  const runner = getEvalRunner();
  const before = runner.getStats();
  runner.kick();
  const after = await runner.awaitDrain();
  const processed = after.processed - before.processed;
  const failed = after.failed - before.failed;
  const succeeded = processed - failed;
  const parts = [`入队新 ${newCount}，重评 ${reEvalCount}`];
  if (processed > 0) {
    parts.push(`评判 ${succeeded} 成功 / ${failed} 失败`);
  } else if (newCount === 0 && reEvalCount === 0) {
    parts.push("无待评判作品");
  }
  return { summary: parts.join("；") };
}
