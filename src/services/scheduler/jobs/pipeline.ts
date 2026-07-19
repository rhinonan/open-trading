// src/services/scheduler/jobs/pipeline.ts
import { getTranscribeRunner } from "@/services/douyin/pipeline-runner";

export async function runPipelineJob(): Promise<{ summary: string }> {
  getTranscribeRunner().kick();
  return { summary: "已 kick 转写队列" };
}
