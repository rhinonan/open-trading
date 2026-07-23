// src/queue/repeatables.ts
// 将 settings 中的 schedule.*.cron/enabled 同步为 BullMQ repeatable jobs
import { getSetting } from "@/services/settings-service";
import { JOB_DEFINITIONS } from "@/services/scheduler/job-registry";
import type { ScheduleJobId } from "@/services/scheduler/types";
import { getQueue } from "./queues";
import { SCHEDULE_QUEUE_BY_JOB } from "./names";

function settingKey(id: ScheduleJobId, field: string): string {
  return `schedule.${id}.${field}`;
}

export async function syncScheduleRepeatables(): Promise<void> {
  for (const def of JOB_DEFINITIONS) {
    const queueName = SCHEDULE_QUEUE_BY_JOB[def.id];
    const queue = getQueue(queueName);

    const enabledRaw = await getSetting(settingKey(def.id, "enabled"));
    const enabled =
      enabledRaw === null || enabledRaw === undefined || enabledRaw === ""
        ? def.defaultEnabled
        : enabledRaw === "true";
    const cronRaw = await getSetting(settingKey(def.id, "cron"));
    const cron =
      cronRaw === null || cronRaw === undefined || cronRaw === ""
        ? def.defaultCron
        : cronRaw;

    // 清掉该队列上旧的 repeatable，再按需添加（简单可靠）
    const existing = await queue.getRepeatableJobs();
    for (const r of existing) {
      await queue.removeRepeatableByKey(r.key);
    }

    if (!enabled) continue;

    await queue.add(
      def.id,
      { scheduleJobId: def.id },
      {
        repeat: { pattern: cron },
        jobId: `repeat-${def.id}`,
      },
    );
  }

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      event: "bullmq.repeatables.synced",
    }),
  );
}

/** 手动立即跑一次 schedule job（不经过 cron） */
export async function enqueueScheduleManual(
  id: ScheduleJobId,
): Promise<void> {
  const queueName = SCHEDULE_QUEUE_BY_JOB[id];
  await getQueue(queueName).add(
    id,
    { scheduleJobId: id, trigger: "manual" },
    { jobId: `manual-${id}-${Date.now()}` },
  );
}
