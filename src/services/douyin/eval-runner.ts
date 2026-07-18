// src/services/douyin/eval-runner.ts
// 进程内单例评判 runner：kick() 唤醒，worker 按并发上限从队列
// 原子认领任务，跑完（含唤醒期间新入队的）自动歇下。
// 内置 cron 定时 tick：检查 eval_schedule_cron 配置，到点自动入队。
import { db, type Db } from "@/db";
import {
  claimNextEval,
  recoverStaleEval,
  markEvalFailed,
  enqueueForEvaluation,
  enqueueReevaluation,
  type ClaimedEvalWork,
} from "@/services/douyin/eval-queue";
import { getSetting, setSetting } from "@/services/settings-service";
import { parseCron, cronMatches } from "@/lib/cron-matcher";

const CONCURRENCY = 1; // 东财限流 + sandbox，串行唯一选择
const DEFAULT_CRON = "5 17 * * 1-5";
const TICK_INTERVAL_MS = 60_000; // 每分钟 tick 一次

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
  let tickTimer: ReturnType<typeof setInterval> | null = null;

  async function processWork(work: ClaimedEvalWork): Promise<void> {
    const { id, awemeId } = work;
    const logPrefix = `[eval:${awemeId}]`;
    try {
      // TODO: Task 5 将注册 evaluateWorkWorkflow，届时替换此 stub
      console.log(
        `${logPrefix} workflow not yet implemented for work #${id}`
      );
      markEvalFailed(id, dbi);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`${logPrefix} ❌ 失败: ${errorMsg}`);
      markEvalFailed(id, dbi);
    }
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

  async function scheduledTick(): Promise<void> {
    try {
      const enabledStr = await getSetting("eval_schedule_enabled");
      if (enabledStr === "false") return;

      const cronExpr = (await getSetting("eval_schedule_cron")) || DEFAULT_CRON;
      const lastRunStr = await getSetting("eval_last_run_at");
      const lastRunAt = lastRunStr ? parseInt(lastRunStr, 10) : 0;
      const now = Math.floor(Date.now() / 1000);

      // 从 lastRunAt 到 now 之间 cron 是否有命中
      const cron = parseCron(cronExpr);
      let shouldFire = false;
      // 每分钟步进扫描（最多回溯 12 小时，够用且不费）
      for (let t = lastRunAt + 60; t <= now; t += 60) {
        if (cronMatches(cron, new Date(t * 1000))) {
          shouldFire = true;
          break;
        }
      }

      if (!shouldFire) return;

      console.log("[eval-runner] cron 触发定时评判");
      const newCount = enqueueForEvaluation({}, dbi);
      const reEvalCount = enqueueReevaluation(dbi);
      console.log(
        `[eval-runner] 入队: ${newCount} 新作品, ${reEvalCount} 到期重评`
      );
      await setSetting("eval_last_run_at", String(now));
      kick();
    } catch (err) {
      console.error("[eval-runner] tick error:", err);
    }
  }

  function kick() {
    if (running) {
      wake = true;
      return;
    }
    running = true;
    void loop()
      .catch((err) => console.error("[eval-runner] loop crashed:", err))
      .finally(() => {
        running = false;
        if (wake) kick();
      });
  }

  // 启动定时 tick
  tickTimer = setInterval(scheduledTick, TICK_INTERVAL_MS);
  // 服务启动后立即测一次（cron 未到点不会触发）
  void scheduledTick();

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
