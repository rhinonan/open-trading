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
import { llmLog, llmLogError, startTimer } from "@/lib/llm-log";

const CONCURRENCY = 2;
const TRANSCRIBE_WORKFLOW_ID = "transcribeWorkWorkflow" as const;
const ANALYZE_IMAGE_WORKFLOW_ID = "analyzeImageWorkflow" as const;

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
        llmLogError({
          event: "runner.work.unhandled",
          workflowId: TRANSCRIBE_WORKFLOW_ID,
          workId: claimed.id,
          awemeId: claimed.awemeId,
          error: err,
        });
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
      .catch((err) =>
        llmLogError({
          event: "runner.loop.crashed",
          workflowId: TRANSCRIBE_WORKFLOW_ID,
          error: err,
        }),
      )
      .finally(() => {
        running = false;
        if (wake) kick();
      });
  }

  return { kick, isRunning: () => running };
}

/** 非 success 的 workflow 运行结果 → 提取错误信息（两条分派路径共用） */
function workflowErrorMessage(result: {
  status: string;
  error?: unknown;
}): string {
  return result.status === "failed"
    ? result.error instanceof Error
      ? result.error.message
      : String(result.error)
    : `workflow ended with status: ${result.status}`;
}

/** 真实任务执行：按 mediaType 分派——视频(4)走转写 workflow，图集(2)走图片分析 workflow；
 *  自身消化所有错误（失败回写 DB），不抛出 */
async function runTranscribeWorkflow(work: ClaimedWork): Promise<void> {
  const { id, awemeId, videoUrl, duration, desc, mediaType, imageUrls } = work;
  const timer = startTimer();
  let runId: string | undefined;
  let workflowId: typeof TRANSCRIBE_WORKFLOW_ID | typeof ANALYZE_IMAGE_WORKFLOW_ID = TRANSCRIBE_WORKFLOW_ID;
  try {
    if (mediaType === 4) {
      // 视频：走现有转写 workflow；缺下载地址视为失败（而非误入图集分支）
      if (!videoUrl) {
        throw new Error("视频作品缺少下载地址（videoUrl 为空）");
      }
      workflowId = TRANSCRIBE_WORKFLOW_ID;
      const run = await mastra.getWorkflow(workflowId).createRun();
      runId = run.runId;
      llmLog("info", {
        event: "workflow.run.start",
        workflowId,
        runId,
        workId: id,
        awemeId,
      });
      const result = await run.start({
        inputData: { workId: id, awemeId, videoUrl, duration, desc },
      });
      if (result.status !== "success") {
        throw new Error(workflowErrorMessage(result));
      }
      // done 状态与 transcript/opinionSummary 由 workflow 末步回写 DB
      llmLog("info", {
        event: "workflow.run.success",
        workflowId,
        runId,
        workId: id,
        awemeId,
        latencyMs: timer.elapsedMs(),
        status: "success",
      });
    } else if (mediaType === 2) {
      // 图集：走图片分析 workflow（imageUrls 列存 JSON 数组字符串，解析后传入）
      const parsedUrls: string[] = JSON.parse(imageUrls || "[]");
      workflowId = ANALYZE_IMAGE_WORKFLOW_ID;
      const run = await mastra.getWorkflow(workflowId).createRun();
      runId = run.runId;
      llmLog("info", {
        event: "workflow.run.start",
        workflowId,
        runId,
        workId: id,
        awemeId,
      });
      const result = await run.start({
        inputData: { workId: id, awemeId, desc, imageUrls: parsedUrls },
      });
      if (result.status !== "success") {
        throw new Error(workflowErrorMessage(result));
      }
      llmLog("info", {
        event: "workflow.run.success",
        workflowId,
        runId,
        workId: id,
        awemeId,
        latencyMs: timer.elapsedMs(),
        status: "success",
      });
    } else {
      // 未知媒体类型：显式失败，避免误路由或卡死在 processing
      throw new Error(`未知 mediaType: ${mediaType}`);
    }
  } catch (err) {
    llmLogError({
      event: "workflow.run.failed",
      workflowId,
      runId,
      workId: id,
      awemeId,
      latencyMs: timer.elapsedMs(),
      error: err,
    });
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
