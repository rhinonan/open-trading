// src/services/douyin/works-service.ts
import { db } from "@/db";
import { works, bloggers, predictionItems } from "@/db/schema";
import { eq, desc, and, like, inArray, sql } from "drizzle-orm";
import { extractOpinion } from "@/services/douyin/opinion-service";
import { startTranscribeWork } from "@/services/douyin/pipeline-service";
import { enqueueEvalWork } from "@/queue/producers/eval";
import { ensureSchedulerStarted } from "@/services/scheduler";
import type {
  WorkWithBlogger,
  WorksFilter,
  WorksResponse,
  TranscriptStatus,
  JudgmentResult,
  WorkJudgment,
} from "@/types";

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 200;

export async function queryWorks(
  filter: WorksFilter
): Promise<WorksResponse> {
  const page = Math.max(0, filter.page ?? 0);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, filter.perPage ?? DEFAULT_PER_PAGE));

  // 构建 where 条件
  const conditions: ReturnType<typeof eq>[] = [];

  if (filter.bloggerSlugs && filter.bloggerSlugs.length > 0) {
    // 先查出 blogger IDs
    const matched = db
      .select({ id: bloggers.id })
      .from(bloggers)
      .where(inArray(bloggers.slug, filter.bloggerSlugs))
      .all();
    const ids = matched.map((r) => r.id);
    if (ids.length === 0) {
      return { works: [], total: 0, page, perPage, filterCounts: { transcriptStatus: {}, judgment: {} } };
    }
    conditions.push(inArray(works.bloggerId, ids));
  }

  if (filter.transcriptStatus) {
    conditions.push(eq(works.transcriptStatus, filter.transcriptStatus as TranscriptStatus));
  }

  if (filter.search) {
    conditions.push(like(works.desc, `%${filter.search}%`));
  }

  // judgement 过滤通过子查询实现（在下面处理）

  // 查询总数
  const baseQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(works)
    .where(and(...conditions));

  // judgement 过滤：通过 prediction_items 子查询
  // "none" 特殊处理：evalStatus='none' 且无 prediction_items 记录
  let totalQuery: { get: () => { count: number } | undefined };
  if (filter.judgment === "none") {
    totalQuery = db
      .select({ count: sql<number>`count(distinct ${works.id})` })
      .from(works)
      .leftJoin(predictionItems, eq(works.id, predictionItems.workId))
      .where(and(...conditions, sql`${predictionItems.id} IS NULL`));
  } else if (filter.judgment) {
    totalQuery = db
      .select({ count: sql<number>`count(distinct ${works.id})` })
      .from(works)
      .leftJoin(predictionItems, eq(works.id, predictionItems.workId))
      .where(
        and(
          ...conditions,
          eq(predictionItems.judgment, filter.judgment as JudgmentResult)
        )
      );
  } else {
    totalQuery = baseQuery;
  }
  const totalRow = totalQuery.get();
  const total = totalRow?.count ?? 0;

  // 查询数据
  const rows = db
    .select({
      id: works.id,
      awemeId: works.awemeId,
      desc: works.desc,
      coverUrl: works.coverUrl,
      shareUrl: works.shareUrl,
      mediaType: works.mediaType,
      duration: works.duration,
      statistics: works.statistics,
      publishedAt: works.publishedAt,
      transcriptStatus: works.transcriptStatus,
      transcript: works.transcript,
      opinionSummary: works.opinionSummary,
      imageUrls: works.imageUrls,
      bloggerId: works.bloggerId,
      // blogger fields
      bloggerNickname: bloggers.nickname,
      bloggerSlug: bloggers.slug,
      bloggerAvatarUrl: bloggers.avatarUrl,
      bloggerFollowerCount: bloggers.followerCount,
      // judgment fields (may be null for unjudged works)
      evalStatus: works.evalStatus,
      judgmentResult: predictionItems.judgment,
      judgmentContent: predictionItems.predictedContent,
    })
    .from(works)
    .innerJoin(bloggers, eq(works.bloggerId, bloggers.id))
    .leftJoin(predictionItems, eq(works.id, predictionItems.workId))
    .where(
      filter.judgment === "none"
        ? and(...conditions, sql`${predictionItems.id} IS NULL`)
        : filter.judgment
          ? and(
              ...conditions,
              eq(predictionItems.judgment, filter.judgment as JudgmentResult)
            )
          : and(...conditions)
    )
    // Dedup: LEFT JOIN on predictionItems can yield multiple rows per work;
    // SQLite picks one joined row per group, keeping pagination correct.
    .groupBy(works.id)
    .orderBy(desc(works.publishedAt))
    .limit(perPage)
    .offset(page * perPage)
    .all();

  // 批量取判断聚合（避免 N+1）
  const workIds = rows.map((r) => r.id);
  const aggMap = new Map<number, WorkJudgment>();
  if (workIds.length > 0) {
    const aggRows = db
      .select({
        workId: predictionItems.workId,
        evaluable: sql<number>`count(case when ${predictionItems.judgment} in ('correct','mostly_correct','incorrect') then 1 end)`,
        correct: sql<number>`count(case when ${predictionItems.judgment} = 'correct' then 1 end)`,
        mostlyCorrect: sql<number>`count(case when ${predictionItems.judgment} = 'mostly_correct' then 1 end)`,
        incorrect: sql<number>`count(case when ${predictionItems.judgment} = 'incorrect' then 1 end)`,
        notYet: sql<number>`count(case when ${predictionItems.judgment} = 'not_yet' then 1 end)`,
        notApplicable: sql<number>`count(case when ${predictionItems.judgment} = 'not_applicable' then 1 end)`,
      })
      .from(predictionItems)
      .where(inArray(predictionItems.workId, workIds))
      .groupBy(predictionItems.workId)
      .all();
    for (const a of aggRows) {
      aggMap.set(a.workId, {
        evalStatus: "done" as const,
        evaluable: Number(a.evaluable ?? 0),
        correct: Number(a.correct ?? 0),
        mostlyCorrect: Number(a.mostlyCorrect ?? 0),
        incorrect: Number(a.incorrect ?? 0),
        notYet: Number(a.notYet ?? 0),
        notApplicable: Number(a.notApplicable ?? 0),
        latestItem: null,
      });
    }
  }

  const enriched: WorkWithBlogger[] = rows.map((row) => ({
    id: row.id,
    awemeId: row.awemeId,
    desc: row.desc,
    coverUrl: row.coverUrl,
    shareUrl: row.shareUrl ?? "",
    mediaType: row.mediaType,
    duration: row.duration,
    statistics: row.statistics,
    publishedAt: row.publishedAt,
    transcriptStatus: row.transcriptStatus,
    transcript: row.transcript,
    opinionSummary: row.opinionSummary ?? "",
    imageUrls: row.imageUrls ?? "[]",
    blogger: {
      id: row.bloggerId,
      nickname: row.bloggerNickname,
      slug: row.bloggerSlug,
      avatarUrl: row.bloggerAvatarUrl,
      followerCount: row.bloggerFollowerCount ?? 0,
    },
    judgment: (() => {
      const agg = aggMap.get(row.id);
      const latestItem = row.judgmentResult
        ? { judgment: row.judgmentResult, predictedContent: row.judgmentContent ?? "" }
        : null;
      if (agg) {
        agg.latestItem = latestItem;
        agg.evalStatus = (row.evalStatus ?? "none") as WorkJudgment["evalStatus"];
        return agg;
      }
      if (latestItem) {
        return {
          evalStatus: (row.evalStatus ?? "none") as WorkJudgment["evalStatus"],
          evaluable: 0, correct: 0, mostlyCorrect: 0, incorrect: 0,
          notYet: 0, notApplicable: 0,
          latestItem,
        };
      }
      return null;
    })(),
  }));

  // 计算 filter counts
  const transcriptCounts: Record<string, number> = {};
  const transcriptRows = db
    .select({
      status: works.transcriptStatus,
      count: sql<number>`count(*)`,
    })
    .from(works)
    .groupBy(works.transcriptStatus)
    .all() as Array<{ status: string; count: number }>;
  for (const r of transcriptRows) {
    transcriptCounts[r.status] = r.count;
  }

  const judgmentCounts: Record<string, number> = {};
  const judgmentRows = db
    .select({
      judgment: predictionItems.judgment,
      count: sql<number>`count(*)`,
    })
    .from(predictionItems)
    .groupBy(predictionItems.judgment)
    .all() as Array<{ judgment: string; count: number }>;
  for (const r of judgmentRows) {
    judgmentCounts[r.judgment] = r.count;
  }

  return {
    works: enriched,
    total,
    page,
    perPage,
    filterCounts: {
      transcriptStatus: transcriptCounts,
      judgment: judgmentCounts,
    },
  };
}

export async function summarizeWork(workId: number): Promise<{ success: boolean; error?: string; summary?: string }> {
  const work = db
    .select({
      id: works.id,
      transcript: works.transcript,
      transcriptStatus: works.transcriptStatus,
    })
    .from(works)
    .where(eq(works.id, workId))
    .get();

  if (!work) {
    return { success: false, error: "作品不存在" };
  }

  if (work.transcriptStatus !== "done" || !work.transcript) {
    return { success: false, error: "请先转写该作品" };
  }

  try {
    const summary = await extractOpinion(work.transcript);
    db.update(works)
      .set({ opinionSummary: summary })
      .where(eq(works.id, workId))
      .run();
    return { success: true, summary };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "观点提取失败",
    };
  }
}

export async function batchOperate(
  workIds: number[],
  action: "transcribe" | "summarize" | "evaluate"
): Promise<{ total: number; succeeded: number; failed: number; errors: Array<{ workId: number; error: string }> }> {
  ensureSchedulerStarted();
  const errors: Array<{ workId: number; error: string }> = [];
  let succeeded = 0;

  if (action === "evaluate") {
    for (const workId of workIds) {
      const r = await enqueueEvalWork(workId);
      if (r.success) succeeded++;
      else errors.push({ workId, error: r.error ?? "不满足评判条件" });
    }
    return { total: workIds.length, succeeded, failed: errors.length, errors };
  }

  for (const workId of workIds) {
    let result: { success: boolean; error?: string };
    if (action === "transcribe") {
      result = await startTranscribeWork(workId);
    } else {
      result = await summarizeWork(workId);
    }

    if (result.success) {
      succeeded++;
    } else {
      errors.push({ workId, error: result.error ?? "未知错误" });
    }
  }

  return {
    total: workIds.length,
    succeeded,
    failed: errors.length,
    errors,
  };
}

export async function summarizeBloggerWorks(
  bloggerId: number
): Promise<{ total: number; succeeded: number; failed: number }> {
  const pendingWorks = db
    .select({
      id: works.id,
      transcript: works.transcript,
      transcriptStatus: works.transcriptStatus,
    })
    .from(works)
    .where(
      and(
        eq(works.bloggerId, bloggerId),
        eq(works.transcriptStatus, "done"),
        eq(works.opinionSummary, "")
      )
    )
    .all() as Array<{ id: number; transcript: string | null; transcriptStatus: string }>;

  let succeeded = 0;
  let failed = 0;

  for (const w of pendingWorks) {
    if (!w.transcript) {
      failed++;
      continue;
    }
    try {
      const summary = await extractOpinion(w.transcript);
      db.update(works)
        .set({ opinionSummary: summary })
        .where(eq(works.id, w.id))
        .run();
      succeeded++;
    } catch {
      failed++;
    }
  }

  return { total: pendingWorks.length, succeeded, failed };
}
