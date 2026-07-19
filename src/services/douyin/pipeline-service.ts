// src/services/douyin/pipeline-service.ts
// 转写任务的入队 API：路由只调这里，立即返回；实际执行由 pipeline-runner 后台消费。
// 旧版在此同步跑整条管线（信号量 + 等待全部完成），已废弃。
import {
  enqueueWork,
  recoverStaleProcessing,
  resetFailedForBlogger,
  countByStatus,
} from "@/services/douyin/pipeline-queue";
import { getTranscribeRunner } from "@/services/douyin/pipeline-runner";
import { ensureSchedulerStarted } from "@/services/scheduler";

export interface EnqueueResult {
  accepted: true;
  /** 排队中（含刚被僵尸恢复重置的） */
  pending: number;
  /** 正在转写 */
  processing: number;
}

/** 全局转写：恢复僵尸 + 唤醒 runner 清空整个 pending 队列 */
export function startTranscribePendingWorks(): EnqueueResult {
  ensureSchedulerStarted();
  recoverStaleProcessing();
  getTranscribeRunner().kick();
  return {
    accepted: true,
    pending: countByStatus("pending"),
    processing: countByStatus("processing"),
  };
}

/** 单博主转写：该博主的 failed 重置为 pending（重试语义）后唤醒 */
export function startTranscribeBloggerWorks(bloggerId: number): EnqueueResult {
  ensureSchedulerStarted();
  recoverStaleProcessing();
  resetFailedForBlogger(bloggerId);
  getTranscribeRunner().kick();
  return {
    accepted: true,
    pending: countByStatus("pending", bloggerId),
    processing: countByStatus("processing", bloggerId),
  };
}

/** 单作品转写：入队后唤醒 */
export function startTranscribeWork(workId: number): {
  success: boolean;
  error?: string;
} {
  ensureSchedulerStarted();
  const r = enqueueWork(workId);
  if (!r.queued) return { success: false, error: r.reason };
  getTranscribeRunner().kick();
  return { success: true };
}
