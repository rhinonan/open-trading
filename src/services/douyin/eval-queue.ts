// src/services/douyin/eval-queue.ts
// 评判队列：复用转写队列的原子认领+僵尸恢复模式。
// 队列位于 works 表：evalStatus 在 none/pending/processing/done/failed 间流转。
import { db, type Db } from "@/db";
import { works, predictionItems } from "@/db/schema";
import { and, asc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";

/** processing 超过该秒数视为僵尸，可被重捡 */
export const EVAL_STALE_SECONDS = 15 * 60;

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

/** 批量入队：将 transcript='done' 且 evalStatus ∈ {none,failed} 的作品设为 pending */
export function enqueueForEvaluation(
  opts?: { workIds?: number[]; bloggerId?: number },
  dbi: Db = db,
): number {
  const conds: (SQL | undefined)[] = [eq(works.transcriptStatus, "done")];
  conds.push(or(eq(works.evalStatus, "none"), eq(works.evalStatus, "failed")));
  if (opts?.workIds) {
    conds.push(inArray(works.id, opts.workIds));
  }
  if (opts?.bloggerId) {
    conds.push(eq(works.bloggerId, opts.bloggerId));
  }
  const res = dbi
    .update(works)
    .set({ evalStatus: "pending", evalClaimedAt: null })
    .where(and(...conds))
    .run();
  return res.changes;
}

/** 到期重评入队：查找 judgment='not_yet' 且 verifiableAfter <= today 的作品，将 evalStatus='done' 重置为 pending */
export function enqueueReevaluation(dbi: Db = db): number {
  const rows = dbi
    .selectDistinct({ workId: predictionItems.workId })
    .from(predictionItems)
    .where(
      and(
        eq(predictionItems.judgment, "not_yet"),
        sql`${predictionItems.verifiableAfter} <= date('now')`,
      ),
    )
    .all();

  const workIds = rows
    .map((r) => r.workId)
    .filter((id): id is number => id != null);

  if (workIds.length === 0) return 0;

  const res = dbi
    .update(works)
    .set({ evalStatus: "pending", evalClaimedAt: null })
    .where(
      and(inArray(works.id, workIds), eq(works.evalStatus, "done")),
    )
    .run();
  return res.changes;
}

export interface ClaimedEvalWork {
  id: number;
  awemeId: string;
  desc: string;
  transcript: string | null;
  opinionSummary: string;
  publishedAt: number;
  bloggerId: number;
}

/** 原子认领下一条待评判；队列空返回 null */
export function claimNextEval(
  dbi: Db = db,
  now: number = nowEpoch(),
): ClaimedEvalWork | null {
  while (true) {
    const candidate = dbi
      .select({
        id: works.id,
        awemeId: works.awemeId,
        desc: works.desc,
        transcript: works.transcript,
        opinionSummary: works.opinionSummary,
        publishedAt: works.publishedAt,
        bloggerId: works.bloggerId,
      })
      .from(works)
      .where(eq(works.evalStatus, "pending"))
      .orderBy(asc(works.scannedAt))
      .limit(1)
      .get();
    if (!candidate) return null;

    const res = dbi
      .update(works)
      .set({ evalStatus: "processing", evalClaimedAt: now })
      .where(
        and(eq(works.id, candidate.id), eq(works.evalStatus, "pending")),
      )
      .run();
    if (res.changes === 1) return candidate;
  }
}

/** 僵尸恢复：将超时或历史遗留无 evalClaimedAt 的 processing 重置回 pending */
export function recoverStaleEval(
  dbi: Db = db,
  now: number = nowEpoch(),
): number {
  const cutoff = now - EVAL_STALE_SECONDS;
  const res = dbi
    .update(works)
    .set({ evalStatus: "pending", evalClaimedAt: null })
    .where(
      and(
        eq(works.evalStatus, "processing"),
        or(isNull(works.evalClaimedAt), lt(works.evalClaimedAt, cutoff)),
      ),
    )
    .run();
  return res.changes;
}

/** 将指定作品标记为评判失败 */
export function markEvalFailed(workId: number, error?: string, dbi: Db = db): void {
  dbi
    .update(works)
    .set({ evalStatus: "failed", lastError: error || null })
    .where(eq(works.id, workId))
    .run();
}

/** 获取评判队列各状态计数（仅统计 transcript='done' 且有内容的作品） */
export function getEvalProgress(
  dbi: Db = db,
): Record<string, number> {
  const row = dbi
    .select({
      none: sql<number>`sum(case when ${works.evalStatus} = 'none' then 1 else 0 end)`,
      pending: sql<number>`sum(case when ${works.evalStatus} = 'pending' then 1 else 0 end)`,
      processing: sql<number>`sum(case when ${works.evalStatus} = 'processing' then 1 else 0 end)`,
      done: sql<number>`sum(case when ${works.evalStatus} = 'done' then 1 else 0 end)`,
      failed: sql<number>`sum(case when ${works.evalStatus} = 'failed' then 1 else 0 end)`,
      total: sql<number>`count(*)`,
    })
    .from(works)
    .where(
      and(
        eq(works.transcriptStatus, "done"),
        sql`${works.opinionSummary} != '' OR ${works.transcript} != ''`,
      ),
    )
    .get();
  return {
    none: Number(row?.none ?? 0),
    pending: Number(row?.pending ?? 0),
    processing: Number(row?.processing ?? 0),
    done: Number(row?.done ?? 0),
    failed: Number(row?.failed ?? 0),
    total: Number(row?.total ?? 0),
  };
}
