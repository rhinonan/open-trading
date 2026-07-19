// src/services/scheduler/migrate-eval-keys.ts
// 将旧 eval_schedule_* settings 幂等迁移到 schedule.eval.*
import {
  getSetting,
  setSetting,
  deleteSetting,
} from "@/services/settings-service";

const PAIRS: Array<[string, string]> = [
  ["eval_schedule_enabled", "schedule.eval.enabled"],
  ["eval_schedule_cron", "schedule.eval.cron"],
  ["eval_last_run_at", "schedule.eval.last_run_at"],
];

export type MigrateEvalScheduleDeps = {
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  deleteSetting: (key: string) => Promise<void>;
};

const defaultDeps: MigrateEvalScheduleDeps = {
  getSetting,
  setSetting,
  deleteSetting,
};

/** 幂等：旧键 → schedule.eval.* 后删除旧键 */
export async function migrateEvalScheduleKeys(
  deps: MigrateEvalScheduleDeps = defaultDeps,
): Promise<void> {
  for (const [oldKey, newKey] of PAIRS) {
    const oldVal = await deps.getSetting(oldKey);
    if (oldVal == null) continue;
    const newVal = await deps.getSetting(newKey);
    if (newVal == null) {
      await deps.setSetting(newKey, oldVal);
    }
    await deps.deleteSetting(oldKey);
  }
}
