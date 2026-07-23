// src/services/douyin/pipeline-service.ts
// 转写任务入队 API：路由只调这里，立即返回；由 BullMQ Worker 消费。
import {
  enqueuePendingTranscribes,
  enqueueTranscribeWork,
} from "@/queue/producers/transcribe";
import { ensureQueueRuntime } from "@/queue/bootstrap";
import { recoverStaleProcessing } from "@/services/douyin/pipeline-queue";

export interface EnqueueResult {
  accepted: true;
  pending: number;
  processing: number;
  queued?: number;
}

/** 全局转写：恢复僵尸 + bulk 入 Bull */
export async function startTranscribePendingWorks(): Promise<EnqueueResult> {
  ensureQueueRuntime();
  recoverStaleProcessing();
  const r = await enqueuePendingTranscribes();
  return {
    accepted: true,
    pending: r.pending,
    processing: r.processing,
    queued: r.queued,
  };
}

/** 单博主转写：failed 重置后 bulk 入队 */
export async function startTranscribeBloggerWorks(
  bloggerId: number,
): Promise<EnqueueResult> {
  ensureQueueRuntime();
  recoverStaleProcessing();
  const r = await enqueuePendingTranscribes({
    bloggerId,
    resetFailed: true,
  });
  return {
    accepted: true,
    pending: r.pending,
    processing: r.processing,
    queued: r.queued,
  };
}

/** 单作品转写 */
export async function startTranscribeWork(workId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  ensureQueueRuntime();
  return enqueueTranscribeWork(workId);
}
