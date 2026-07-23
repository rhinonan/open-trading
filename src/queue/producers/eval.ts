// src/queue/producers/eval.ts
import { db, type Db } from "@/db";
import { works } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getEvalQueue } from "@/queue/queues";
import {
  enqueueForEvaluation,
  enqueueReevaluation,
} from "@/services/douyin/eval-queue";
import { setWorkProgress } from "@/services/douyin/pipeline-progress";

/** 将指定作品（已 mark pending）加入评判队列 */
export async function enqueueEvalJobs(
  workIds: number[],
  dbi: Db = db,
): Promise<number> {
  if (workIds.length === 0) return 0;
  const unique = [...new Set(workIds)];
  for (const id of unique) {
    await setWorkProgress(id, "queued", 0, { dbi });
  }
  await getEvalQueue().addBulk(
    unique.map((workId) => ({
      name: "eval",
      data: { workId },
      opts: { jobId: `eval:${workId}` },
    })),
  );
  return unique.length;
}

/** DB 侧入队（none/failed→pending）后 bulk 加 Bull job */
export async function enqueueEvalFromDb(opts?: {
  workIds?: number[];
  bloggerId?: number;
  includeReeval?: boolean;
  dbi?: Db;
}): Promise<{ marked: number; reeval: number; jobs: number }> {
  const dbi = opts?.dbi ?? db;
  const marked = enqueueForEvaluation(
    { workIds: opts?.workIds, bloggerId: opts?.bloggerId },
    dbi,
  );
  let reeval = 0;
  if (opts?.includeReeval) {
    reeval = enqueueReevaluation(dbi);
  }

  const conds = [eq(works.evalStatus, "pending")];
  if (opts?.workIds) conds.push(inArray(works.id, opts.workIds));
  if (opts?.bloggerId != null) conds.push(eq(works.bloggerId, opts.bloggerId));

  // 若只 mark 了部分，取全部 pending 更稳；单作品/博主用过滤
  const rows = await dbi
    .select({ id: works.id })
    .from(works)
    .where(and(...conds))
    .all();

  const jobs = await enqueueEvalJobs(
    rows.map((r) => r.id),
    dbi,
  );
  return { marked, reeval, jobs };
}

/** 单作品评判 */
export async function enqueueEvalWork(
  workId: number,
  dbi: Db = db,
): Promise<{ success: boolean; error?: string }> {
  const row = await dbi
    .select()
    .from(works)
    .where(eq(works.id, workId))
    .get();
  if (!row) return { success: false, error: "作品不存在" };
  if (row.transcriptStatus !== "done") {
    return { success: false, error: "需先完成转写" };
  }
  if (row.evalStatus === "processing") {
    return { success: false, error: "该作品正在评判中" };
  }
  const n = enqueueForEvaluation({ workIds: [workId] }, dbi);
  if (n === 0 && row.evalStatus !== "pending") {
    // 已 done 允许重评：强制 pending
    await dbi
      .update(works)
      .set({ evalStatus: "pending", evalClaimedAt: null })
      .where(eq(works.id, workId));
  }
  await enqueueEvalJobs([workId], dbi);
  return { success: true };
}
