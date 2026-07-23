// src/services/scheduler/jobs/eval.ts
import { enqueueEvalFromDb } from "@/queue/producers/eval";

export async function runEvalJob(): Promise<{ summary: string }> {
  const { marked, reeval, jobs } = await enqueueEvalFromDb({
    includeReeval: true,
  });
  const parts = [`入队新 ${marked}，重评 ${reeval}，Bull jobs ${jobs}`];
  if (jobs === 0 && marked === 0 && reeval === 0) {
    parts.push("无待评判作品");
  }
  return { summary: parts.join("；") };
}
