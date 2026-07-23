// src/services/douyin/pipeline-progress.ts
// 管线分环节进度：写 works.pipeline_* 字段，供前端轮询展示
import { db, type Db } from "@/db";
import { works } from "@/db/schema";
import { eq } from "drizzle-orm";

/** 视频转写 / 图集分析共用 stage 枚举 */
export type PipelineStage =
  | "queued"
  | "download_video"
  | "extract_audio"
  | "compress_audio"
  | "upload_audio"
  | "asr_submit"
  | "asr_poll"
  | "download_images"
  | "opinion"
  | "save"
  | "done"
  | "failed"
  | "evaluating";

const STAGE_LABELS: Record<PipelineStage, string> = {
  queued: "排队中",
  download_video: "下载视频",
  extract_audio: "提取音频",
  compress_audio: "压缩音频",
  upload_audio: "上传音频",
  asr_submit: "提交识别",
  asr_poll: "识别中",
  download_images: "下载图片",
  opinion: "提取观点",
  save: "保存结果",
  done: "完成",
  failed: "失败",
  evaluating: "评判中",
};

export function stageLabel(stage: PipelineStage): string {
  return STAGE_LABELS[stage] ?? stage;
}

export async function setWorkProgress(
  workId: number,
  stage: PipelineStage,
  progress: number,
  opts?: { label?: string; dbi?: Db },
): Promise<void> {
  const dbi = opts?.dbi ?? db;
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const label = opts?.label ?? stageLabel(stage);
  await dbi
    .update(works)
    .set({
      pipelineStage: stage,
      pipelineProgress: pct,
      pipelineStageLabel: label,
    })
    .where(eq(works.id, workId));
}

/** 入队时：pending + queued 0% */
export async function markWorkQueued(
  workId: number,
  dbi: Db = db,
): Promise<void> {
  await dbi
    .update(works)
    .set({
      transcriptStatus: "pending",
      claimedAt: null,
      pipelineStage: "queued",
      pipelineProgress: 0,
      pipelineStageLabel: stageLabel("queued"),
      lastError: "",
    })
    .where(eq(works.id, workId));
}

export async function markWorkProcessing(
  workId: number,
  dbi: Db = db,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbi
    .update(works)
    .set({
      transcriptStatus: "processing",
      claimedAt: now,
    })
    .where(eq(works.id, workId));
}

export async function markWorkDone(
  workId: number,
  data: { transcript: string | null; opinionSummary: string },
  dbi: Db = db,
): Promise<void> {
  await dbi
    .update(works)
    .set({
      transcript: data.transcript,
      opinionSummary: data.opinionSummary,
      transcriptStatus: "done",
      pipelineStage: "done",
      pipelineProgress: 100,
      pipelineStageLabel: stageLabel("done"),
      lastError: "",
    })
    .where(eq(works.id, workId));
}

export async function markWorkFailed(
  workId: number,
  error: string,
  dbi: Db = db,
): Promise<void> {
  await dbi
    .update(works)
    .set({
      transcriptStatus: "failed",
      pipelineStage: "failed",
      pipelineStageLabel: stageLabel("failed"),
      lastError: error || null,
    })
    .where(eq(works.id, workId));
}
