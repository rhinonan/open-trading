// src/queue/names.ts
// BullMQ 队列名常量 —— 业务层只经 producers，勿散落字符串

export const QUEUE_TRANSCRIBE = "douyin-transcribe" as const;
export const QUEUE_EVAL = "douyin-eval" as const;
export const QUEUE_SCHEDULE_PROFILE = "schedule-profile" as const;
export const QUEUE_SCHEDULE_SCAN = "schedule-scan" as const;
export const QUEUE_SCHEDULE_PIPELINE = "schedule-pipeline" as const;
export const QUEUE_SCHEDULE_EVAL = "schedule-eval" as const;

export const ALL_QUEUE_NAMES = [
  QUEUE_TRANSCRIBE,
  QUEUE_EVAL,
  QUEUE_SCHEDULE_PROFILE,
  QUEUE_SCHEDULE_SCAN,
  QUEUE_SCHEDULE_PIPELINE,
  QUEUE_SCHEDULE_EVAL,
] as const;

export type QueueName = (typeof ALL_QUEUE_NAMES)[number];

/** 定时任务 id → 对应 schedule 队列名 */
export const SCHEDULE_QUEUE_BY_JOB: Record<
  "profile" | "scan" | "pipeline" | "eval",
  QueueName
> = {
  profile: QUEUE_SCHEDULE_PROFILE,
  scan: QUEUE_SCHEDULE_SCAN,
  pipeline: QUEUE_SCHEDULE_PIPELINE,
  eval: QUEUE_SCHEDULE_EVAL,
};
