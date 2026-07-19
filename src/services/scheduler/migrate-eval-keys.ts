// src/services/scheduler/migrate-eval-keys.ts
// 将旧 eval_schedule_* settings 幂等迁移到 schedule.eval.*
import { getSetting, setSetting, deleteSetting } from "@/services/settings-service";

const PAIRS: Array<[string, string]> = [
  ["eval_schedule_enabled", "schedule.eval.enabled"],
  ["eval_schedule_cron", "schedule.eval.cron"],
  ["eval_last_run_at", "schedule.eval.last_run_at"],
];

/** 幂等：旧键 → schedule.eval.* 后删除旧键 */
export async function migrateEvalScheduleKeys(): Promise<void> {
  for (const [oldKey, newKey] of PAIRS) {
    const oldVal = await getSetting(oldKey);
    if (oldVal == null) continue;
    const newVal = await getSetting(newKey);
    if (newVal == null) {
      await setSetting(newKey, oldVal);
    }
    await deleteSetting(oldKey);
  }
}
