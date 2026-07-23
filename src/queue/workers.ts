// src/queue/workers.ts
// 同进程 BullMQ Workers（globalThis 防 HMR 双开）
import { Worker, type Job } from "bullmq";
import { getConnectionOptions } from "./connection";
import {
  QUEUE_EVAL,
  QUEUE_SCHEDULE_EVAL,
  QUEUE_SCHEDULE_PIPELINE,
  QUEUE_SCHEDULE_PROFILE,
  QUEUE_SCHEDULE_SCAN,
  QUEUE_TRANSCRIBE,
} from "./names";
import { processTranscribeWork } from "@/services/douyin/processors/transcribe";
import { processEvalWork } from "@/services/douyin/processors/eval";
import { runProfileJob } from "@/services/scheduler/jobs/profile";
import { runScanJob } from "@/services/scheduler/jobs/scan";
import { runPipelineJob } from "@/services/scheduler/jobs/pipeline";
import { runEvalJob } from "@/services/scheduler/jobs/eval";
import { setSetting } from "@/services/settings-service";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { ScheduleJobId } from "@/services/scheduler/types";
import { llmLogError } from "@/lib/llm-log";

// 转写可达数分钟（含 ASR 轮询）
const TRANSCRIBE_LOCK_MS = 15 * 60_000;
const EVAL_LOCK_MS = 10 * 60_000;
const SCHEDULE_LOCK_MS = 30 * 60_000;

type WorkerMap = Record<string, Worker>;

const g = globalThis as typeof globalThis & {
  __otWorkers?: WorkerMap;
  __otWorkersStarted?: boolean;
};

function map(): WorkerMap {
  g.__otWorkers ??= {};
  return g.__otWorkers;
}

function attachError(w: Worker, name: string) {
  w.on("failed", (job, err) => {
    llmLogError({
      event: "bullmq.job.failed",
      workflowId: name,
      workId: (job?.data as { workId?: number })?.workId,
      error: err,
    });
  });
  w.on("error", (err) => {
    llmLogError({
      event: "bullmq.worker.error",
      workflowId: name,
      error: err,
    });
  });
}

async function handleTranscribe(job: Job<{ workId: number }>) {
  const result = await processTranscribeWork(job.data.workId, {
    rethrow: true,
  });
  if (!result.ok) throw new Error(result.error || "transcribe failed");
}

async function handleEval(job: Job<{ workId: number }>) {
  const result = await processEvalWork(job.data.workId, { rethrow: true });
  if (!result.ok) throw new Error(result.error || "eval failed");
}

async function handleSchedule(
  id: ScheduleJobId,
  handler: () => Promise<void | { summary?: string }>,
  trigger: "cron" | "manual" = "cron",
) {
  const now = Math.floor(Date.now() / 1000);
  let runId: number | undefined;
  try {
    const row = await db
      .insert(jobRuns)
      .values({
        jobId: id,
        trigger,
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
    const result = await handler();
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
    throw err;
  }
}

export function startWorkers(): void {
  if (g.__otWorkersStarted) return;
  g.__otWorkersStarted = true;
  const connection = getConnectionOptions();
  const m = map();

  m[QUEUE_TRANSCRIBE] = new Worker(
    QUEUE_TRANSCRIBE,
    async (job) => handleTranscribe(job as Job<{ workId: number }>),
    {
      connection,
      concurrency: 2,
      lockDuration: TRANSCRIBE_LOCK_MS,
    },
  );
  attachError(m[QUEUE_TRANSCRIBE]!, QUEUE_TRANSCRIBE);

  m[QUEUE_EVAL] = new Worker(
    QUEUE_EVAL,
    async (job) => handleEval(job as Job<{ workId: number }>),
    {
      connection,
      concurrency: 1,
      lockDuration: EVAL_LOCK_MS,
    },
  );
  attachError(m[QUEUE_EVAL]!, QUEUE_EVAL);

  m[QUEUE_SCHEDULE_PROFILE] = new Worker(
    QUEUE_SCHEDULE_PROFILE,
    async (job) => {
      const trigger =
        (job.data as { trigger?: string })?.trigger === "manual"
          ? "manual"
          : "cron";
      await handleSchedule("profile", runProfileJob, trigger);
    },
    { connection, concurrency: 1, lockDuration: SCHEDULE_LOCK_MS },
  );
  attachError(m[QUEUE_SCHEDULE_PROFILE]!, QUEUE_SCHEDULE_PROFILE);

  m[QUEUE_SCHEDULE_SCAN] = new Worker(
    QUEUE_SCHEDULE_SCAN,
    async (job) => {
      const trigger =
        (job.data as { trigger?: string })?.trigger === "manual"
          ? "manual"
          : "cron";
      await handleSchedule("scan", runScanJob, trigger);
    },
    { connection, concurrency: 1, lockDuration: SCHEDULE_LOCK_MS },
  );
  attachError(m[QUEUE_SCHEDULE_SCAN]!, QUEUE_SCHEDULE_SCAN);

  m[QUEUE_SCHEDULE_PIPELINE] = new Worker(
    QUEUE_SCHEDULE_PIPELINE,
    async (job) => {
      const trigger =
        (job.data as { trigger?: string })?.trigger === "manual"
          ? "manual"
          : "cron";
      await handleSchedule("pipeline", runPipelineJob, trigger);
    },
    { connection, concurrency: 1, lockDuration: SCHEDULE_LOCK_MS },
  );
  attachError(m[QUEUE_SCHEDULE_PIPELINE]!, QUEUE_SCHEDULE_PIPELINE);

  m[QUEUE_SCHEDULE_EVAL] = new Worker(
    QUEUE_SCHEDULE_EVAL,
    async (job) => {
      const trigger =
        (job.data as { trigger?: string })?.trigger === "manual"
          ? "manual"
          : "cron";
      await handleSchedule("eval", runEvalJob, trigger);
    },
    { connection, concurrency: 1, lockDuration: SCHEDULE_LOCK_MS },
  );
  attachError(m[QUEUE_SCHEDULE_EVAL]!, QUEUE_SCHEDULE_EVAL);

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      event: "bullmq.workers.started",
      queues: Object.keys(m),
    }),
  );
}

export async function stopWorkers(): Promise<void> {
  const m = map();
  await Promise.all(Object.values(m).map((w) => w.close()));
  g.__otWorkers = {};
  g.__otWorkersStarted = false;
}
