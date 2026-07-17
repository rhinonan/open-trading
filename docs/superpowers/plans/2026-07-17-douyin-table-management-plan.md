# 抖音雷达表格化管理 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/settings/douyin` 改造为以视频为粒度的数据表格管理界面，支持筛选、单视频操作和批量操作。

**Architecture:** 自底向上：先建 service 层查询 works，再建 4 条 API 路由，然后从叶子组件（WorkRow → WorksTable → FilterBar → AddBloggerDialog）逐级往上组装，最后重写 page.tsx 串联全部。

**Tech Stack:** Next.js App Router, Drizzle ORM (SQLite), Mastra workflows, base-ui (Dialog, Select), Tailwind CSS, TypeScript

## Global Constraints

- 所有 API 路由遵循现有 `Response.json()` 模式，service 层与路由层分离
- UI 组件使用 `@base-ui/react` 库，不引入 shadcn/ui
- 表格使用原生 HTML `<table>` + Tailwind 样式（项目无现成 Table 组件）
- 勾选框使用原生 `<input type="checkbox">` + Tailwind 样式（项目无现成 Checkbox 组件）
- TypeScript 类型统一在 `src/types/index.ts` 中定义
- 所有新文件放在现有目录结构中，遵循项目命名规范

---

### Task 1: 新增类型定义

**Files:**
- Modify: `src/types/index.ts:114-182`

**Interfaces:**
- Produces: `WorkWithBlogger`, `WorksFilter`, `FilterCounts`, `WorksResponse`, `BatchAction`

- [ ] **Step 1: 在 `src/types/index.ts` 末尾追加新类型**

在 `MarketSnapshot` 接口定义之后，追加：

```typescript
// ==================== 抖音管理表格 ====================

export interface WorkWithBlogger {
  id: number;
  awemeId: string;
  desc: string;
  coverUrl: string;
  duration: number;
  statistics: string;
  publishedAt: number;
  transcriptStatus: TranscriptStatus;
  transcript: string | null;
  opinionSummary: string;
  blogger: {
    id: number;
    slug: string;
    nickname: string;
    avatarUrl: string;
    followerCount: number;
  };
  judgment: {
    judgment: JudgmentResult;
    predictedContent: string;
  } | null;
  evaluationId: number | null;
}

export interface WorksFilter {
  bloggerSlugs?: string[];
  transcriptStatus?: string;
  judgment?: string;
  search?: string;
  page: number;
  perPage: number;
}

export interface FilterCounts {
  transcriptStatus: Record<string, number>;
  judgment: Record<string, number>;
}

export interface WorksResponse {
  works: WorkWithBlogger[];
  total: number;
  page: number;
  perPage: number;
  filterCounts: FilterCounts;
}

export type BatchAction = "transcribe" | "summarize";
```

- [ ] **Step 2: 确认类型编译通过**

Run: `npx tsc --noEmit`

Expected: 无新增类型错误（可能会有项目中已存在的错误）。

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add WorkWithBlogger and WorksResponse types for table management"
```

---

### Task 2: Works Service 层

**Files:**
- Create: `src/services/douyin/works-service.ts`

**Interfaces:**
- Consumes: `WorkWithBlogger`, `WorksFilter`, `WorksResponse`, `BatchAction` from `@/types`
- Consumes: `db` from `@/db`, `bloggers`, `works`, `evaluations`, `predictionItems` from `@/db/schema`
- Produces: `queryWorks(filter)`, `transcribeWork(workId)`, `summarizeWork(workId)`, `batchOperate(workIds, action)`

- [ ] **Step 1: 创建 `src/services/douyin/works-service.ts`**

```typescript
// src/services/douyin/works-service.ts
import { db } from "@/db";
import { works, bloggers, evaluations, predictionItems } from "@/db/schema";
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
```

- [ ] **Step 2: 确认类型编译通过**

Run: `npx tsc --noEmit`

Expected: 无新增类型错误。

- [ ] **Step 3: Commit**

```bash
git add src/services/douyin/works-service.ts
git commit -m "feat: add works-service for query, transcribe, summarize, batch"
```

---

### Task 3: GET /api/douyin/works 路由

**Files:**
- Create: `src/app/api/douyin/works/route.ts`

**Interfaces:**
- Consumes: `queryWorks` from `@/services/douyin/works-service`
- Produces: `GET /api/douyin/works` (no other exports)

- [ ] **Step 1: 创建 `src/app/api/douyin/works/route.ts`**

```typescript
// src/app/api/douyin/works/route.ts
import { NextRequest } from "next/server";
import { queryWorks } from "@/services/douyin/works-service";
import type { WorksFilter } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const bloggerSlugsParam = searchParams.get("blogger_slugs");
    const filter: WorksFilter = {
      bloggerSlugs: bloggerSlugsParam
        ? bloggerSlugsParam.split(",").filter(Boolean)
        : undefined,
      transcriptStatus: searchParams.get("transcript_status") || undefined,
      judgment: searchParams.get("judgment") || undefined,
      search: searchParams.get("search") || undefined,
      page: parseInt(searchParams.get("page") || "0", 10) || 0,
      perPage: Math.min(
        50,
        parseInt(searchParams.get("perPage") || "20", 10) || 20
      ),
    };

    const result = await queryWorks(filter);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 手工测试 API**

Run:
```bash
curl -s "http://localhost:3000/api/douyin/works?page=0&perPage=5" | head -c 500
```

Expected: 返回 JSON，包含 `works` 数组、`total`、`page`、`perPage`、`filterCounts`。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/douyin/works/route.ts
git commit -m "feat: add GET /api/douyin/works with filtering and pagination"
```

---

### Task 4: 单视频操作 API 路由

**Files:**
- Create: `src/app/api/douyin/works/[id]/transcribe/route.ts`
- Create: `src/app/api/douyin/works/[id]/summarize/route.ts`
- Create: `src/app/api/douyin/works/batch/route.ts`

**Interfaces:**
- Consumes: `transcribeWork`, `summarizeWork`, `batchOperate` from `@/services/douyin/works-service`

- [ ] **Step 1: 创建 `src/app/api/douyin/works/[id]/transcribe/route.ts`**

```typescript
// src/app/api/douyin/works/[id]/transcribe/route.ts
import { NextRequest } from "next/server";
import { transcribeWork } from "@/services/douyin/works-service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const workId = parseInt(id, 10);
    if (isNaN(workId)) {
      return Response.json({ error: "Invalid work ID" }, { status: 400 });
    }

    const result = await transcribeWork(workId);
    if (!result.success) {
      const status = result.error === "该作品正在转写中" ? 409 : 400;
      return Response.json({ error: result.error }, { status });
    }
    return Response.json({ success: true, workId });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 创建 `src/app/api/douyin/works/[id]/summarize/route.ts`**

```typescript
// src/app/api/douyin/works/[id]/summarize/route.ts
import { NextRequest } from "next/server";
import { summarizeWork } from "@/services/douyin/works-service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const workId = parseInt(id, 10);
    if (isNaN(workId)) {
      return Response.json({ error: "Invalid work ID" }, { status: 400 });
    }

    const result = await summarizeWork(workId);
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json({ success: true, workId, summary: result.summary });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Summarization failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: 创建 `src/app/api/douyin/works/batch/route.ts`**

```typescript
// src/app/api/douyin/works/batch/route.ts
import { batchOperate } from "@/services/douyin/works-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { workIds, action } = body;

    if (!Array.isArray(workIds) || workIds.length === 0) {
      return Response.json({ error: "workIds must be a non-empty array" }, { status: 400 });
    }

    if (action !== "transcribe" && action !== "summarize") {
      return Response.json({ error: "action must be 'transcribe' or 'summarize'" }, { status: 400 });
    }

    const result = await batchOperate(workIds, action);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Batch operation failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: 手工测试**

Run:
```bash
# 测试单视频转写（替换为真实 work id）
curl -X POST "http://localhost:3000/api/douyin/works/1/transcribe"

# 测试批量操作
curl -X POST "http://localhost:3000/api/douyin/works/batch" \
  -H "Content-Type: application/json" \
  -d '{"workIds":[1,2],"action":"transcribe"}'
```

Expected: 返回 JSON 结果。

- [ ] **Step 5: Commit**

```bash
git add src/app/api/douyin/works/
git commit -m "feat: add single-work transcribe/summarize and batch API routes"
```

---

### Task 5: WorkRow 组件（单行视频）

**Files:**
- Create: `src/app/settings/douyin/WorkRow.tsx`

**Interfaces:**
- Consumes: `WorkWithBlogger` from `@/types`
- Produces: `<WorkRow>` component
- Props: `{ work: WorkWithBlogger; selected: boolean; onToggle: (id: number) => void; onTranscribe: (id: number) => void; onSummarize: (id: number) => void }`

- [ ] **Step 1: 创建 `src/app/settings/douyin/WorkRow.tsx`**

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import type { WorkWithBlogger } from "@/types";

const TRANSCRIPT_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "⏳ 待处理", variant: "secondary" },
  processing: { label: "🔄 转写中", variant: "outline" },
  done: { label: "✅ 已转写", variant: "default" },
  failed: { label: "❌ 失败", variant: "destructive" },
};

const JUDGMENT_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  correct: { label: "正确", color: "text-green-600", icon: "✅" },
  mostly_correct: { label: "基本正确", color: "text-emerald-600", icon: "💚" },
  incorrect: { label: "不正确", color: "text-red-600", icon: "❌" },
  not_applicable: { label: "不涉及", color: "text-gray-400", icon: "➖" },
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp * 1000;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(timestamp * 1000).toLocaleDateString("zh-CN");
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function WorkRow({
  work,
  selected,
  onToggle,
  onTranscribe,
  onSummarize,
  onExpand,
  isExpanded,
}: {
  work: WorkWithBlogger;
  selected: boolean;
  onToggle: (id: number) => void;
  onTranscribe: (id: number) => void;
  onSummarize: (id: number) => void;
  onExpand: (id: number | null) => void;
  isExpanded: boolean;
}) {
  const tStatus = TRANSCRIPT_STATUS_CONFIG[work.transcriptStatus] ?? {
    label: work.transcriptStatus,
    variant: "secondary" as const,
  };
  const hasOpinion = work.opinionSummary && work.opinionSummary.length > 0;
  const jConfig = work.judgment ? JUDGMENT_CONFIG[work.judgment.judgment] : null;
  const canTranscribe =
    work.transcriptStatus === "pending" || work.transcriptStatus === "failed";
  const canSummarize =
    work.transcriptStatus === "done" && !hasOpinion;

  return (
    <>
      <tr
        className={`border-b hover:bg-muted/50 transition-colors cursor-pointer ${
          selected ? "bg-accent/50" : ""
        }`}
        onClick={() => onToggle(work.id)}
        onDoubleClick={() => onExpand(isExpanded ? null : work.id)}
      >
        <td className="pl-4 py-3 w-10">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(work.id)}
            className="h-4 w-4 rounded border-gray-300 cursor-pointer accent-primary"
            onClick={(e) => e.stopPropagation()}
          />
        </td>
        <td className="py-3 pr-3">
          <div className="flex items-center gap-2">
            {work.blogger.avatarUrl ? (
              <img
                src={work.blogger.avatarUrl}
                alt={work.blogger.nickname}
                className="h-6 w-6 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-muted shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate max-w-[120px]">
                {work.blogger.nickname}
              </p>
              <p className="text-xs text-muted-foreground">
                {(work.blogger.followerCount ?? 0).toLocaleString()} 粉丝
              </p>
            </div>
          </div>
        </td>
        <td className="py-3 pr-3">
          <div className="flex items-center gap-2 min-w-0">
            {work.coverUrl ? (
              <img
                src={work.coverUrl}
                alt=""
                className="h-14 w-10 rounded-sm object-cover shrink-0 bg-muted"
                loading="lazy"
              />
            ) : (
              <div className="h-14 w-10 rounded-sm bg-muted shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm truncate max-w-[280px]">
                {work.desc || "(无文案)"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDuration(work.duration)}
              </p>
            </div>
          </div>
        </td>
        <td className="py-3 pr-3 text-sm text-muted-foreground whitespace-nowrap">
          <span title={new Date(work.publishedAt * 1000).toLocaleString("zh-CN")}>
            {formatRelativeTime(work.publishedAt)}
          </span>
        </td>
        <td className="py-3 pr-3">
          <Badge variant={tStatus.variant}>{tStatus.label}</Badge>
        </td>
        <td className="py-3 pr-3">
          {hasOpinion ? (
            <Badge variant="default">✅ 已提取</Badge>
          ) : work.transcriptStatus === "done" ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="py-3 pr-3">
          {jConfig ? (
            <span className={`text-xs font-medium ${jConfig.color}`}>
              {jConfig.icon} {jConfig.label}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-1">
            {canTranscribe && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTranscribe(work.id);
                }}
                className="px-2 py-1 text-xs rounded hover:bg-accent transition-colors"
                title="转写"
              >
                🎤
              </button>
            )}
            {canSummarize && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSummarize(work.id);
                }}
                className="px-2 py-1 text-xs rounded hover:bg-accent transition-colors"
                title="提取观点"
              >
                📝
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand(isExpanded ? null : work.id);
              }}
              className="px-2 py-1 text-xs rounded hover:bg-accent transition-colors"
              title="展开详情"
            >
              {isExpanded ? "▲" : "▶"}
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr key={`detail-${work.id}`}>
          <td colSpan={8} className="bg-muted/30 px-4 py-3">
            <WorkDetailPanel work={work} />
          </td>
        </tr>
      )}
    </>
  );
}

function WorkDetailPanel({ work }: { work: WorkWithBlogger }) {
  let stats: Record<string, number> = {};
  try {
    stats = JSON.parse(work.statistics || "{}");
  } catch {}

  return (
    <div className="flex gap-4">
      {work.coverUrl && (
        <img
          src={work.coverUrl}
          alt=""
          className="h-32 w-24 rounded object-cover shrink-0 bg-muted"
        />
      )}
      <div className="flex-1 space-y-2 min-w-0">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">完整文案</p>
          <p className="text-sm whitespace-pre-wrap">
            {work.desc || "(无文案)"}
          </p>
        </div>
        {work.transcript && work.transcriptStatus === "done" && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">转写文本</p>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {work.transcript}
            </p>
          </div>
        )}
        {work.opinionSummary && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">观点摘要</p>
            <p className="text-sm">{work.opinionSummary}</p>
          </div>
        )}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>👍 {stats.digg_count?.toLocaleString() || 0}</span>
          <span>💬 {stats.comment_count?.toLocaleString() || 0}</span>
          <span>↗ {stats.share_count?.toLocaleString() || 0}</span>
          <span>▶ {stats.play_count?.toLocaleString() || 0}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 确认类型编译通过**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/douyin/WorkRow.tsx
git commit -m "feat: add WorkRow component with expandable detail panel"

---

### Task 6: WorksTable 组件 (表格主体 + 分页)

**Files:**
- Create: `src/app/settings/douyin/WorksTable.tsx`

**Interfaces:**
- Consumes: `WorkRow` from `./WorkRow`
- Consumes: `WorkWithBlogger` from `@/types`
- Produces: `<WorksTable>` component
- Props: `{ works, total, page, perPage, selectedIds, onToggle, onToggleAll, onTranscribe, onSummarize, onPageChange, loading }`

- [ ] **Step 1: 创建 `src/app/settings/douyin/WorksTable.tsx`**

```tsx
"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { WorkRow } from "./WorkRow";
import { useState } from "react";
import type { WorkWithBlogger } from "@/types";

export function WorksTable({
  works,
  total,
  page,
  perPage,
  selectedIds,
  onToggle,
  onToggleAll,
  onTranscribe,
  onSummarize,
  onPageChange,
  loading,
}: {
  works: WorkWithBlogger[];
  total: number;
  page: number;
  perPage: number;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (allIds: number[]) => void;
  onTranscribe: (id: number) => void;
  onSummarize: (id: number) => void;
  onPageChange: (page: number) => void;
  loading: boolean;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const allCurrentIds = works.map((w) => w.id);
  const allSelected = works.length > 0 && works.every((w) => selectedIds.has(w.id));

  if (loading) {
    return (
      <div className="space-y-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded" />
        ))}
      </div>
    );
  }

  if (works.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3">📭</div>
        <p className="text-muted-foreground">暂无视频数据</p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          请先添加博主并执行扫描
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/30 text-left">
              <th className="pl-4 py-2.5 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleAll(allCurrentIds)}
                  className="h-4 w-4 rounded accent-primary cursor-pointer"
                />
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">
                博主
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">
                视频
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground whitespace-nowrap">
                发布时间
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">
                转写状态
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">
                观点状态
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">
                评判结果
              </th>
              <th className="py-2.5 pr-4 text-sm font-medium text-muted-foreground">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {works.map((work) => (
              <WorkRow
                key={work.id}
                work={work}
                selected={selectedIds.has(work.id)}
                onToggle={onToggle}
                onTranscribe={onTranscribe}
                onSummarize={onSummarize}
                onExpand={setExpandedId}
                isExpanded={expandedId === work.id}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t">
        <span className="text-sm text-muted-foreground">
          共 {total} 条
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 0}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← 上一页
          </button>
          <span className="text-sm text-muted-foreground">
            第 {page + 1}/{totalPages} 页
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下一页 →
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 确认类型编译通过**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/douyin/WorksTable.tsx
git commit -m "feat: add WorksTable with pagination and selection"
```

---

### Task 7: FilterBar 组件

**Files:**
- Create: `src/app/settings/douyin/FilterBar.tsx`

**Interfaces:**
- Consumes: `DouyinBlogger` from `@/types`
- Produces: `<FilterBar>` component
- Props: `{ bloggers, filters, filterCounts, selectedCount, onFilterChange, onBatchTranscribe, onBatchSummarize }`

- [ ] **Step 1: 创建 `src/app/settings/douyin/FilterBar.tsx`**

```tsx
"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DouyinBlogger, FilterCounts } from "@/types";
import { useState, useEffect } from "react";

const TRANSCRIPT_STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "⏳ 待处理" },
  { value: "processing", label: "🔄 转写中" },
  { value: "done", label: "✅ 已转写" },
  { value: "failed", label: "❌ 失败" },
];

const JUDGMENT_OPTIONS = [
  { value: "", label: "全部评判" },
  { value: "correct", label: "✅ 正确" },
  { value: "mostly_correct", label: "💚 基本正确" },
  { value: "incorrect", label: "❌ 不正确" },
  { value: "not_applicable", label: "➖ 不涉及" },
];

export function FilterBar({
  bloggers,
  filters,
  filterCounts,
  selectedCount,
  onFilterChange,
  onBatchTranscribe,
  onBatchSummarize,
}: {
  bloggers: DouyinBlogger[];
  filters: {
    bloggerSlugs: string[];
    transcriptStatus: string;
    judgment: string;
    search: string;
  };
  filterCounts: FilterCounts | null;
  selectedCount: number;
  onFilterChange: (key: string, value: string) => void;
  onBatchTranscribe: () => void;
  onBatchSummarize: () => void;
}) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const [bloggerOpen, setBloggerOpen] = useState(false);

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onFilterChange("search", searchInput);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search, onFilterChange]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Blogger multi-select */}
        <Select
          value={filters.bloggerSlugs[0] || ""}
          onValueChange={(v: string) => onFilterChange("bloggerSlugs", v)}
          open={bloggerOpen}
          onOpenChange={setBloggerOpen}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue>
              {filters.bloggerSlugs.length === 0
                ? "👤 全部博主"
                : `${bloggers.find((b) => b.slug === filters.bloggerSlugs[0])?.nickname || "..."}`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">全部博主</SelectItem>
            {bloggers.map((b) => (
              <SelectItem key={b.slug} value={b.slug}>
                {b.nickname} ({(b.followerCount ?? 0).toLocaleString()}粉)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Transcript status */}
        <Select
          value={filters.transcriptStatus}
          onValueChange={(v: string) => onFilterChange("transcriptStatus", v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue>📋 {TRANSCRIPT_STATUS_OPTIONS.find((o) => o.value === filters.transcriptStatus)?.label || "全部状态"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TRANSCRIPT_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
                {opt.value && filterCounts?.transcriptStatus[opt.value]
                  ? ` (${filterCounts.transcriptStatus[opt.value]})`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Judgment filter */}
        <Select
          value={filters.judgment}
          onValueChange={(v: string) => onFilterChange("judgment", v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue>📊 {JUDGMENT_OPTIONS.find((o) => o.value === filters.judgment)?.label || "全部评判"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {JUDGMENT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
                {opt.value && filterCounts?.judgment[opt.value]
                  ? ` (${filterCounts.judgment[opt.value]})`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="🔍 搜索视频描述..."
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Batch action bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent/50 text-sm">
          <span className="text-muted-foreground">已选 {selectedCount} 项</span>
          <span className="text-muted-foreground">→</span>
          <button
            onClick={onBatchTranscribe}
            className="px-2.5 py-1 rounded-md bg-background border hover:bg-accent transition-colors text-sm"
          >
            🎤 批量转写
          </button>
          <button
            onClick={onBatchSummarize}
            className="px-2.5 py-1 rounded-md bg-background border hover:bg-accent transition-colors text-sm"
          >
            📝 批量提取观点
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 确认类型编译通过**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/douyin/FilterBar.tsx
git commit -m "feat: add FilterBar with blogger/status/judgment filters and batch actions"
```

---

### Task 8: AddBloggerDialog 组件

**Files:**
- Create: `src/app/settings/douyin/AddBloggerDialog.tsx`

**Interfaces:**
- Produces: `<AddBloggerDialog>` component
- Props: `{ open, onOpenChange, onAdded }`

- [ ] **Step 1: 创建 `src/app/settings/douyin/AddBloggerDialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AddBloggerDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [uidInput, setUidInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const handleAdd = async () => {
    if (!uidInput.trim()) return;
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/douyin/bloggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ douyinUid: uidInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setUidInput("");
        onOpenChange(false);
        onAdded();
      } else {
        setError(data.error || "添加失败");
      }
    } catch {
      setError("网络请求失败");
    }
    setAdding(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加抖音博主</DialogTitle>
          <DialogDescription>
            输入博主的抖音 sec_uid 来添加监控
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            type="text"
            value={uidInput}
            onChange={(e) => {
              setUidInput(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="输入抖音博主 sec_uid..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleAdd} disabled={adding || !uidInput.trim()}>
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                添加中...
              </>
            ) : (
              "添加"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 确认类型编译通过**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/douyin/AddBloggerDialog.tsx
git commit -m "feat: add AddBloggerDialog component"
```

---

### Task 9: 重写 settings/douyin/page.tsx（主页面组装）

**Files:**
- Modify: `src/app/settings/douyin/page.tsx`

**Interfaces:**
- Consumes: `FilterBar`, `WorksTable`, `AddBloggerDialog` from sibling files
- Consumes: `WorkWithBlogger`, `WorksResponse`, `DouyinBlogger` from `@/types`

- [ ] **Step 1: 使用 Read 工具读取当前 `src/app/settings/douyin/page.tsx` 内容**

- [ ] **Step 2: 使用 Write 工具重写 `src/app/settings/douyin/page.tsx`**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Radio,
  RefreshCw,
  Mic,
  Loader2,
  BarChart3,
  UserPlus,
} from "lucide-react";
import { FilterBar } from "./FilterBar";
import { WorksTable } from "./WorksTable";
import { AddBloggerDialog } from "./AddBloggerDialog";
import type {
  DouyinBlogger,
  WorkWithBlogger,
  WorksResponse,
} from "@/types";

export default function DouyinSettingsPage() {
  // Data state
  const [bloggers, setBloggers] = useState<DouyinBlogger[]>([]);
  const [works, setWorks] = useState<WorkWithBlogger[]>([]);
  const [total, setTotal] = useState(0);
  const [filterCounts, setFilterCounts] = useState<WorksResponse["filterCounts"] | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [bloggerSlugs, setBloggerSlugs] = useState<string[]>([]);
  const [transcriptStatus, setTranscriptStatus] = useState("");
  const [judgment, setJudgment] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const perPage = 20;

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Operation state
  const [scanning, setScanning] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [message, setMessage] = useState("");

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Fetch bloggers for filter dropdown
  const fetchBloggers = useCallback(async () => {
    try {
      const res = await fetch("/api/douyin/bloggers");
      if (res.ok) setBloggers(await res.json());
    } catch {}
  }, []);

  // Fetch works
  const fetchWorks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (bloggerSlugs.length > 0) params.set("blogger_slugs", bloggerSlugs.join(","));
      if (transcriptStatus) params.set("transcript_status", transcriptStatus);
      if (judgment) params.set("judgment", judgment);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("perPage", String(perPage));

      const res = await fetch(`/api/douyin/works?${params}`);
      if (res.ok) {
        const data: WorksResponse = await res.json();
        setWorks(data.works);
        setTotal(data.total);
        setFilterCounts(data.filterCounts);
      }
    } catch {}
    setLoading(false);
  }, [bloggerSlugs, transcriptStatus, judgment, search, page]);

  useEffect(() => {
    fetchBloggers();
  }, [fetchBloggers]);

  useEffect(() => {
    fetchWorks();
  }, [fetchWorks]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [bloggerSlugs, transcriptStatus, judgment, search]);

  // Filter change handler
  const handleFilterChange = (key: string, value: string) => {
    switch (key) {
      case "bloggerSlugs":
        setBloggerSlugs(value ? [value] : []);
        break;
      case "transcriptStatus":
        setTranscriptStatus(value);
        break;
      case "judgment":
        setJudgment(value);
        break;
      case "search":
        setSearch(value);
        break;
    }
  };

  // Selection handlers
  const handleToggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleAll = (allIds: number[]) => {
    setSelectedIds((prev) => {
      if (allIds.every((id) => prev.has(id))) {
        // Deselect all on current page
        const next = new Set(prev);
        allIds.forEach((id) => next.delete(id));
        return next;
      } else {
        // Select all on current page
        return new Set([...prev, ...allIds]);
      }
    });
  };

  // Single work operations
  const handleTranscribe = async (workId: number) => {
    setMessage("");
    try {
      const res = await fetch(`/api/douyin/works/${workId}/transcribe`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`转写任务已启动`);
        fetchWorks();
      } else {
        setMessage(`转写失败: ${data.error}`);
      }
    } catch {
      setMessage("转写请求失败");
    }
  };

  const handleSummarize = async (workId: number) => {
    setMessage("");
    try {
      const res = await fetch(`/api/douyin/works/${workId}/summarize`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`观点已提取: ${data.summary?.slice(0, 50)}...`);
        fetchWorks();
      } else {
        setMessage(`观点提取失败: ${data.error}`);
      }
    } catch {
      setMessage("观点提取请求失败");
    }
  };

  // Batch operations
  const handleBatchTranscribe = async () => {
    setMessage("");
    try {
      const res = await fetch("/api/douyin/works/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workIds: Array.from(selectedIds),
          action: "transcribe",
        }),
      });
      const data = await res.json();
      setMessage(`批量转写完成: ${data.succeeded} 成功, ${data.failed} 失败`);
      setSelectedIds(new Set());
      fetchWorks();
    } catch {
      setMessage("批量转写请求失败");
    }
  };

  const handleBatchSummarize = async () => {
    setMessage("");
    try {
      const res = await fetch("/api/douyin/works/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workIds: Array.from(selectedIds),
          action: "summarize",
        }),
      });
      const data = await res.json();
      setMessage(`批量提取完成: ${data.succeeded} 成功, ${data.failed} 失败`);
      setSelectedIds(new Set());
      fetchWorks();
    } catch {
      setMessage("批量提取请求失败");
    }
  };

  // Global operations (preserved from old page)
  const handleScan = async () => {
    setScanning(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/scan", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`扫描完成：检查了 ${data.total} 个博主，发现 ${data.totalNewWorks} 条新作品`);
        fetchWorks();
      } else {
        setMessage(`扫描失败: ${data.error}`);
      }
    } catch {
      setMessage("扫描失败");
    }
    setScanning(false);
  };

  const handleTranscribeAll = async () => {
    setTranscribing(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/transcribe", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`转写完成：共 ${data.total} 条，成功 ${data.done} 条${data.failed > 0 ? `，失败 ${data.failed} 条` : ""}`);
        fetchWorks();
      } else {
        setMessage(`转写失败: ${data.error}`);
      }
    } catch {
      setMessage("转写请求失败");
    }
    setTranscribing(false);
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/evaluate", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`评判完成：${data.totalBloggers} 个博主，共 ${data.totalPredictions} 条预测`);
        fetchWorks();
      } else {
        setMessage(`评判失败: ${data.error}`);
      }
    } catch {
      setMessage("评判请求失败");
    }
    setEvaluating(false);
  };

  const clearMessage = () => setMessage("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Radio className="h-4 w-4" />
          抖音雷达管理
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Global action bar */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAddDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            添加博主
          </Button>
          <Button variant="outline" onClick={handleScan} disabled={scanning}>
            {scanning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            扫描全部
          </Button>
          <Button variant="outline" onClick={handleTranscribeAll} disabled={transcribing}>
            {transcribing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Mic className="h-4 w-4 mr-2" />
            )}
            全部转写
          </Button>
          <Button variant="outline" onClick={handleEvaluate} disabled={evaluating}>
            {evaluating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <BarChart3 className="h-4 w-4 mr-2" />
            )}
            收盘评判
          </Button>
        </div>

        {/* Filter bar */}
        <FilterBar
          bloggers={bloggers}
          filters={{ bloggerSlugs, transcriptStatus, judgment, search }}
          filterCounts={filterCounts}
          selectedCount={selectedIds.size}
          onFilterChange={handleFilterChange}
          onBatchTranscribe={handleBatchTranscribe}
          onBatchSummarize={handleBatchSummarize}
        />

        {/* Feedback message */}
        {message && (
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 text-sm">
            <span className="text-muted-foreground">{message}</span>
            <button
              onClick={clearMessage}
              className="text-muted-foreground hover:text-foreground ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Works table */}
        <WorksTable
          works={works}
          total={total}
          page={page}
          perPage={perPage}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
          onTranscribe={handleTranscribe}
          onSummarize={handleSummarize}
          onPageChange={setPage}
          loading={loading}
        />
      </CardContent>

      {/* Add blogger dialog */}
      <AddBloggerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdded={() => {
          fetchBloggers();
          fetchWorks();
        }}
      />
    </Card>
  );
}
```

- [ ] **Step 2: 确认类型和 lint 通过**

Run:
```bash
npx tsc --noEmit
npm run lint
```

Expected: 无新增错误。

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/douyin/page.tsx
git commit -m "feat: rewrite settings/douyin with table management interface"
```

---

### Task 10: 端到端验证

**Files:** 无新建/修改

- [ ] **Step 1: 构建检查**

Run:
```bash
npm run build
```

Expected: 构建成功，无错误。

- [ ] **Step 2: 启动开发服务器并手动验证**

Run:
```bash
# Start dev server (in background)
npm run dev
```

验证清单：
1. 访问 `http://localhost:3000/settings/douyin` → 页面正常加载
2. 表格显示视频列表，包含博主、视频、状态、评判列
3. 筛选下拉正常工作（博主、转写状态、评判）
4. 搜索框输入防抖搜索
5. 勾选行 → 批量操作栏出现
6. 点击单行操作按钮（转写/提取观点）→ API 调用
7. 批量操作按钮 → 批量 API 调用
8. 分页器翻页正常
9. 添加博主弹窗正常打开/关闭/添加
10. 全局按钮（扫描全部、全部转写、收盘评判）功能正常

- [ ] **Step 3: 截图保存**

打开 `http://localhost:3000/settings/douyin` 并使用 mcp__plugin_superpowers-chrome_chrome__use_browser 截图。

- [ ] **Step 4: 最终 Commit（如有微调）**

```bash
git add -A
git commit -m "chore: final adjustments for douyin table management"
```
