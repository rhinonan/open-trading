// src/services/douyin/pipeline-queue.ts
// works 表即转写任务队列：pending → processing(claimedAt) → done/failed。
// 认领靠一条原子 UPDATE（better-sqlite3 单写者 + WAL，天然串行化），
// 僵尸恢复兜住「进程中途挂掉导致 processing 卡死」的情况。
import { db, type Db } from "@/db";
import { works } from "@/db/schema";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";

/** processing 超过该秒数视为僵尸，可被重捡 */
export const STALE_CLAIM_SECONDS = 15 * 60;

export interface ClaimedWork {
  id: number;
  awemeId: string;
  videoUrl: string | null;
  duration: number;
  desc: string;
  /** 媒体类型：2=图集, 4=视频 */
  mediaType: number;
  /** 图集图片 URL 列表（JSON 数组字符串） */
  imageUrls: string;
}

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

/** 原子认领下一条 pending（scannedAt 最早优先）；队列空返回 null */
export function claimNextPending(
  dbi: Db = db,
  now: number = nowEpoch()
): ClaimedWork | null {
  // 认领失败（被并发 worker 抢走）时循环取下一条
  while (true) {
    const candidate = dbi
      .select({
        id: works.id,
        awemeId: works.awemeId,
        videoUrl: works.videoUrl,
        duration: works.duration,
        desc: works.desc,
        mediaType: works.mediaType,
        imageUrls: works.imageUrls,
      })
      .from(works)
      .where(eq(works.transcriptStatus, "pending"))
      .orderBy(asc(works.scannedAt))
      .limit(1)
      .get();
    if (!candidate) return null;

    const res = dbi
      .update(works)
      .set({ transcriptStatus: "processing", claimedAt: now })
      .where(
        and(eq(works.id, candidate.id), eq(works.transcriptStatus, "pending"))
      )
      .run();
    if (res.changes === 1) return candidate;
  }
}

/** 将超时（或历史遗留无 claimedAt）的 processing 重置回 pending，返回条数 */
export function recoverStaleProcessing(
  dbi: Db = db,
  now: number = nowEpoch()
): number {
  const cutoff = now - STALE_CLAIM_SECONDS;
  const res = dbi
    .update(works)
    .set({ transcriptStatus: "pending", claimedAt: null })
    .where(
      and(
        eq(works.transcriptStatus, "processing"),
        or(isNull(works.claimedAt), lt(works.claimedAt, cutoff))
      )
    )
    .run();
  return res.changes;
}

/** 把某博主的 failed 作品重置为 pending（单博主转写的重试语义），返回条数 */
export function resetFailedForBlogger(bloggerId: number, dbi: Db = db): number {
  const res = dbi
    .update(works)
    .set({ transcriptStatus: "pending", claimedAt: null })
    .where(
      and(eq(works.bloggerId, bloggerId), eq(works.transcriptStatus, "failed"))
    )
    .run();
  return res.changes;
}

/** 单作品入队：processing 中的不重复入队，其余状态一律重置为 pending（重转语义） */
export function enqueueWork(
  workId: number,
  dbi: Db = db
): { queued: boolean; reason?: string } {
  const row = dbi
    .select({
      id: works.id,
      transcriptStatus: works.transcriptStatus,
    })
    .from(works)
    .where(eq(works.id, workId))
    .get();
  if (!row) return { queued: false, reason: "作品不存在" };
  if (row.transcriptStatus === "processing")
    return { queued: false, reason: "该作品正在转写中" };

  dbi
    .update(works)
    .set({ transcriptStatus: "pending", claimedAt: null })
    .where(eq(works.id, workId))
    .run();
  return { queued: true };
}

export function countByStatus(
  status: "pending" | "processing",
  bloggerId?: number,
  dbi: Db = db
): number {
  const conds = [eq(works.transcriptStatus, status)];
  if (bloggerId !== undefined) conds.push(eq(works.bloggerId, bloggerId));
  const row = dbi
    .select({ count: sql<number>`count(*)` })
    .from(works)
    .where(and(...conds))
    .get();
  return row?.count ?? 0;
}

export function markWorkFailed(workId: number, error?: string, dbi: Db = db): void {
  dbi
    .update(works)
    .set({ transcriptStatus: "failed", lastError: error || null })
    .where(eq(works.id, workId))
    .run();
}
