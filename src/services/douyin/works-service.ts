// src/services/douyin/works-service.ts
import { db } from "@/db";
import { works, bloggers, predictionItems } from "@/db/schema";
import { eq, desc, and, like, inArray, sql } from "drizzle-orm";
import { mastra } from "@/mastra";
import { extractOpinion } from "@/services/douyin/opinion-service";
import type {
  WorkWithBlogger,
  WorksFilter,
  WorksResponse,
  FilterCounts,
} from "@/types";

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 50;

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
    conditions.push(eq(works.transcriptStatus, filter.transcriptStatus as any));
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
  let totalQuery: any;
  if (filter.judgment) {
    totalQuery = db
      .select({ count: sql<number>`count(distinct ${works.id})` })
      .from(works)
      .leftJoin(predictionItems, eq(works.id, predictionItems.workId))
      .where(
        and(
          ...conditions,
          eq(predictionItems.judgment, filter.judgment as any)
        )
      );
  } else {
    totalQuery = baseQuery;
  }
  const totalRow = totalQuery.get() as { count: number };
  const total = totalRow?.count ?? 0;

  // 查询数据
  const rows = db
    .select({
      id: works.id,
      awemeId: works.awemeId,
      desc: works.desc,
      coverUrl: works.coverUrl,
      duration: works.duration,
      statistics: works.statistics,
      publishedAt: works.publishedAt,
      transcriptStatus: works.transcriptStatus,
      transcript: works.transcript,
      opinionSummary: works.opinionSummary,
      bloggerId: works.bloggerId,
      // blogger fields
      bloggerNickname: bloggers.nickname,
      bloggerSlug: bloggers.slug,
      bloggerAvatarUrl: bloggers.avatarUrl,
      bloggerFollowerCount: bloggers.followerCount,
      // judgment fields (may be null for unjudged works)
      judgmentResult: predictionItems.judgment,
      judgmentContent: predictionItems.predictedContent,
      evalId: predictionItems.evaluationId,
    })
    .from(works)
    .innerJoin(bloggers, eq(works.bloggerId, bloggers.id))
    .leftJoin(predictionItems, eq(works.id, predictionItems.workId))
    .where(
      filter.judgment
        ? and(
            ...conditions,
            eq(predictionItems.judgment, filter.judgment as any)
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

  const enriched: WorkWithBlogger[] = rows.map((row: any) => ({
    id: row.id,
    awemeId: row.awemeId,
    desc: row.desc,
    coverUrl: row.coverUrl,
    duration: row.duration,
    statistics: row.statistics,
    publishedAt: row.publishedAt,
    transcriptStatus: row.transcriptStatus,
    transcript: row.transcript,
    opinionSummary: row.opinionSummary ?? "",
    blogger: {
      id: row.bloggerId,
      nickname: row.bloggerNickname,
      slug: row.bloggerSlug,
      avatarUrl: row.bloggerAvatarUrl,
      followerCount: row.bloggerFollowerCount ?? 0,
    },
    judgment:
      row.judgmentResult
        ? {
            judgment: row.judgmentResult,
            predictedContent: row.judgmentContent ?? "",
          }
        : null,
    evaluationId: row.evalId ?? null,
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

export async function transcribeWork(workId: number): Promise<{ success: boolean; error?: string }> {
  // 查 work 数据
  const work = db
    .select({
      id: works.id,
      awemeId: works.awemeId,
      videoUrl: works.videoUrl,
      duration: works.duration,
      transcriptStatus: works.transcriptStatus,
    })
    .from(works)
    .where(eq(works.id, workId))
    .get() as any;

  if (!work) {
    return { success: false, error: "作品不存在" };
  }

  if (work.transcriptStatus === "processing") {
    return { success: false, error: "该作品正在转写中" };
  }

  if (!work.videoUrl) {
    return { success: false, error: "该作品没有视频链接" };
  }

  try {
    // 更新状态为 processing
    db.update(works)
      .set({ transcriptStatus: "processing" })
      .where(eq(works.id, workId))
      .run();

    // 启动 Mastra workflow（后台运行，不等待完成以提高响应速度）
    const run = await mastra
      .getWorkflow("transcribeWorkWorkflow")
      .createRun();
    await run.start({
      inputData: {
        workId: work.id,
        awemeId: work.awemeId,
        videoUrl: work.videoUrl,
        duration: work.duration,
      },
    });

    return { success: true };
  } catch (err) {
    // 回写失败状态
    db.update(works)
      .set({ transcriptStatus: "failed" })
      .where(eq(works.id, workId))
      .run();
    return {
      success: false,
      error: err instanceof Error ? err.message : "转写失败",
    };
  }
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
    .get() as any;

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
  action: "transcribe" | "summarize"
): Promise<{ total: number; succeeded: number; failed: number; errors: Array<{ workId: number; error: string }> }> {
  const errors: Array<{ workId: number; error: string }> = [];
  let succeeded = 0;

  for (const workId of workIds) {
    let result: { success: boolean; error?: string };
    if (action === "transcribe") {
      result = await transcribeWork(workId);
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
