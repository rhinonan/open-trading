// src/services/douyin/processors/transcribe.ts
// 转写/图集编排：I/O 在 service 层；AI 仅调 extractOpinion*。
// 不再走多步 Mastra workflow。
import * as fs from "fs";
import { db, type Db } from "@/db";
import { works } from "@/db/schema";
import { eq } from "drizzle-orm";
import { downloadVideo } from "@/services/douyin/video-downloader";
import { extractAudio } from "@/services/douyin/audio-extractor";
import { downloadImages } from "@/services/douyin/image-downloader";
import {
  compressAudio,
  uploadToFileService,
  deleteFromFileService,
  submitAsrTask,
  pollAsrTask,
  fetchAsrTranscript,
} from "@/services/douyin/transcriber";
import {
  extractOpinion,
  extractOpinionFromImages,
} from "@/services/douyin/opinion-service";
import {
  markWorkDone,
  markWorkFailed,
  markWorkProcessing,
  setWorkProgress,
} from "@/services/douyin/pipeline-progress";
import { llmLog, llmLogError, startTimer } from "@/lib/llm-log";

export interface ProcessResult {
  ok: boolean;
  error?: string;
}

async function loadWork(workId: number, dbi: Db) {
  return dbi.select().from(works).where(eq(works.id, workId)).get();
}

/** ASR 轮询进度：60% → 85% 按 elapsed 线性插值 */
function asrPollProgress(elapsedMs: number, timeoutMs: number): number {
  const t = Math.min(1, elapsedMs / timeoutMs);
  return Math.round(60 + t * 25);
}

async function processVideoWork(
  work: typeof works.$inferSelect,
  dbi: Db,
): Promise<void> {
  const { id: workId, awemeId, videoUrl, duration, desc } = work;
  if (!videoUrl) {
    throw new Error("视频作品缺少下载地址（videoUrl 为空）");
  }

  await setWorkProgress(workId, "download_video", 5, { dbi });
  const videoPath = await downloadVideo(awemeId, videoUrl);

  let audioPath: string | undefined;
  let compressedPath: string | undefined;
  let fileId: string | undefined;

  try {
    await setWorkProgress(workId, "extract_audio", 20, { dbi });
    audioPath = await extractAudio(videoPath, awemeId);
    try {
      fs.unlinkSync(videoPath);
    } catch {
      /* ignore */
    }

    await setWorkProgress(workId, "compress_audio", 35, { dbi });
    if (!process.env.DASHSCOPE_API_KEY) {
      throw new Error(
        "ASR not configured. Set DASHSCOPE_API_KEY env var (阿里云百炼 API Key).",
      );
    }
    compressedPath = await compressAudio(audioPath);
    try {
      fs.unlinkSync(audioPath);
      audioPath = undefined;
    } catch {
      /* ignore */
    }

    await setWorkProgress(workId, "upload_audio", 45, { dbi });
    const uploaded = await uploadToFileService(compressedPath);
    fileId = uploaded.id;

    await setWorkProgress(workId, "asr_submit", 55, { dbi });
    const taskId = await submitAsrTask(uploaded.url);

    await setWorkProgress(workId, "asr_poll", 65, { dbi });
    const transcriptionUrl = await pollAsrTask(
      taskId,
      8 * 60_000,
      async ({ elapsedMs, timeoutMs }) => {
        await setWorkProgress(workId, "asr_poll", asrPollProgress(elapsedMs, timeoutMs), {
          dbi,
        });
      },
    );

    const transcript = await fetchAsrTranscript(transcriptionUrl);

    await setWorkProgress(workId, "opinion", 90, { dbi });
    const opinionSummary = await extractOpinion(transcript, desc);

    await setWorkProgress(workId, "save", 98, { dbi });
    await markWorkDone(workId, { transcript, opinionSummary }, dbi);
  } finally {
    if (fileId) await deleteFromFileService(fileId);
    for (const p of [compressedPath, audioPath, videoPath]) {
      if (!p) continue;
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

async function processImageWork(
  work: typeof works.$inferSelect,
  dbi: Db,
): Promise<void> {
  const { id: workId, awemeId, desc, imageUrls } = work;
  const parsedUrls: string[] = JSON.parse(imageUrls || "[]");

  await setWorkProgress(workId, "download_images", 15, { dbi });
  const imagePaths = await downloadImages(awemeId, parsedUrls);

  await setWorkProgress(workId, "opinion", 70, { dbi });
  const opinionSummary = await extractOpinionFromImages(desc, imagePaths);

  await setWorkProgress(workId, "save", 98, { dbi });
  await markWorkDone(workId, { transcript: null, opinionSummary }, dbi);
}

/**
 * 处理单条作品转写/图集分析。自身消化错误并回写 failed，不抛出（Worker 可再按 attempts 重试）。
 * 返回 ok=false 时由调用方决定是否 throw 以触发 Bull 重试。
 */
export async function processTranscribeWork(
  workId: number,
  opts?: { dbi?: Db; rethrow?: boolean },
): Promise<ProcessResult> {
  const dbi = opts?.dbi ?? db;
  const timer = startTimer();
  const work = await loadWork(workId, dbi);
  if (!work) {
    return { ok: false, error: "作品不存在" };
  }

  await markWorkProcessing(workId, dbi);
  llmLog("info", {
    event: "processor.transcribe.start",
    workId,
    awemeId: work.awemeId,
    mediaType: work.mediaType,
  });

  try {
    if (work.mediaType === 4) {
      await processVideoWork(work, dbi);
    } else if (work.mediaType === 2) {
      await processImageWork(work, dbi);
    } else {
      throw new Error(`未知 mediaType: ${work.mediaType}`);
    }
    llmLog("info", {
      event: "processor.transcribe.success",
      workId,
      awemeId: work.awemeId,
      latencyMs: timer.elapsedMs(),
    });
    return { ok: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    llmLogError({
      event: "processor.transcribe.failed",
      workId,
      awemeId: work.awemeId,
      latencyMs: timer.elapsedMs(),
      error: err,
    });
    await markWorkFailed(workId, errorMsg, dbi);
    if (opts?.rethrow) throw err;
    return { ok: false, error: errorMsg };
  }
}
