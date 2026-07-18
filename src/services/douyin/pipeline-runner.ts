// src/services/douyin/pipeline-runner.ts
// 进程内单例转写 runner：kick() 唤醒，worker 池按并发上限从队列
// 原子认领任务，跑完（含唤醒期间新入队的）自动歇下。
// 依赖单容器长驻进程部署形态；进程挂掉靠 claimedAt 超时重捡兜底。
import { db, type Db } from "@/db";
import { mastra } from "@/mastra";
import {
  claimNextPending,
  recoverStaleProcessing,
  markWorkFailed,
  type ClaimedWork,
} from "@/services/douyin/pipeline-queue";

const CONCURRENCY = 2;

export interface Runner {
  kick(): void;
  isRunning(): boolean;
}

interface RunnerOptions {
  processWork: (work: ClaimedWork) => Promise<void>;
  dbi?: Db;
  concurrency?: number;
}

/** 可注入依赖的工厂（测试用）；生产统一走 getTranscribeRunner() */
export function createRunner(opts: RunnerOptions): Runner {
  const dbi = opts.dbi ?? db;
  const concurrency = opts.concurrency ?? CONCURRENCY;
  let running = false;
  let wake = false;

  async function worker(): Promise<void> {
    while (true) {
      const claimed = claimNextPending(dbi);
      if (!claimed) return;
      try {
        await opts.processWork(claimed);
      } catch (err) {
        // processWork 不应抛出；兜底防止单个任务击穿 worker
        console.error(`[pipeline-runner] [${claimed.awemeId}] 处理异常:`, err);
        markWorkFailed(claimed.id, dbi);
      }
    }
  }

  async function loop(): Promise<void> {
    do {
      wake = false;
      recoverStaleProcessing(dbi);
      await Promise.all(
        Array.from({ length: concurrency }, () => worker())
      );
    } while (wake); // 运行期间有新 kick → 再扫一轮
  }

  function kick() {
    if (running) {
      wake = true;
      return;
    }
    running = true;
    void loop()
      .catch((err) => console.error("[pipeline-runner] loop crashed:", err))
      .finally(() => {
        running = false;
        if (wake) kick();
      });
  }

  return { kick, isRunning: () => running };
}

/** 真实任务执行：跑 Mastra 转写 workflow；自身消化所有错误（失败回写 DB），不抛出 */
async function runTranscribeWorkflow(work: ClaimedWork): Promise<void> {
  const { id, awemeId, videoUrl, duration } = work;
  const logPrefix = `[${awemeId}]`;
  try {
    if (!videoUrl) throw new Error("No video_url stored for this work");
    const run = await mastra.getWorkflow("transcribeWorkWorkflow").createRun();
    const result = await run.start({
      inputData: { workId: id, awemeId, videoUrl, duration },
    });
    if (result.status !== "success") {
      const errorMsg =
        result.status === "failed"
          ? result.error instanceof Error
            ? result.error.message
            : String(result.error)
          : `workflow ended with status: ${result.status}`;
      throw new Error(errorMsg);
    }
    // done 状态与 transcript/opinionSummary 由 workflow 末步回写 DB
    console.log(`${logPrefix} ✅ 转写完成`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`${logPrefix} ❌ 失败: ${errorMsg}`);
    markWorkFailed(id);
  }
}

// dev 热重载会重建模块，用 globalThis 保住单例，避免双 runner 并跑。
// （HMR 后旧闭包仍在跑旧代码属可接受的开发期折衷，僵尸恢复可兜底。）
const g = globalThis as typeof globalThis & { __transcribeRunner?: Runner };

export function getTranscribeRunner(): Runner {
  g.__transcribeRunner ??= createRunner({ processWork: runTranscribeWorkflow });
  return g.__transcribeRunner;
}
