// src/services/scheduler/jobs/eval.ts
import { enqueueForEvaluation, enqueueReevaluation } from "@/services/douyin/eval-queue";
import { getEvalRunner } from "@/services/douyin/eval-runner";

export async function runEvalJob(): Promise<{ summary: string }> {
  const newCount = enqueueForEvaluation();
  const reEvalCount = enqueueReevaluation();
  getEvalRunner().kick();
  return { summary: `入队新 ${newCount}，重评 ${reEvalCount}` };
}
