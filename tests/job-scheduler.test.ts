// tests/job-scheduler.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJobScheduler, type JobDefinition } from "@/services/scheduler/job-scheduler";

function memorySettings() {
  const map = new Map<string, string>();
  return {
    getSetting: async (k: string) => map.get(k) ?? null,
    setSetting: async (k: string, v: string) => {
      map.set(k, v);
    },
    map,
  };
}

describe("createJobScheduler", () => {
  it("force runJob 调用 handler 并写 last_run_at", async () => {
    const settings = memorySettings();
    const handler = vi.fn(async () => ({ summary: "ok" }));
    const jobs: JobDefinition[] = [
      {
        id: "pipeline",
        label: "处理",
        description: "kick",
        defaultEnabled: true,
        defaultCron: "*/15 * * * *",
        handler,
      },
    ];
    let now = 1_700_000_000;
    const sched = createJobScheduler({
      jobs,
      getSetting: settings.getSetting,
      setSetting: settings.setSetting,
      now: () => now,
    });
    const res = await sched.runJob("pipeline", { force: true });
    expect(res.ok).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    expect(await settings.getSetting("schedule.pipeline.last_run_at")).toBe(String(now));
  });

  it("handler 失败仍写 last_run_at 与 last_error", async () => {
    const settings = memorySettings();
    const jobs: JobDefinition[] = [
      {
        id: "scan",
        label: "扫描",
        description: "s",
        defaultEnabled: true,
        defaultCron: "* * * * *",
        handler: async () => {
          throw new Error("boom");
        },
      },
    ];
    const now = 1_700_000_100;
    const sched = createJobScheduler({
      jobs,
      getSetting: settings.getSetting,
      setSetting: settings.setSetting,
      now: () => now,
    });
    const res = await sched.runJob("scan", { force: true });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/boom/);
    expect(await settings.getSetting("schedule.scan.last_run_at")).toBe(String(now));
    expect(await settings.getSetting("schedule.scan.last_error")).toMatch(/boom/);
  });

  it("enabled=false 时 tick 不触发（非 force）", async () => {
    const settings = memorySettings();
    await settings.setSetting("schedule.pipeline.enabled", "false");
    await settings.setSetting("schedule.pipeline.cron", "* * * * *");
    await settings.setSetting("schedule.pipeline.last_run_at", "0");
    const handler = vi.fn(async () => {});
    const jobs: JobDefinition[] = [
      {
        id: "pipeline",
        label: "处理",
        description: "k",
        defaultEnabled: true,
        defaultCron: "* * * * *",
        handler,
      },
    ];
    const now = 1_700_000_200;
    const sched = createJobScheduler({
      jobs,
      getSetting: settings.getSetting,
      setSetting: settings.setSetting,
      now: () => now,
    });
    await sched.tick();
    expect(handler).not.toHaveBeenCalled();
  });

  it("同 job 重入返回 busy", async () => {
    const settings = memorySettings();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const jobs: JobDefinition[] = [
      {
        id: "eval",
        label: "评判",
        description: "e",
        defaultEnabled: true,
        defaultCron: "* * * * *",
        handler: async () => {
          await gate;
        },
      },
    ];
    const sched = createJobScheduler({
      jobs,
      getSetting: settings.getSetting,
      setSetting: settings.setSetting,
      now: () => 1_700_000_300,
    });
    const p1 = sched.runJob("eval", { force: true });
    const p2 = await sched.runJob("eval", { force: true });
    expect(p2.busy).toBe(true);
    release();
    await p1;
  });
});
