// src/queue/producers/transcribe.ts
import { db, type Db } from "@/db";
import { works } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getTranscribeQueue } from "@/queue/queues";
import {
  markWorkQueued,
  stageLabel,
} from "@/services/douyin/pipeline-progress";
import { resetFailedForBlogger } from "@/services/douyin/pipeline-queue";

export interface EnqueueTranscribeResult {
  accepted: true;
  queued: number;
  pending: number;
  processing: number;
}

async function countStatus(
  status: "pending" | "processing",
  bloggerId?: number,
  dbi: Db = db,
): Promise<number> {
  const { sql } = await import("drizzle-orm");
  const conds = [eq(works.transcriptStatus, status)];
  if (bloggerId !== undefined) conds.push(eq(works.bloggerId, bloggerId));
  const row = await dbi
    .select({ count: sql<number>`count(*)` })
    .from(works)
    .where(and(...conds))
    .get();
  return Number(row?.count ?? 0);
}

/** 单作品入队（重转：非 processing 均可） */
export async function enqueueTranscribeWork(
  workId: number,
  dbi: Db = db,
): Promise<{ success: boolean; error?: string }> {
  const row = await dbi
    .select({ id: works.id, transcriptStatus: works.transcriptStatus })
    .from(works)
    .where(eq(works.id, workId))
    .get();
  if (!row) return { success: false, error: "作品不存在" };
  if (row.transcriptStatus === "processing") {
    return { success: false, error: "该作品正在转写中" };
  }

  await markWorkQueued(workId, dbi);
  try {
    await getTranscribeQueue().add(
      "transcribe",
      { workId },
      { jobId: `transcribe-${workId}` },
    );
  } catch (err) {
    // jobId 已存在（仍在队列/完成未清理）时：用新 jobId 再试
    const msg = err instanceof Error ? err.message : String(err);
    if (/already exists|JobId/i.test(msg)) {
      await getTranscribeQueue().add(
        "transcribe",
        { workId },
        { jobId: `transcribe-${workId}-${Date.now()}` },
      );
    } else {
      throw err;
    }
  }
  return { success: true };
}

/** 将 pending 作品 bulk 入 Bull（可选 blogger / 重置 failed） */
export async function enqueuePendingTranscribes(opts?: {
  bloggerId?: number;
  resetFailed?: boolean;
  dbi?: Db;
}): Promise<EnqueueTranscribeResult> {
  const dbi = opts?.dbi ?? db;
  if (opts?.resetFailed && opts.bloggerId != null) {
    resetFailedForBlogger(opts.bloggerId, dbi);
  }

  const conds = [eq(works.transcriptStatus, "pending")];
  if (opts?.bloggerId != null) conds.push(eq(works.bloggerId, opts.bloggerId));

  const rows = await dbi
    .select({ id: works.id })
    .from(works)
    .where(and(...conds))
    .all();

  // 标记 queued 进度
  if (rows.length > 0) {
    await dbi
      .update(works)
      .set({
        pipelineStage: "queued",
        pipelineProgress: 0,
        pipelineStageLabel: stageLabel("queued"),
      })
      .where(
        inArray(
          works.id,
          rows.map((r) => r.id),
        ),
      );
  }

  if (rows.length > 0) {
    await getTranscribeQueue().addBulk(
      rows.map((r) => ({
        name: "transcribe",
        data: { workId: r.id },
        opts: { jobId: `transcribe-${r.id}` },
      })),
    );
  }

  return {
    accepted: true,
    queued: rows.length,
    pending: await countStatus("pending", opts?.bloggerId, dbi),
    processing: await countStatus("processing", opts?.bloggerId, dbi),
  };
}
