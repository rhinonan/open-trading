// src/services/scheduler/index.ts
// 进程内单例：getScheduler + ensureSchedulerStarted
import { getSetting, setSetting } from "@/services/settings-service";
import { createJobScheduler } from "./job-scheduler";
import { JOB_DEFINITIONS } from "./job-registry";
import { migrateEvalScheduleKeys } from "./migrate-eval-keys";
import { getTranscribeRunner } from "@/services/douyin/pipeline-runner";
import { getEvalRunner } from "@/services/douyin/eval-runner";

const g = globalThis as typeof globalThis & {
  __jobScheduler?: ReturnType<typeof createJobScheduler>;
  __jobSchedulerStarted?: boolean;
};

export function getScheduler() {
  g.__jobScheduler ??= createJobScheduler({
    jobs: JOB_DEFINITIONS,
    getSetting,
    setSetting,
  });
  return g.__jobScheduler;
}

/** 幂等：迁移旧键、确保 runner 存在、启动 tick */
export function ensureSchedulerStarted(): void {
  if (g.__jobSchedulerStarted) return;
  g.__jobSchedulerStarted = true;
  void migrateEvalScheduleKeys().catch(() => {});
  // 确保消费端存在
  getTranscribeRunner();
  getEvalRunner();
  const s = getScheduler();
  s.start();
}

export { JOB_DEFINITIONS };
export type { ScheduleJobId } from "./types";
