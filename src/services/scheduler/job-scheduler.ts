// src/services/scheduler/job-scheduler.ts
// 可注入的 JobScheduler 内核：tick / force run / busy 互斥 / settings 持久化 + job_runs 历史
import { parseCron, cronMatches } from "@/lib/cron-matcher";
import type { JobDefinition, RunJobResult, ScheduleJobId } from "./types";
import { eq } from "drizzle-orm";
import { type Db, db as defaultDb } from "@/db";
import { jobRuns } from "@/db/schema";

export type { JobDefinition, RunJobResult, ScheduleJobId };

const DEFAULT_TICK_INTERVAL_MS = 60_000;

function settingKey(id: ScheduleJobId, field: string): string {
  return `schedule.${id}.${field}`;
}

export function createJobScheduler(opts: {
  jobs: JobDefinition[];
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  now?: () => number; // unix sec，测试注入
  tickIntervalMs?: number;
  dbi?: Db; // 生产注入 db 以写 job_runs；测试不传则跳过
}): {
  start(): void;
  stop(): void;
  tick(): Promise<void>;
  runJob(id: ScheduleJobId, runOpts?: { force?: boolean; trigger?: "manual" | "cron" }): Promise<RunJobResult>;
  isRunning(id: ScheduleJobId): boolean;
} {
  const {
    jobs,
    getSetting,
    setSetting,
    now: nowFn = () => Math.floor(Date.now() / 1000),
    tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
    dbi = defaultDb,
  } = opts;

  const byId = new Map(jobs.map((j) => [j.id, j]));
  const running = new Set<ScheduleJobId>();
  let tickTimer: ReturnType<typeof setInterval> | null = null;

  async function isEnabled(job: JobDefinition): Promise<boolean> {
    const raw = await getSetting(settingKey(job.id, "enabled"));
    if (raw === null || raw === undefined || raw === "") {
      return job.defaultEnabled;
    }
    return raw === "true";
  }

  async function getCron(job: JobDefinition): Promise<string> {
    const raw = await getSetting(settingKey(job.id, "cron"));
    if (raw === null || raw === undefined || raw === "") {
      return job.defaultCron;
    }
    return raw;
  }

  async function shouldFire(
    job: JobDefinition,
    lastRunAt: number,
    now: number,
  ): Promise<boolean> {
    let cron;
    try {
      cron = parseCron(await getCron(job));
    } catch {
      return false;
    }
    // 与 eval-runner 相同：从 lastRunAt+60 步进到 now
    for (let t = lastRunAt + 60; t <= now; t += 60) {
      if (cronMatches(cron, new Date(t * 1000))) {
        return true;
      }
    }
    return false;
  }

  async function runJob(
    id: ScheduleJobId,
    runOpts?: { force?: boolean; trigger?: "manual" | "cron" },
  ): Promise<RunJobResult> {
    const job = byId.get(id);
    if (!job) {
      return { ok: false, error: `unknown job: ${id}` };
    }

    if (running.has(id)) {
      return { ok: false, busy: true };
    }

    // 非 force：检查 enabled + shouldFire
    if (!runOpts?.force) {
      if (!(await isEnabled(job))) {
        return { ok: false, error: "disabled" };
      }
      const lastRunStr = await getSetting(settingKey(id, "last_run_at"));
      const lastRunAt = lastRunStr ? parseInt(lastRunStr, 10) : 0;
      const now = nowFn();
      if (!(await shouldFire(job, lastRunAt, now))) {
        return { ok: false, error: "not due" };
      }
    }

    running.add(id);
    const trigger = runOpts?.trigger ?? "cron";
    const now = nowFn();

    // 写入 job_runs 开始记录
    let runId: number | undefined;
    if (dbi) {
      try {
        const row = await dbi.insert(jobRuns).values({
          jobId: id,
          trigger,
          startedAt: now,
          status: "running",
        }).returning({ id: jobRuns.id }).get();
        runId = row?.id;
      } catch {
        // 写 run 记录失败不影响任务执行
      }
    }

    try {
      const result = await job.handler();
      const summary =
        result && typeof result === "object" && "summary" in result
          ? result.summary
          : undefined;
      await setSetting(settingKey(id, "last_run_at"), String(now));
      await setSetting(settingKey(id, "last_error"), "");
      // 更新 job_runs 为成功
      if (runId != null && dbi) {
        try {
          await dbi.update(jobRuns).set({
            finishedAt: nowFn(),
            status: "success",
            summary: summary ?? "",
          }).where(eq(jobRuns.id, runId)).run();
        } catch { /* 忽略 */ }
      }
      return { ok: true, summary, runId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await setSetting(settingKey(id, "last_run_at"), String(now));
      await setSetting(settingKey(id, "last_error"), message);
      // 更新 job_runs 为失败
      if (runId != null && dbi) {
        try {
          await dbi.update(jobRuns).set({
            finishedAt: nowFn(),
            status: "failed",
            error: message,
          }).where(eq(jobRuns.id, runId)).run();
        } catch { /* 忽略 */ }
      }
      return { ok: false, error: message, runId };
    } finally {
      running.delete(id);
    }
  }

  async function tick(): Promise<void> {
    const now = nowFn();
    for (const job of jobs) {
      if (running.has(job.id)) continue;
      if (!(await isEnabled(job))) continue;
      const lastRunStr = await getSetting(settingKey(job.id, "last_run_at"));
      const lastRunAt = lastRunStr ? parseInt(lastRunStr, 10) : 0;
      if (!(await shouldFire(job, lastRunAt, now))) continue;
      await runJob(job.id, { trigger: "cron" });
    }
  }

  function start(): void {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      void tick();
    }, tickIntervalMs);
  }

  function stop(): void {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  return {
    start,
    stop,
    tick,
    runJob,
    isRunning: (id) => running.has(id),
  };
}
