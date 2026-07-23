// src/services/scheduler/index.ts
// 兼容旧名 ensureSchedulerStarted → 委托 BullMQ runtime
import { ensureQueueRuntime } from "@/queue/bootstrap";
import { JOB_DEFINITIONS } from "./job-registry";
import { migrateEvalScheduleKeys } from "./migrate-eval-keys";
import { enqueueScheduleManual } from "@/queue/repeatables";
import { getSetting, setSetting } from "@/services/settings-service";
import type { RunJobResult, ScheduleJobId } from "./types";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";
import { eq } from "drizzle-orm";

const g = globalThis as typeof globalThis & {
  __jobSchedulerStarted?: boolean;
};

export function ensureSchedulerStarted(): void {
  if (g.__jobSchedulerStarted) return;
  g.__jobSchedulerStarted = true;
  void migrateEvalScheduleKeys().catch(() => {});
  ensureQueueRuntime();
}

/** 手动触发 schedule job：写 job_runs + 直接执行 handler */
export async function runScheduleJob(
  id: ScheduleJobId,
  opts?: { force?: boolean },
): Promise<RunJobResult> {
  ensureSchedulerStarted();
  const def = JOB_DEFINITIONS.find((j) => j.id === id);
  if (!def) return { ok: false, error: `unknown job: ${id}` };

  if (!opts?.force) {
    const enabledStr = await getSetting(`schedule.${id}.enabled`);
    const enabled =
      enabledStr === null || enabledStr === undefined || enabledStr === ""
        ? def.defaultEnabled
        : enabledStr === "true";
    if (!enabled) return { ok: false, error: "disabled" };
  }

  const now = Math.floor(Date.now() / 1000);
  let runId: number | undefined;
  try {
    const row = await db
      .insert(jobRuns)
      .values({
        jobId: id,
        trigger: "manual",
        startedAt: now,
        status: "running",
      })
      .returning({ id: jobRuns.id })
      .get();
    runId = row?.id;
  } catch {
    /* ignore */
  }

  try {
    const result = await def.handler();
    const summary =
      result && typeof result === "object" && "summary" in result
        ? result.summary
        : undefined;
    await setSetting(`schedule.${id}.last_run_at`, String(now));
    await setSetting(`schedule.${id}.last_error`, "");
    if (runId != null) {
      try {
        await db
          .update(jobRuns)
          .set({
            finishedAt: Math.floor(Date.now() / 1000),
            status: "success",
            summary: summary ?? "",
          })
          .where(eq(jobRuns.id, runId));
      } catch {
        /* ignore */
      }
    }
    return { ok: true, summary, runId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setSetting(`schedule.${id}.last_run_at`, String(now));
    await setSetting(`schedule.${id}.last_error`, message);
    if (runId != null) {
      try {
        await db
          .update(jobRuns)
          .set({
            finishedAt: Math.floor(Date.now() / 1000),
            status: "failed",
            error: message,
          })
          .where(eq(jobRuns.id, runId));
      } catch {
        /* ignore */
      }
    }
    return { ok: false, error: message, runId };
  }
}

/** @deprecated 旧 API；请用 runScheduleJob */
export function getScheduler() {
  return {
    start: () => ensureSchedulerStarted(),
    stop: () => {},
    tick: async () => {},
    runJob: (id: ScheduleJobId, runOpts?: { force?: boolean }) =>
      runScheduleJob(id, runOpts),
    isRunning: () => false,
  };
}

export { JOB_DEFINITIONS, enqueueScheduleManual };
export type { ScheduleJobId } from "./types";
