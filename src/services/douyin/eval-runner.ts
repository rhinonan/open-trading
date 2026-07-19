// src/services/douyin/eval-runner.ts
// 进程内单例评判 runner：kick() 唤醒，worker 按并发上限从队列
// 原子认领任务，跑完（含唤醒期间新入队的）自动歇下。
// 定时入队由 JobScheduler（schedule.eval）负责，本模块只消费队列。
import { db, type Db } from "@/db";
import {
  claimNextEval,
  recoverStaleEval,
  markEvalFailed,
  type ClaimedEvalWork,
} from "@/services/douyin/eval-queue";
import { mastra } from "@/mastra";
import { llmLog, llmLogError, startTimer } from "@/lib/llm-log";

const CONCURRENCY = 1; // 东财限流 + sandbox，串行唯一选择
const WORKFLOW_ID = "evaluateWorkWorkflow";

/** 执行 Mastra evaluateWorkWorkflow；自身消化所有错误（失败回写 DB），不抛出 */
async function runEvalWorkflow(
  work: ClaimedEvalWork,
  dbi: Db = db,
): Promise<void> {
  const { id, awemeId } = work;
  const timer = startTimer();
  let runId: string | undefined;
  try {
    const run = await mastra.getWorkflow(WORKFLOW_ID).createRun();
    runId = run.runId;
    llmLog("info", {
      event: "workflow.run.start",
      workflowId: WORKFLOW_ID,
      runId,
      workId: id,
      awemeId,
    });
    const result = await run.start({
      inputData: {
        workId: id,
        awemeId,
        desc: work.desc,
        transcript: work.transcript,
        opinionSummary: work.opinionSummary,
        publishedAt: work.publishedAt,
        bloggerId: work.bloggerId,
      },
    });
    if (result.status !== "success") {
      throw new Error(
        result.status === "failed"
          ? String(result.error)
          : `status: ${result.status}`,
      );
    }
    llmLog("info", {
      event: "workflow.run.success",
      workflowId: WORKFLOW_ID,
      runId,
      workId: id,
      awemeId,
      latencyMs: timer.elapsedMs(),
      status: "success",
    });
  } catch (err) {
    llmLogError({
      event: "workflow.run.failed",
      workflowId: WORKFLOW_ID,
      runId,
      workId: id,
      awemeId,
      latencyMs: timer.elapsedMs(),
      error: err,
    });
    markEvalFailed(id, dbi);
  }
}

export interface Runner {
  kick(): void;
  isRunning(): boolean;
}

interface RunnerOptions {
  dbi?: Db;
  concurrency?: number;
}

export function createRunner(opts: RunnerOptions = {}): Runner {
  const dbi = opts.dbi ?? db;
  const concurrency = opts.concurrency ?? CONCURRENCY;
  let running = false;
  let wake = false;

  async function processWork(work: ClaimedEvalWork): Promise<void> {
    await runEvalWorkflow(work, dbi);
  }

  async function worker(): Promise<void> {
    while (true) {
      const claimed = claimNextEval(dbi);
      if (!claimed) return;
      await processWork(claimed);
    }
  }

  async function loop(): Promise<void> {
    do {
      wake = false;
      recoverStaleEval(dbi);
      await Promise.all(
        Array.from({ length: concurrency }, () => worker())
      );
    } while (wake);
  }

  function kick() {
    if (running) {
      wake = true;
      return;
    }
    running = true;
    void loop()
      .catch((err) =>
        llmLogError({
          event: "runner.loop.crashed",
          workflowId: WORKFLOW_ID,
          error: err,
        }),
      )
      .finally(() => {
        running = false;
        if (wake) kick();
      });
  }

  return {
    kick,
    isRunning: () => running,
  };
}

// globalThis 单例（dev HMR 防双 runner）
const g = globalThis as typeof globalThis & { __evalRunner?: Runner };

export function getEvalRunner(): Runner {
  g.__evalRunner ??= createRunner();
  return g.__evalRunner;
}
