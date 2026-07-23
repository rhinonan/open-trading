// src/queue/bootstrap.ts
// 幂等启动：Workers + schedule repeatable 同步
import { startWorkers } from "./workers";
import { syncScheduleRepeatables } from "./repeatables";
import { getRedisUrl } from "./connection";

const g = globalThis as typeof globalThis & {
  __otQueueRuntime?: boolean;
  __otQueueRuntimePromise?: Promise<void>;
};

export function ensureQueueRuntime(): void {
  if (g.__otQueueRuntime) return;
  if (g.__otQueueRuntimePromise) return;

  g.__otQueueRuntimePromise = (async () => {
    try {
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "info",
          event: "bullmq.runtime.starting",
          redis: getRedisUrl().replace(/\/\/.*@/, "//***@"),
        }),
      );
      startWorkers();
      await syncScheduleRepeatables();
      g.__otQueueRuntime = true;
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "info",
          event: "bullmq.runtime.ready",
        }),
      );
    } catch (err) {
      g.__otQueueRuntimePromise = undefined;
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          event: "bullmq.runtime.failed",
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        }),
      );
    }
  })();
}

export function isQueueRuntimeReady(): boolean {
  return !!g.__otQueueRuntime;
}
