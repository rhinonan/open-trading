# 抖音雷达 → 博主+视频二级管理 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/settings/douyin` 从单层视频表格重构为博主（外层）+ 视频（内层展开）的二级管理界面，全面替换 emoji 为 lucide-react 图标，优化转写状态视觉，兼顾移动端响应式。

**Architecture:** 自底向上：先扩 service 层（3 个新函数），再建 5 条 per-blogger API 路由，然后从叶子组件（VideoSubRow → VideoSubTable → BloggerRow → BloggerTable → BloggerToolbar）逐级往上组装，最后重写 page.tsx 串联全部。旧组件（FilterBar / WorksTable / WorkRow / AddBloggerDialog）保留不动。

**Tech Stack:** Next.js App Router, Drizzle ORM (SQLite), Mastra workflows, base-ui (Avatar, HoverCard, Tooltip, Dialog, Button, Badge, Skeleton, Card, Select), lucide-react icons, Tailwind CSS, TypeScript

## Global Constraints

- 所有 API 路由遵循现有 `Response.json()` 模式，service 层与路由层分离
- UI 组件使用 `@base-ui/react` 库（项目已有：Avatar, HoverCard/PreviewCard, Tooltip, Dialog, Button, Badge, Skeleton, Card, Select）
- 图标统一使用 `lucide-react`（项目已安装 v1.24.0），禁止 emoji
- 表格使用原生 HTML `<table>` + Tailwind 样式
- 文本单行省略号 + HoverCard 悬浮全文 + Clipboard 复制按钮
- TypeScript 类型统一在 `src/types/index.ts`
- 移动端：表格横向滚动 `overflow-x-auto`，工具栏按钮 flex-wrap 换行
- 转写状态：lucide 图标 + 颜色语义（amber=待处理 / blue=进行中 / green=已完成 / red=失败）

---

### Task 1: Service 层 — 新增 `updateBloggerProfile`

**Files:**
- Modify: `src/services/douyin/blogger-service.ts:71-74`

**Interfaces:**
- Consumes: `fetchUserProfile` from `src/lib/douyin-api.ts:158`; `DouyinBlogger` from `src/types/index.ts:126`
- Produces: `updateBloggerProfile(slug: string): Promise<DouyinBlogger>`

- [ ] **Step 1: 在 `deleteBlogger` 函数之后追加新函数**

```typescript
export async function updateBloggerProfile(
  slug: string
): Promise<DouyinBlogger> {
  const blogger = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.slug, slug))
    .get() as DouyinBlogger | undefined;
  if (!blogger) throw new Error(`博主 ${slug} 不存在`);

  const profile = await fetchUserProfile(blogger.douyinUid);
  if (!profile) throw new Error(`无法获取博主 ${blogger.douyinUid} 的信息`);

  const pickAvatarUrl = (urls?: string[]): string => {
    if (!urls?.length) return "";
    return urls.find((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u)) || urls[0];
  };
  const avatar =
    pickAvatarUrl(profile.avatar_medium?.url_list) ||
    pickAvatarUrl(profile.avatar_thumb?.url_list) ||
    "";

  const updated = db
    .update(bloggers)
    .set({
      nickname: profile.nickname || "",
      avatarUrl: avatar,
      signature: profile.signature || "",
      followerCount: profile.follower_count || 0,
    })
    .where(eq(bloggers.slug, slug))
    .returning()
    .get() as DouyinBlogger;

  return updated;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/douyin/blogger-service.ts
git commit -m "feat: add updateBloggerProfile service function"
```

---

### Task 2: Service 层 — 新增 `transcribeBloggerWorks`

**Files:**
- Modify: `src/services/douyin/pipeline-service.ts:186-187`（在 `transcribePendingWorks` 之后追加）

**Interfaces:**
- Consumes: `works` table schema, `mastra` from `src/mastra`
- Produces: `transcribeBloggerWorks(bloggerId: number, config?: Partial<PipelineConfig>): Promise<PipelineResult>`

> `PipelineResult` 和 `PipelineConfig` 已在 `pipeline-service.ts:11-36` 定义，复用即可。

- [ ] **Step 1: 在文件末尾追加新函数**

```typescript
export async function transcribeBloggerWorks(
  bloggerId: number,
  config?: Partial<PipelineConfig>
): Promise<PipelineResult> {
  const concurrency = config?.concurrency ?? 2;
  const maxTasks = config?.maxTasks ?? 20;

  const pending = db
    .select({
      id: works.id,
      awemeId: works.awemeId,
      videoUrl: works.videoUrl,
      duration: works.duration,
    })
    .from(works)
    .where(
      and(
        eq(works.bloggerId, bloggerId),
        inArray(works.transcriptStatus, ["pending", "processing", "failed"])
      )
    )
    .orderBy(asc(works.scannedAt))
    .limit(maxTasks)
    .all() as WorkRow[];

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

  return { total: results.length, done, failed, results };
}
```

需要在文件顶部追加 `and` 的 import（与 `eq, inArray, asc` 同一行）：

```typescript
import { eq, inArray, asc, and } from "drizzle-orm";
```

- [ ] **Step 2: Commit**

```bash
git add src/services/douyin/pipeline-service.ts
git commit -m "feat: add transcribeBloggerWorks for per-blogger transcription"
```

---

### Task 3: Service 层 — 新增 `summarizeBloggerWorks`

**Files:**
- Modify: `src/services/douyin/works-service.ts:307`（文件末尾追加）

**Interfaces:**
- Consumes: `extractOpinion` from `src/services/douyin/opinion-service.ts`; `works` table schema
- Produces: `summarizeBloggerWorks(bloggerId: number): Promise<{ total: number; succeeded: number; failed: number }>`

- [ ] **Step 1: 在 `batchOperate` 函数之后追加新函数**

```typescript
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
```

需要在文件顶部追加 `and` 的 import（与 `eq, desc, and, like, inArray, sql` 同一行——`and` 实际上已经 import 了，检查后确认）。

- [ ] **Step 2: Commit**

```bash
git add src/services/douyin/works-service.ts
git commit -m "feat: add summarizeBloggerWorks for per-blogger opinion extraction"
```

---

### Task 4: API 路由 — 5 个 per-blogger 端点

**Files:**
- Create: `src/app/api/douyin/bloggers/[slug]/update-profile/route.ts`
- Create: `src/app/api/douyin/bloggers/[slug]/scan/route.ts`
- Create: `src/app/api/douyin/bloggers/[slug]/transcribe/route.ts`
- Create: `src/app/api/douyin/bloggers/[slug]/summarize/route.ts`
- Create: `src/app/api/douyin/bloggers/[slug]/evaluate/route.ts`

**Interfaces:**
- Consumes: `blogger-service.ts` (getBloggerBySlug, updateBloggerProfile), `scanner-service.ts` (scanBlogger), `pipeline-service.ts` (transcribeBloggerWorks), `works-service.ts` (summarizeBloggerWorks), `evaluator-service.ts` (evaluateBlogger)
- Produces: 5 个 `POST` 端点，全部返回 JSON `{ success: boolean, ...details }`

- [ ] **Step 1: 创建 `update-profile/route.ts`**

```typescript
import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  try {
    const updated = await bloggerService.updateBloggerProfile(slug);
    return Response.json({ success: true, blogger: updated });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "更新失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 创建 `scan/route.ts`**

```typescript
import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { scanBlogger } from "@/services/douyin/scanner-service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  try {
    const blogger = await bloggerService.getBloggerBySlug(slug);
    if (!blogger) {
      return Response.json({ success: false, error: "博主不存在" }, { status: 404 });
    }
    const result = await scanBlogger(blogger);
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "扫描失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: 创建 `transcribe/route.ts`**

```typescript
import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { transcribeBloggerWorks } from "@/services/douyin/pipeline-service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  try {
    const blogger = await bloggerService.getBloggerBySlug(slug);
    if (!blogger) {
      return Response.json({ success: false, error: "博主不存在" }, { status: 404 });
    }
    const result = await transcribeBloggerWorks(blogger.id);
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "转写失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: 创建 `summarize/route.ts`**

```typescript
import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { summarizeBloggerWorks } from "@/services/douyin/works-service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  try {
    const blogger = await bloggerService.getBloggerBySlug(slug);
    if (!blogger) {
      return Response.json({ success: false, error: "博主不存在" }, { status: 404 });
    }
    const result = await summarizeBloggerWorks(blogger.id);
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "观点提取失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 5: 创建 `evaluate/route.ts`**

```typescript
import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { evaluateBlogger } from "@/services/douyin/evaluator-service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  try {
    const blogger = await bloggerService.getBloggerBySlug(slug);
    if (!blogger) {
      return Response.json({ success: false, error: "博主不存在" }, { status: 404 });
    }
    const result = await evaluateBlogger(blogger.id);
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "评判失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/douyin/bloggers/\[slug\]/update-profile/ src/app/api/douyin/bloggers/\[slug\]/scan/ src/app/api/douyin/bloggers/\[slug\]/transcribe/ src/app/api/douyin/bloggers/\[slug\]/summarize/ src/app/api/douyin/bloggers/\[slug\]/evaluate/
git commit -m "feat: add per-blogger API routes (update-profile, scan, transcribe, summarize, evaluate)"
```

---

### Task 5: UI 组件 — `VideoSubRow`

**Files:**
- Create: `src/app/settings/douyin/VideoSubRow.tsx`

**Interfaces:**
- Consumes: `WorkWithBlogger` from `src/types/index.ts:197`; `HoverCard`/`HoverCardTrigger`/`HoverCardContent` from `src/components/ui/hover-card.tsx`; lucide-react icons
- Produces: `VideoSubRow` component — 单行视频数据，接收 `work: WorkWithBlogger`, `onTranscribe`, `onSummarize`

- [ ] **Step 1: 创建 `VideoSubRow.tsx`**

```typescript
"use client";

import { useState } from "react";
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Minus,
  Check,
  CheckCheck,
  X,
  ExternalLink,
  Mic,
  Clipboard,
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import type { WorkWithBlogger, JudgmentResult } from "@/types";

const TRANSCRIPT_STATUS_CONFIG: Record<
  string,
  { label: string; Icon: typeof Clock; colorClass: string }
> = {
  pending: { label: "待处理", Icon: Clock, colorClass: "text-amber-500" },
  processing: { label: "转写中", Icon: Loader2, colorClass: "text-blue-500" },
  done: { label: "已转写", Icon: CheckCircle2, colorClass: "text-green-500" },
  failed: { label: "失败", Icon: XCircle, colorClass: "text-red-500" },
};

const JUDGMENT_CONFIG: Record<
  JudgmentResult,
  { label: string; Icon: typeof Check; colorClass: string }
> = {
  correct: { label: "正确", Icon: Check, colorClass: "text-green-600" },
  mostly_correct: { label: "基本正确", Icon: CheckCheck, colorClass: "text-emerald-600" },
  incorrect: { label: "不正确", Icon: X, colorClass: "text-red-600" },
  not_applicable: { label: "不涉及", Icon: Minus, colorClass: "text-gray-400" },
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

export function VideoSubRow({
  work,
  onTranscribe,
  onSummarize,
}: {
  work: WorkWithBlogger;
  onTranscribe: (id: number) => void;
  onSummarize: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const tStatus = TRANSCRIPT_STATUS_CONFIG[work.transcriptStatus] ?? {
    label: work.transcriptStatus,
    Icon: Minus,
    colorClass: "text-muted-foreground",
  };
  const hasOpinion = work.opinionSummary && work.opinionSummary.length > 0;
  const jConfig = work.judgment ? JUDGMENT_CONFIG[work.judgment.judgment] : null;
  const canTranscribe = work.transcriptStatus === "pending" || work.transcriptStatus === "failed";
  const canSummarize = work.transcriptStatus === "done" && !hasOpinion;
  const isProcessing = work.transcriptStatus === "processing";

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const { Icon: TIcon, colorClass: tColor, label: tLabel } = tStatus;

  return (
    <>
      <tr className="border-b hover:bg-muted/30 transition-colors">
        {/* 标题 — 单行省略号 + 悬浮全文 + 复制 */}
        <td className="py-2.5 pl-6 pr-3">
          <div className="flex items-center gap-1.5 min-w-0 max-w-[320px]">
            <HoverCard>
              <HoverCardTrigger className="text-sm truncate cursor-default">
                {work.desc || "(无文案)"}
              </HoverCardTrigger>
              <HoverCardContent side="top" className="max-w-sm whitespace-pre-wrap text-xs">
                {work.desc || "(无文案)"}
              </HoverCardContent>
            </HoverCard>
            {work.desc && (
              <button
                onClick={(e) => { e.stopPropagation(); handleCopy(work.desc); }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="复制文案"
              >
                {copied ? (
                  <ClipboardCheck className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Clipboard className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </td>

        {/* 发布时间 */}
        <td className="py-2.5 pr-3 text-sm text-muted-foreground whitespace-nowrap">
          <span title={new Date(work.publishedAt * 1000).toLocaleString("zh-CN")}>
            {formatRelativeTime(work.publishedAt)}
          </span>
        </td>

        {/* 转写状态 — lucide 图标 + 颜色 */}
        <td className="py-2.5 pr-3">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${tColor}`}>
            <TIcon className={`h-3.5 w-3.5 ${isProcessing ? "animate-spin" : ""}`} />
            {tLabel}
          </div>
        </td>

        {/* 观点状态 */}
        <td className="py-2.5 pr-3">
          {hasOpinion ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-purple-500">
              <Lightbulb className="h-3.5 w-3.5" />
              已提取
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Minus className="h-3.5 w-3.5" />
              未提取
            </div>
          )}
        </td>

        {/* 评判结果 */}
        <td className="py-2.5 pr-3">
          {jConfig ? (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${jConfig.colorClass}`}>
              <jConfig.Icon className="h-3.5 w-3.5" />
              {jConfig.label}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Minus className="h-3.5 w-3.5" />
              未评判
            </div>
          )}
        </td>

        {/* 操作 */}
        <td className="py-2.5 pr-4">
          <div className="flex items-center gap-1">
            {/* 跳转抖音 */}
            {work.shareUrl || work.awemeId ? (
              <a
                href={work.shareUrl || `https://www.douyin.com/video/${work.awemeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="在抖音打开"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}

            {/* 转写 */}
            {canTranscribe && (
              <button
                onClick={(e) => { e.stopPropagation(); onTranscribe(work.id); }}
                className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="转写视频"
              >
                <Mic className="h-3.5 w-3.5" />
              </button>
            )}

            {/* 提取观点 */}
            {canSummarize && (
              <button
                onClick={(e) => { e.stopPropagation(); onSummarize(work.id); }}
                className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="提取观点"
              >
                <Lightbulb className="h-3.5 w-3.5" />
              </button>
            )}

            {/* 展开详情 */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title={expanded ? "收起详情" : "展开详情"}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </td>
      </tr>

      {/* 展开详情面板 */}
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-muted/20 px-6 py-3">
            <div className="space-y-2 text-sm">
              {work.transcript && work.transcriptStatus === "done" && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">转写文本：</span>
                  <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-muted-foreground">
                    {work.transcript}
                  </p>
                </div>
              )}
              {work.opinionSummary && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">观点摘要：</span>
                  <p className="mt-0.5">{work.opinionSummary}</p>
                </div>
              )}
              {work.judgment && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">预测内容：</span>
                  <p className="mt-0.5 text-muted-foreground">{work.judgment.predictedContent}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/douyin/VideoSubRow.tsx
git commit -m "feat: add VideoSubRow component with lucide icons, ellipsis+hover+copy"
```

---

### Task 6: UI 组件 — `VideoSubTable`

**Files:**
- Create: `src/app/settings/douyin/VideoSubTable.tsx`

**Interfaces:**
- Consumes: `VideoSubRow` (Task 5); `WorkWithBlogger` from `src/types`
- Produces: `VideoSubTable` — 内嵌分页的视频子表，接收 `works: WorkWithBlogger[]`, `onTranscribe`, `onSummarize`

- [ ] **Step 1: 创建 `VideoSubTable.tsx`**

```typescript
"use client";

import { useState } from "react";
import { VideoSubRow } from "./VideoSubRow";
import {
  FileVideo,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { WorkWithBlogger } from "@/types";

const SUB_PER_PAGE = 10;

export function VideoSubTable({
  works,
  onTranscribe,
  onSummarize,
}: {
  works: WorkWithBlogger[];
  onTranscribe: (id: number) => void;
  onSummarize: (id: number) => void;
}) {
  const [subPage, setSubPage] = useState(0);
  const totalSubPages = Math.max(1, Math.ceil(works.length / SUB_PER_PAGE));
  const pagedWorks = works.slice(subPage * SUB_PER_PAGE, (subPage + 1) * SUB_PER_PAGE);

  // Reset sub-page when works change
  if (subPage >= totalSubPages && subPage > 0) {
    setSubPage(0);
  }

  if (works.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
        <FileVideo className="h-4 w-4" />
        暂无视频数据
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/10 text-left">
              <th className="pl-6 py-2 text-xs font-medium text-muted-foreground">标题</th>
              <th className="py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">发布时间</th>
              <th className="py-2 text-xs font-medium text-muted-foreground">转写状态</th>
              <th className="py-2 text-xs font-medium text-muted-foreground">观点状态</th>
              <th className="py-2 text-xs font-medium text-muted-foreground">评判结果</th>
              <th className="py-2 pr-4 text-xs font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {pagedWorks.map((work) => (
              <VideoSubRow
                key={work.id}
                work={work}
                onTranscribe={onTranscribe}
                onSummarize={onSummarize}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 子表分页 */}
      {works.length > SUB_PER_PAGE && (
        <div className="flex items-center justify-between px-6 py-2 border-t border-muted/30">
          <span className="text-xs text-muted-foreground">
            共 {works.length} 条
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSubPage(subPage - 1)}
              disabled={subPage <= 0}
              className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs text-muted-foreground">
              {subPage + 1}/{totalSubPages}
            </span>
            <button
              onClick={() => setSubPage(subPage + 1)}
              disabled={subPage >= totalSubPages - 1}
              className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/douyin/VideoSubTable.tsx
git commit -m "feat: add VideoSubTable with embedded pagination"
```

---

### Task 7: UI 组件 — `BloggerRow`

**Files:**
- Create: `src/app/settings/douyin/BloggerRow.tsx`

**Interfaces:**
- Consumes: `DouyinBlogger` from `src/types`; `Avatar`/`AvatarImage`/`AvatarFallback` from `src/components/ui/avatar.tsx`; `VideoSubTable` (Task 6); lucide-react icons
- Produces: `BloggerRow` — 可展开的博主行，接收 `blogger`, `isExpanded`, `onToggle`, `onDelete`, `works`, `loadingWorks`, `onTranscribe`, `onSummarize`

- [ ] **Step 1: 创建 `BloggerRow.tsx`**

```typescript
"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Loader2,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { VideoSubTable } from "./VideoSubTable";
import type { DouyinBlogger, WorkWithBlogger } from "@/types";

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

function formatFollowerCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }
  return count.toLocaleString();
}

export function BloggerRow({
  blogger,
  isExpanded,
  selected,
  onToggleSelect,
  onToggleExpand,
  onDelete,
  works,
  loadingWorks,
  onTranscribe,
  onSummarize,
}: {
  blogger: DouyinBlogger;
  isExpanded: boolean;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onToggleExpand: (id: number | null) => void;
  onDelete: (slug: string) => void;
  works: WorkWithBlogger[];
  loadingWorks: boolean;
  onTranscribe: (id: number) => void;
  onSummarize: (id: number) => void;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <tr
        className={`border-b hover:bg-muted/30 transition-colors cursor-pointer ${
          selected ? "bg-accent/50" : ""
        } ${isExpanded ? "border-b-0 bg-muted/10" : ""}`}
      >
        {/* 复选框 */}
        <td className="pl-4 py-3 w-10">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(blogger.id)}
            className="h-4 w-4 rounded cursor-pointer accent-primary"
            onClick={(e) => e.stopPropagation()}
          />
        </td>

        {/* 头像 + 用户名 */}
        <td className="py-3 pr-3">
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              {blogger.avatarUrl ? (
                <AvatarImage src={blogger.avatarUrl} alt={blogger.nickname} />
              ) : null}
              <AvatarFallback>
                {blogger.nickname?.slice(0, 2) || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium truncate max-w-[140px]">
              {blogger.nickname}
            </span>
          </div>
        </td>

        {/* 粉丝数 */}
        <td className="py-3 pr-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {formatFollowerCount(blogger.followerCount)}
          </div>
        </td>

        {/* 最近更新时间 */}
        <td className="py-3 pr-3 text-sm text-muted-foreground whitespace-nowrap">
          <span title={new Date(blogger.updatedAt * 1000).toLocaleString("zh-CN")}>
            {formatRelativeTime(blogger.updatedAt)}
          </span>
        </td>

        {/* 操作 — 删除 + 展开 */}
        <td className="py-3 pr-4">
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteDialogOpen(true); }}
              className="p-1.5 rounded hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 transition-colors text-muted-foreground"
              title="删除博主"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(isExpanded ? null : blogger.id); }}
              className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
              title={isExpanded ? "收起视频" : "展开视频"}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          </div>
        </td>
      </tr>

      {/* 展开：视频子表 */}
      {isExpanded && (
        <tr>
          <td colSpan={5} className="bg-muted/5 border-b px-0 py-0">
            {loadingWorks ? (
              <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载视频中...
              </div>
            ) : (
              <VideoSubTable
                works={works}
                onTranscribe={onTranscribe}
                onSummarize={onSummarize}
              />
            )}
          </td>
        </tr>
      )}

      {/* 删除确认弹窗 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除博主</DialogTitle>
            <DialogDescription>
              确定要删除博主「{blogger.nickname}」吗？该博主的所有视频数据也会被一并删除，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button
              variant="default"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                onDelete(blogger.slug);
                setDeleteDialogOpen(false);
              }}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/douyin/BloggerRow.tsx
git commit -m "feat: add BloggerRow with accordion expand, delete dialog, Avatar"
```

---

### Task 8: UI 组件 — `BloggerTable`

**Files:**
- Create: `src/app/settings/douyin/BloggerTable.tsx`

**Interfaces:**
- Consumes: `BloggerRow` (Task 7); `DouyinBlogger`, `WorkWithBlogger` from `src/types`; `Skeleton` from `src/components/ui/skeleton.tsx`
- Produces: `BloggerTable` — 外层博主表格，手风琴展开，分页，空状态，加载态

- [ ] **Step 1: 创建 `BloggerTable.tsx`**

```typescript
"use client";

import { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Radio,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { BloggerRow } from "./BloggerRow";
import type { DouyinBlogger, WorkWithBlogger } from "@/types";

const BLOGGERS_PER_PAGE = 15;

export function BloggerTable({
  bloggers,
  selectedIds,
  onToggleSelect,
  onDelete,
  onExpand,
  expandedId,
  worksCache,
  loadingWorks,
  onTranscribe,
  onSummarize,
  loading,
  page,
  onPageChange,
  total,
}: {
  bloggers: DouyinBlogger[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onDelete: (slug: string) => void;
  onExpand: (id: number | null) => void;
  expandedId: number | null;
  worksCache: Record<number, WorkWithBlogger[]>;
  loadingWorks: boolean;
  onTranscribe: (id: number) => void;
  onSummarize: (id: number) => void;
  loading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / BLOGGERS_PER_PAGE));
  const allCurrentIds = bloggers.map((b) => b.id);
  const allSelected = bloggers.length > 0 && bloggers.every((b) => selectedIds.has(b.id));

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded" />
        ))}
      </div>
    );
  }

  // Empty state
  if (bloggers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-3 text-muted-foreground">
          <Radio className="h-10 w-10" />
        </div>
        <p className="text-muted-foreground">暂无博主数据</p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          请先添加抖音博主
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
                  onChange={() => {
                    if (allSelected) {
                      allCurrentIds.forEach((id) => selectedIds.has(id) && onToggleSelect(id));
                    } else {
                      // Select all on current page
                      const toSelect = allCurrentIds.filter((id) => !selectedIds.has(id));
                      toSelect.forEach((id) => onToggleSelect(id));
                    }
                  }}
                  className="h-4 w-4 rounded cursor-pointer accent-primary"
                />
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">博主</th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">粉丝数</th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground whitespace-nowrap">最近更新</th>
              <th className="py-2.5 pr-4 text-sm font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {bloggers.map((blogger) => (
              <BloggerRow
                key={blogger.id}
                blogger={blogger}
                isExpanded={expandedId === blogger.id}
                selected={selectedIds.has(blogger.id)}
                onToggleSelect={onToggleSelect}
                onToggleExpand={onExpand}
                onDelete={onDelete}
                works={worksCache[blogger.id] || []}
                loadingWorks={loadingWorks && expandedId === blogger.id}
                onTranscribe={onTranscribe}
                onSummarize={onSummarize}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between px-4 py-3 border-t">
        <span className="text-sm text-muted-foreground">
          共 {total} 位博主
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 0}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            上一页
          </button>
          <span className="text-sm text-muted-foreground">
            第 {page + 1}/{totalPages} 页
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            下一页
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/douyin/BloggerTable.tsx
git commit -m "feat: add BloggerTable with accordion, pagination, empty/loading states"
```

---

### Task 9: UI 组件 — `BloggerToolbar`

**Files:**
- Create: `src/app/settings/douyin/BloggerToolbar.tsx`

**Interfaces:**
- Consumes: `Button` from `src/components/ui/button.tsx`; `Dialog` from `src/components/ui/dialog.tsx`; `Tooltip`/`TooltipTrigger`/`TooltipContent` from `src/components/ui/tooltip.tsx`; lucide-react icons
- Produces: `BloggerToolbar` — 顶部工具栏，selection-aware 行为，评判按钮置灰

- [ ] **Step 1: 创建 `BloggerToolbar.tsx`**

```typescript
"use client";

import { useState } from "react";
import {
  UserPlus,
  RefreshCw,
  Video,
  Mic,
  Lightbulb,
  BarChart3,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddBloggerDialog } from "./AddBloggerDialog";

type ToolbarAction =
  | "update-profile"
  | "scan"
  | "transcribe"
  | "summarize"
  | "evaluate";

export function BloggerToolbar({
  selectedCount,
  totalCount,
  onAction,
  processingAction,
  onBloggerAdded,
}: {
  selectedCount: number;
  totalCount: number;
  onAction: (action: ToolbarAction) => void;
  processingAction: ToolbarAction | null;
  onBloggerAdded: () => void;
}) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: ToolbarAction;
    label: string;
  }>({ open: false, action: "scan", label: "" });

  const ACTION_LABELS: Record<ToolbarAction, string> = {
    "update-profile": "更新博主信息",
    scan: "更新博主视频",
    transcribe: "转写视频",
    summarize: "提取观点",
    evaluate: "评判",
  };

  const handleClick = (action: ToolbarAction) => {
    if (selectedCount === 0) {
      // No selection — confirm to operate on ALL
      setConfirmDialog({
        open: true,
        action,
        label: ACTION_LABELS[action],
      });
    } else {
      onAction(action);
    }
  };

  const handleConfirmAll = () => {
    onAction(confirmDialog.action);
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const isProcessing = (action: ToolbarAction) => processingAction === action;

  return (
    <TooltipProvider delay={300}>
      <div className="flex flex-wrap items-center gap-2">
        {/* 添加博主 */}
        <Button onClick={() => setAddDialogOpen(true)} size="sm">
          <UserPlus className="h-4 w-4 mr-1.5" />
          添加博主
        </Button>

        {/* 分隔 */}
        <div className="w-px h-6 bg-border mx-1" />

        {/* 更新博主信息 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleClick("update-profile")}
          disabled={isProcessing("update-profile")}
        >
          {isProcessing("update-profile") ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1.5" />
          )}
          更新博主信息
        </Button>

        {/* 更新博主视频 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleClick("scan")}
          disabled={isProcessing("scan")}
        >
          {isProcessing("scan") ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Video className="h-4 w-4 mr-1.5" />
          )}
          更新博主视频
        </Button>

        {/* 转写视频 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleClick("transcribe")}
          disabled={isProcessing("transcribe")}
        >
          {isProcessing("transcribe") ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Mic className="h-4 w-4 mr-1.5" />
          )}
          转写视频
        </Button>

        {/* 提取观点 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleClick("summarize")}
          disabled={isProcessing("summarize")}
        >
          {isProcessing("summarize") ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Lightbulb className="h-4 w-4 mr-1.5" />
          )}
          提取观点
        </Button>

        {/* 评判 — 置灰 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                variant="outline"
                size="sm"
                disabled
                className="opacity-50 cursor-not-allowed"
              >
                <BarChart3 className="h-4 w-4 mr-1.5" />
                评判
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            ASR 流水线就绪后启用
          </TooltipContent>
        </Tooltip>

        {/* 选中提示 */}
        {selectedCount > 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            已选 {selectedCount}/{totalCount} 位博主
          </span>
        )}
      </div>

      {/* 确认操作全部博主弹窗 */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认操作</DialogTitle>
            <DialogDescription>
              未选择任何博主，将对<strong>全部 {totalCount} 位</strong>博主执行「{confirmDialog.label}」操作。是否继续？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
            >
              取消
            </Button>
            <Button onClick={handleConfirmAll}>
              确认执行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加博主弹窗 */}
      <AddBloggerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdded={onBloggerAdded}
      />
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/douyin/BloggerToolbar.tsx
git commit -m "feat: add BloggerToolbar with selection-aware actions, evaluate disabled"
```

---

### Task 10: 重写 `page.tsx`

**Files:**
- Modify: `src/app/settings/douyin/page.tsx`（完全重写）

**Interfaces:**
- Consumes: `BloggerToolbar` (Task 9), `BloggerTable` (Task 8); `DouyinBlogger`, `WorkWithBlogger` from `src/types`; `Card`/`CardContent`/`CardHeader`/`CardTitle` from `src/components/ui/card.tsx`; lucide-react icons
- Produces: 完整页面

- [ ] **Step 1: 重写 `page.tsx`**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { Radio } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BloggerToolbar } from "./BloggerToolbar";
import { BloggerTable } from "./BloggerTable";
import type {
  DouyinBlogger,
  WorkWithBlogger,
  WorksResponse,
} from "@/types";

type ToolbarAction =
  | "update-profile"
  | "scan"
  | "transcribe"
  | "summarize"
  | "evaluate";

const BLOGGERS_PER_PAGE = 15;

export default function DouyinSettingsPage() {
  // --- Blogger state ---
  const [bloggers, setBloggers] = useState<DouyinBlogger[]>([]);
  const [bloggerTotal, setBloggerTotal] = useState(0);
  const [bloggerPage, setBloggerPage] = useState(0);
  const [loadingBloggers, setLoadingBloggers] = useState(true);

  // --- Selection state ---
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // --- Expand state (accordion: one at a time) ---
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [worksCache, setWorksCache] = useState<Record<number, WorkWithBlogger[]>>({});
  const [loadingWorks, setLoadingWorks] = useState(false);

  // --- Processing state ---
  const [processingAction, setProcessingAction] = useState<ToolbarAction | null>(null);
  const [message, setMessage] = useState("");

  // --- Fetch bloggers ---
  const fetchBloggers = useCallback(async () => {
    setLoadingBloggers(true);
    try {
      const res = await fetch("/api/douyin/bloggers?include=latest_opinion");
      if (res.ok) {
        const data = await res.json();
        // Client-side pagination for bloggers
        setBloggers(data);
        setBloggerTotal(data.length);
      }
    } catch {}
    setLoadingBloggers(false);
  }, []);

  useEffect(() => {
    fetchBloggers();
  }, [fetchBloggers]);

  // --- Fetch works for expanded blogger ---
  useEffect(() => {
    if (expandedId === null) return;
    const blogger = bloggers.find((b) => b.id === expandedId);
    if (!blogger) return;

    // Skip if already cached
    if (worksCache[expandedId]) return;

    setLoadingWorks(true);
    const fetchWorksForBlogger = async () => {
      try {
        const res = await fetch(
          `/api/douyin/works?blogger_slugs=${blogger.slug}&perPage=200`
        );
        if (res.ok) {
          const data: WorksResponse = await res.json();
          setWorksCache((prev) => ({
            ...prev,
            [expandedId]: data.works,
          }));
        }
      } catch {}
      setLoadingWorks(false);
    };
    fetchWorksForBlogger();
  }, [expandedId, bloggers, worksCache]);

  // --- Selection ---
  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // --- Expand ---
  const handleExpand = (id: number | null) => {
    setExpandedId(id);
  };

  // --- Delete ---
  const handleDelete = async (slug: string) => {
    try {
      const res = await fetch(`/api/douyin/bloggers/${slug}`, { method: "DELETE" });
      if (res.ok) {
        setMessage("博主已删除");
        setExpandedId(null);
        setWorksCache({});
        fetchBloggers();
      }
    } catch {
      setMessage("删除失败");
    }
  };

  // --- Single video operations ---
  const handleTranscribe = async (workId: number) => {
    setMessage("");
    try {
      const res = await fetch(`/api/douyin/works/${workId}/transcribe`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage("转写任务已启动");
        // Invalidate cache for the expanded blogger to refresh
        if (expandedId) {
          setWorksCache((prev) => {
            const next = { ...prev };
            delete next[expandedId];
            return next;
          });
        }
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
        setMessage("观点已提取");
        if (expandedId) {
          setWorksCache((prev) => {
            const next = { ...prev };
            delete next[expandedId];
            return next;
          });
        }
      } else {
        setMessage(`观点提取失败: ${data.error}`);
      }
    } catch {
      setMessage("观点提取请求失败");
    }
  };

  // --- Toolbar actions ---
  const getSelectedSlugs = (): string[] => {
    return bloggers
      .filter((b) => selectedIds.has(b.id))
      .map((b) => b.slug);
  };

  const handleToolbarAction = async (action: ToolbarAction) => {
    setMessage("");
    setProcessingAction(action);

    const slugs =
      selectedIds.size > 0
        ? getSelectedSlugs()
        : bloggers.map((b) => b.slug);

    let succeeded = 0;
    let failed = 0;

    for (const slug of slugs) {
      try {
        let res: Response;
        switch (action) {
          case "update-profile":
            res = await fetch(`/api/douyin/bloggers/${slug}/update-profile`, {
              method: "POST",
            });
            break;
          case "scan":
            res = await fetch(`/api/douyin/bloggers/${slug}/scan`, {
              method: "POST",
            });
            break;
          case "transcribe":
            res = await fetch(`/api/douyin/bloggers/${slug}/transcribe`, {
              method: "POST",
            });
            break;
          case "summarize":
            res = await fetch(`/api/douyin/bloggers/${slug}/summarize`, {
              method: "POST",
            });
            break;
          case "evaluate":
            res = await fetch(`/api/douyin/bloggers/${slug}/evaluate`, {
              method: "POST",
            });
            break;
          default:
            continue;
        }
        if (res.ok) succeeded++;
        else failed++;
      } catch {
        failed++;
      }
    }

    const actionLabels: Record<ToolbarAction, string> = {
      "update-profile": "更新博主信息",
      scan: "更新博主视频",
      transcribe: "转写视频",
      summarize: "提取观点",
      evaluate: "评判",
    };

    setMessage(
      `「${actionLabels[action]}」完成：${succeeded} 成功${
        failed > 0 ? `，${failed} 失败` : ""
      }`
    );

    setSelectedIds(new Set());
    setExpandedId(null);
    setWorksCache({});

    // Refresh blogger list and data
    await fetchBloggers();
    setProcessingAction(null);
  };

  // --- Paginate bloggers on client side ---
  const pagedBloggers = bloggers.slice(
    bloggerPage * BLOGGERS_PER_PAGE,
    (bloggerPage + 1) * BLOGGERS_PER_PAGE
  );

  const handlePageChange = (newPage: number) => {
    setBloggerPage(newPage);
    setSelectedIds(new Set());
    setExpandedId(null);
    setWorksCache({});
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
        {/* Toolbar */}
        <BloggerToolbar
          selectedCount={selectedIds.size}
          totalCount={bloggers.length}
          onAction={handleToolbarAction}
          processingAction={processingAction}
          onBloggerAdded={() => {
            fetchBloggers();
            setExpandedId(null);
            setWorksCache({});
          }}
        />

        {/* Feedback message */}
        {message && (
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 text-sm">
            <span className="text-muted-foreground">{message}</span>
            <button
              onClick={clearMessage}
              className="text-muted-foreground hover:text-foreground ml-2 text-base leading-none"
            >
              ×
            </button>
          </div>
        )}

        {/* Blogger table */}
        <BloggerTable
          bloggers={pagedBloggers}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onDelete={handleDelete}
          onExpand={handleExpand}
          expandedId={expandedId}
          worksCache={worksCache}
          loadingWorks={loadingWorks}
          onTranscribe={handleTranscribe}
          onSummarize={handleSummarize}
          loading={loadingBloggers}
          page={bloggerPage}
          onPageChange={handlePageChange}
          total={bloggerTotal}
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/douyin/page.tsx
git commit -m "feat: rewrite douyin settings as blogger+video two-level management"
```

---

### Task 11: 验证 — TypeScript 编译 + 构建

**Files:**
- No file changes — verification only

- [ ] **Step 1: 运行 TypeScript 类型检查**

```bash
npx tsc --noEmit
```
Expected: 无类型错误。如有类型不匹配（如 `and` import 冲突），逐一修复。

- [ ] **Step 2: 运行 Next.js 构建**

```bash
npm run build
```
Expected: 构建成功，无错误或警告。

- [ ] **Step 3: 启动 dev server 验证 UI**

```bash
npm run dev
```

访问 `http://localhost:3000/settings/douyin`，验证：
- 博主表格正确展示（头像、用户名、粉丝数、更新时间）
- 点击展开按钮可展开视频子表（手风琴：只展开一个）
- 视频子表显示标题（省略号）、时间、转写/观点/评判状态（lucide 图标）
- 标题可 hover 显示全文、可复制
- 工具栏按钮功能正常（有选中时操作选中，无选中时弹窗确认操作全部）
- 评判按钮置灰 + tooltip
- 删除博主弹窗确认
- 缩小浏览器窗口：表格横向滚动，工具栏按钮换行
- 空状态（无博主时）和加载骨架屏

- [ ] **Step 4: 提交最终验证修改（如有）**

```bash
git add -A
git commit -m "chore: fix type issues and final polish for douyin radar hierarchy"
```

---

## 验证清单

完成后逐项确认：
- [ ] 所有 emoji 已替换为 lucide-react 图标
- [ ] 转写状态使用 Clock/Loader2/CheckCircle2/XCircle + 颜色
- [ ] 文本单行省略号 + HoverCard 悬浮全文 + Clipboard 复制
- [ ] 手风琴展开（一次只展开一个博主）
- [ ] 工具栏有选中→操作选中，无选中→弹窗确认操作全部
- [ ] 评判按钮置灰 + Tooltip
- [ ] 删除博主有确认弹窗
- [ ] 视频子表内嵌分页器
- [ ] 移动端横向滚动 + 工具栏换行
- [ ] 空状态、加载态、错误态全覆盖
- [ ] API 路由与 service 层分离
- [ ] 旧组件（FilterBar / WorksTable / WorkRow / AddBloggerDialog）保留不动
