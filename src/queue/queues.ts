// src/queue/queues.ts
// Queue 单例（globalThis 防 dev HMR 双开）
import { Queue, type JobsOptions } from "bullmq";
import { getConnectionOptions } from "./connection";
import {
  ALL_QUEUE_NAMES,
  QUEUE_EVAL,
  QUEUE_SCHEDULE_EVAL,
  QUEUE_SCHEDULE_PIPELINE,
  QUEUE_SCHEDULE_PROFILE,
  QUEUE_SCHEDULE_SCAN,
  QUEUE_TRANSCRIBE,
  type QueueName,
} from "./names";

export const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 2,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

type QueueMap = Partial<Record<QueueName, Queue>>;

const g = globalThis as typeof globalThis & {
  __otQueues?: QueueMap;
};

function getMap(): QueueMap {
  g.__otQueues ??= {};
  return g.__otQueues;
}

export function getQueue(name: QueueName): Queue {
  const map = getMap();
  if (!map[name]) {
    map[name] = new Queue(name, {
      connection: getConnectionOptions(),
      defaultJobOptions: DEFAULT_JOB_OPTS,
    });
  }
  return map[name]!;
}

export function getTranscribeQueue(): Queue {
  return getQueue(QUEUE_TRANSCRIBE);
}

export function getEvalQueue(): Queue {
  return getQueue(QUEUE_EVAL);
}

export function getScheduleProfileQueue(): Queue {
  return getQueue(QUEUE_SCHEDULE_PROFILE);
}

export function getScheduleScanQueue(): Queue {
  return getQueue(QUEUE_SCHEDULE_SCAN);
}

export function getSchedulePipelineQueue(): Queue {
  return getQueue(QUEUE_SCHEDULE_PIPELINE);
}

export function getScheduleEvalQueue(): Queue {
  return getQueue(QUEUE_SCHEDULE_EVAL);
}

/** 关闭全部 Queue 连接（测试 / 优雅退出） */
export async function closeAllQueues(): Promise<void> {
  const map = getMap();
  await Promise.all(
    Object.values(map).map(async (q) => {
      if (q) await q.close();
    }),
  );
  g.__otQueues = {};
}

export { ALL_QUEUE_NAMES };
