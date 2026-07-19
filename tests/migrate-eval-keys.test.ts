import { describe, it, expect } from "vitest";
import { migrateEvalScheduleKeys } from "@/services/scheduler/migrate-eval-keys";

function memoryDeps(map: Map<string, string>) {
  return {
    getSetting: async (k: string) => map.get(k) ?? null,
    setSetting: async (k: string, v: string) => {
      map.set(k, v);
    },
    deleteSetting: async (k: string) => {
      map.delete(k);
    },
  };
}

describe("migrateEvalScheduleKeys", () => {
  it("旧键写入新键后删除旧键", async () => {
    const map = new Map<string, string>([
      ["eval_schedule_enabled", "true"],
      ["eval_schedule_cron", "5 17 * * 1-5"],
      ["eval_last_run_at", "2026-01-01T00:00:00.000Z"],
    ]);

    await migrateEvalScheduleKeys(memoryDeps(map));

    expect(map.get("schedule.eval.enabled")).toBe("true");
    expect(map.get("schedule.eval.cron")).toBe("5 17 * * 1-5");
    expect(map.get("schedule.eval.last_run_at")).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(map.has("eval_schedule_enabled")).toBe(false);
    expect(map.has("eval_schedule_cron")).toBe(false);
    expect(map.has("eval_last_run_at")).toBe(false);
  });

  it("新键已存在则只删旧键，保留新键值", async () => {
    const map = new Map<string, string>([
      ["eval_schedule_cron", "5 17 * * 1-5"],
      ["schedule.eval.cron", "0 18 * * 1-5"],
    ]);

    await migrateEvalScheduleKeys(memoryDeps(map));

    expect(map.get("schedule.eval.cron")).toBe("0 18 * * 1-5");
    expect(map.has("eval_schedule_cron")).toBe(false);
  });

  it("无旧键时为 no-op", async () => {
    const map = new Map<string, string>([
      ["schedule.eval.cron", "0 18 * * 1-5"],
    ]);

    await migrateEvalScheduleKeys(memoryDeps(map));

    expect(map.size).toBe(1);
    expect(map.get("schedule.eval.cron")).toBe("0 18 * * 1-5");
  });
});
