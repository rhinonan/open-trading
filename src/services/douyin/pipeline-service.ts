// src/services/douyin/pipeline-service.ts
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import { downloadVideo } from "./video-downloader";
import { extractAudio } from "./audio-extractor";
import { transcribeAudio } from "./transcriber";

// ============================================================
// 类型
// ============================================================

interface PipelineConfig {
  concurrency: number;
  maxTasks: number;
}

interface WorkRow {
  id: number;
  awemeId: string;
  videoUrl: string | null;
  duration: number;
}

interface TaskResult {
  awemeId: string;
  status: "done" | "failed";
  transcript?: string;
  error?: string;
}

interface PipelineResult {
  total: number;
  done: number;
  failed: number;
  results: TaskResult[];
}

// ============================================================
// 信号量
// ============================================================

class Semaphore {
  private available: number;
  private queue: Array<() => void> = [];

  constructor(count: number) {
    this.available = count;
  }

  acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.available--;
        resolve();
      });
    });
  }

  release(): void {
    this.available++;
    const next = this.queue.shift();
    if (next) next();
  }
}

// ============================================================
// 单任务处理
// ============================================================

async function processOneWork(row: WorkRow): Promise<TaskResult> {
  const { id, awemeId, videoUrl, duration } = row;

  const logPrefix = `[${awemeId}]`;
  console.log(`${logPrefix} 开始处理 (duration=${duration}ms)`);

  try {
    // 1. 检查 video_url
    if (!videoUrl) {
      throw new Error("No video_url stored for this work");
    }

    // 2. 更新状态为 processing
    db.update(works)
      .set({ transcriptStatus: "processing" })
      .where(eq(works.id, id))
      .run();

    // 3. 下载视频
    console.log(`${logPrefix} 开始下载视频...`);
    const videoPath = await downloadVideo(awemeId, videoUrl);
    console.log(`${logPrefix} 视频下载完成 → ${videoPath}`);

    // 4. 提取音频
    console.log(`${logPrefix} 开始提取音频...`);
    const audioPath = await extractAudio(videoPath, awemeId);
    console.log(`${logPrefix} 音频提取完成 → ${audioPath}`);

    // 5. ASR 转写
    // duration=0 means unknown — default to LFASR (long audio) to be safe
    const effectiveDuration = duration > 0 ? duration : 61_000;
    const method = effectiveDuration / 1000 <= 60 ? "IAT (短音频)" : "LFASR (长音频)";
    console.log(`${logPrefix} 开始语音转写 (${method}, duration=${effectiveDuration}ms)...`);
    const transcript = await transcribeAudio(audioPath, effectiveDuration);
    console.log(`${logPrefix} 语音转写完成 → ${transcript.length} 字符`);

    // 6. 回写 DB
    db.update(works)
      .set({
        transcript,
        transcriptStatus: "done",
      })
      .where(eq(works.id, id))
      .run();

    console.log(`${logPrefix} ✅ 全部完成`);
    return { awemeId, status: "done", transcript };
  } catch (err) {
    // 失败回写
    const errorMsg =
      err instanceof Error ? err.message : String(err);
    console.error(`${logPrefix} ❌ 失败: ${errorMsg}`);
    try {
      db.update(works)
        .set({ transcriptStatus: "failed" })
        .where(eq(works.id, id))
        .run();
    } catch (dbErr) {
      console.error(`Failed to update status for work ${awemeId}:`, dbErr);
    }

    return { awemeId, status: "failed", error: errorMsg };
  }
}

// ============================================================
// 公开入口
// ============================================================

export async function transcribePendingWorks(
  config?: Partial<PipelineConfig>
): Promise<PipelineResult> {
  const concurrency = config?.concurrency ?? 2;
  const maxTasks = config?.maxTasks ?? 20;

  // 查待处理任务
  const pending = db
    .select({
      id: works.id,
      awemeId: works.awemeId,
      videoUrl: works.videoUrl,
      duration: works.duration,
    })
    .from(works)
    .where(
      inArray(works.transcriptStatus, ["pending", "processing"])
    )
    .orderBy(asc(works.scannedAt))
    .limit(maxTasks)
    .all() as WorkRow[];

  console.log(`[pipeline] 待处理: ${pending.length} 条, 并发: ${concurrency}`);
  if (pending.length === 0) {
    return { total: 0, done: 0, failed: 0, results: [] };
  }

  const sem = new Semaphore(concurrency);
  const results: TaskResult[] = [];

  const tasks = pending.map((row) => async () => {
    await sem.acquire();
    try {
      const result = await processOneWork(row);
      results.push(result);
    } finally {
      sem.release();
    }
  });

  await Promise.all(tasks.map((t) => t()));

  const done = results.filter((r) => r.status === "done").length;
  const failed = results.filter((r) => r.status === "failed").length;
  console.log(`[pipeline] 完成: done=${done}, failed=${failed}, total=${results.length}`);

  return {
    total: results.length,
    done,
    failed,
    results,
  };
}
