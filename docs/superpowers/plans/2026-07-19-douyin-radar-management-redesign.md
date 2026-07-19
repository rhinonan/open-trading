# 抖音雷达管理界面优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `settings/douyin` 管理页从嵌套表格重构为左右 master-detail 布局，新增类型/时长/观点列，支持单作品转写/观点提取/评判操作，观点省略+hover浮层，详情图标打开 Sheet 抽屉。

**Architecture:** 页面作为状态容器，左侧 BloggerSidebar（搜索过滤+hover操作），右侧 WorksTable（服务器分页+自动轮询），WorkRow 渲染单行（含操作按钮），WorkDrawer（Sheet）展示作品详情。复用现有 API 层，新增单作品评判端点。

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, @base-ui/react (Sheet/Popover), lucide-react icons

## Global Constraints

- 所有 DB 调用写 `await`（即使 better-sqlite3 同步）
- 落盘路径走 `dataPath()`（`src/lib/data-root.ts`）
- 新外部服务密钥/配置进 settings 表
- 业务层不感知部署形态
- 表行类型从 schema 派生（`typeof table.$inferSelect`）

---

### Task 1: 新增单作品评判 API 端点

**Files:**
- Create: `src/app/api/douyin/works/[id]/evaluate/route.ts`

**Interfaces:**
- Consumes: `enqueueForEvaluation` from `@/services/douyin/eval-queue`, `getEvalRunner` from `@/services/douyin/eval-runner`
- Produces: `POST /api/douyin/works/{id}/evaluate` → `{ success: true, workId }` | `{ error: string }`

- [ ] **Step 1: 创建路由文件**

```typescript
// src/app/api/douyin/works/[id]/evaluate/route.ts
import { NextRequest } from "next/server";
import { enqueueForEvaluation } from "@/services/douyin/eval-queue";
import { getEvalRunner } from "@/services/douyin/eval-runner";

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

    const count = enqueueForEvaluation({ workIds: [workId] });
    if (count === 0) {
      return Response.json(
        { error: "该作品不满足评判条件（需已转写且未评判）" },
        { status: 400 }
      );
    }
    getEvalRunner().kick();
    return Response.json({ success: true, workId });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Evaluation failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit --pretty src/app/api/douyin/works/\[id\]/evaluate/route.ts`
Expected: no errors

- [ ] **Step 3: 提交**

```bash
git add src/app/api/douyin/works/\[id\]/evaluate/route.ts
git commit -m "feat: add single work evaluate API endpoint"
```

---

### Task 2: BloggerSidebar 组件

**Files:**
- Create: `src/app/settings/douyin/BloggerSidebar.tsx`

**Interfaces:**
- Consumes: `DouyinBlogger` from `@/types`
- Produces: `BloggerSidebar({ bloggers, loading, selectedSlug, onSelect, onScan, onDelete, onAdd })` — 左侧 240px 博主列表，底部"添加博主"按钮

- [ ] **Step 1: 创建组件**

```typescript
// src/app/settings/douyin/BloggerSidebar.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Search, Radio, Trash2, Plus } from "lucide-react";
import type { DouyinBlogger } from "@/types";

interface BloggerSidebarProps {
  bloggers: DouyinBlogger[];
  loading: boolean;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onScan: (blogger: DouyinBlogger) => void;
  onDelete: (blogger: DouyinBlogger) => void;
  onAdd: () => void;
}

export function BloggerSidebar({
  bloggers,
  loading,
  selectedSlug,
  onSelect,
  onScan,
  onDelete,
  onAdd,
}: BloggerSidebarProps) {
  const [search, setSearch] = useState("");
  const filtered = bloggers.filter((b) =>
    b.nickname.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-60 shrink-0 border-r flex flex-col min-h-0">
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-7 h-8 text-sm"
            placeholder="搜索博主…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 rounded" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground text-center">
            {search ? "无匹配博主" : "暂无博主"}
          </div>
        ) : (
          filtered.map((b) => (
            <div
              key={b.id}
              onClick={() => onSelect(b.slug)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer group transition-colors ${
                selectedSlug === b.slug ? "bg-accent" : "hover:bg-muted/50"
              }`}
            >
              {b.avatarUrl ? (
                <img
                  src={b.avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{b.nickname}</p>
                <p className="text-xs text-muted-foreground">
                  {(b.followerCount ?? 0).toLocaleString()} 粉丝
                </p>
              </div>
              <div className="hidden group-hover:flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        onScan(b);
                      }}
                    >
                      <Radio className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>扫描新作品</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(b);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>删除博主</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add blogger button */}
      <div className="p-2 border-t shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={onAdd}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          添加博主
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add src/app/settings/douyin/BloggerSidebar.tsx
git commit -m "feat: add BloggerSidebar component"
```

---

### Task 3: WorkRow 组件（重写）

**Files:**
- Modify: `src/app/settings/douyin/WorkRow.tsx`（完全替换）

**Interfaces:**
- Consumes: `WorkWithBlogger` from `@/types`
- Produces: `WorkRow({ work, onDetail, onTranscribe, onSummarize, onEvaluate })` — 单行作品渲染，含类型/时长/观点/评判/操作列

- [ ] **Step 1: 重写 WorkRow.tsx**

```typescript
// src/app/settings/douyin/WorkRow.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FileText, RefreshCw, Lightbulb, Scale } from "lucide-react";
import type { WorkWithBlogger } from "@/types";

const TRANSCRIPT_STATUS: Record<
  string,
  { label: string; className: string }
> = {
  pending:   { label: "待转写", className: "bg-muted text-muted-foreground" },
  processing: { label: "转写中", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  done:      { label: "已转写", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  failed:    { label: "失败",   className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

const EVAL_STATUS: Record<
  string,
  { label: string; className: string }
> = {
  none:       { label: "未评判", className: "bg-muted text-muted-foreground" },
  pending:    { label: "待评判", className: "bg-muted text-muted-foreground" },
  processing: { label: "评判中", className: "bg-yellow-100 text-yellow-800" },
  done:       { label: "已评判", className: "bg-green-100 text-green-800" },
  failed:     { label: "失败",   className: "bg-red-100 text-red-800" },
};

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "-";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

interface WorkRowProps {
  work: WorkWithBlogger;
  onDetail: () => void;
  onTranscribe: () => void;
  onSummarize: () => void;
  onEvaluate: () => void;
}

export function WorkRow({
  work,
  onDetail,
  onTranscribe,
  onSummarize,
  onEvaluate,
}: WorkRowProps) {
  const tStatus = TRANSCRIPT_STATUS[work.transcriptStatus] ?? {
    label: work.transcriptStatus,
    className: "bg-muted",
  };
  const evalStatusKey = work.judgment?.evalStatus ?? "none";
  const eStatus = EVAL_STATUS[evalStatusKey] ?? {
    label: evalStatusKey,
    className: "bg-muted",
  };

  const isVideo = work.mediaType === 4;
  const canTranscribe =
    work.transcriptStatus === "pending" || work.transcriptStatus === "failed";
  const canSummarize =
    work.transcriptStatus === "done" && !work.opinionSummary;
  const canEvaluate =
    work.transcriptStatus === "done" &&
    (evalStatusKey === "none" || evalStatusKey === "failed");

  const opinionText = work.opinionSummary || "";

  return (
    <tr className="border-b hover:bg-muted/30 transition-colors">
      {/* 封面 */}
      <td className="py-2 pl-4">
        {work.coverUrl ? (
          <img
            src={work.coverUrl}
            alt=""
            className="h-10 w-10 rounded object-cover bg-muted"
            loading="lazy"
          />
        ) : (
          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </td>

      {/* 描述 */}
      <td className="py-2 max-w-[200px]">
        <p className="text-sm truncate" title={work.desc || undefined}>
          {work.desc || "(无文案)"}
        </p>
      </td>

      {/* 类型 */}
      <td className="py-2">
        <Badge
          variant="secondary"
          className={
            isVideo
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
              : "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
          }
        >
          {isVideo ? "视频" : "图集"}
        </Badge>
      </td>

      {/* 时长 */}
      <td className="py-2 text-sm text-muted-foreground whitespace-nowrap">
        {isVideo ? formatDuration(work.duration) : "-"}
      </td>

      {/* 转写状态 */}
      <td className="py-2">
        <Badge className={`text-xs ${tStatus.className}`}>
          {tStatus.label}
        </Badge>
      </td>

      {/* 观点 */}
      <td className="py-2">
        {opinionText ? (
          <HoverCard>
            <HoverCardTrigger asChild>
              <span className="text-sm cursor-default truncate block max-w-[120px]">
                {opinionText.length > 30
                  ? opinionText.slice(0, 30) + "…"
                  : opinionText}
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="w-80 text-sm leading-relaxed max-h-60 overflow-auto">
              {opinionText}
            </HoverCardContent>
          </HoverCard>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}
      </td>

      {/* 评判状态 */}
      <td className="py-2">
        {work.judgment &&
        (work.judgment.evaluable > 0 ||
          work.judgment.notYet > 0 ||
          work.judgment.notApplicable > 0) ? (
          <div className="flex items-center gap-1 text-xs">
            {work.judgment.correct > 0 && (
              <span title="正确">✅{work.judgment.correct}</span>
            )}
            {work.judgment.mostlyCorrect > 0 && (
              <span title="基本正确">💚{work.judgment.mostlyCorrect}</span>
            )}
            {work.judgment.incorrect > 0 && (
              <span title="不正确">❌{work.judgment.incorrect}</span>
            )}
            {work.judgment.notYet > 0 && (
              <span title="待验证">⏳{work.judgment.notYet}</span>
            )}
          </div>
        ) : (
          <Badge className={`text-xs ${eStatus.className}`}>
            {eStatus.label}
          </Badge>
        )}
      </td>

      {/* 操作 */}
      <td className="py-2 pr-4">
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onDetail}
              >
                <FileText className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>详情</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onTranscribe}
                disabled={!canTranscribe}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {work.transcriptStatus === "processing"
                ? "转写中…"
                : canTranscribe
                  ? "转写"
                  : "无法转写"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onSummarize}
                disabled={!canSummarize}
              >
                <Lightbulb className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {canSummarize ? "观点提取" : "无法提取"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onEvaluate}
                disabled={!canEvaluate}
              >
                <Scale className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {canEvaluate ? "评判" : "无法评判"}
            </TooltipContent>
          </Tooltip>
        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit --pretty src/app/settings/douyin/WorkRow.tsx`
Expected: no errors related to this file

- [ ] **Step 3: 提交**

```bash
git add src/app/settings/douyin/WorkRow.tsx
git commit -m "refactor: rewrite WorkRow with type/duration/opinion columns and action buttons"
```

---

### Task 4: WorksTable 组件（重写）

**Files:**
- Modify: `src/app/settings/douyin/WorksTable.tsx`（完全替换）

**Interfaces:**
- Consumes: `WorkRow` from `./WorkRow`, `WorksResponse`/`WorkWithBlogger` from `@/types`
- Produces: `WorksTable({ bloggerSlug, onOpenDrawer })` — 服务端分页表格+自动轮询+操作回调

- [ ] **Step 1: 重写 WorksTable.tsx**

```typescript
// src/app/settings/douyin/WorksTable.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { WorkRow } from "./WorkRow";
import type { WorkWithBlogger, WorksResponse } from "@/types";

interface WorksTableProps {
  bloggerSlug: string | null;
  onOpenDrawer: (work: WorkWithBlogger) => void;
}

export function WorksTable({ bloggerSlug, onOpenDrawer }: WorksTableProps) {
  const [data, setData] = useState<WorksResponse | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchWorks = useCallback(
    async (p: number) => {
      if (!bloggerSlug) return;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/douyin/works?blogger_slugs=${encodeURIComponent(bloggerSlug)}&page=${p}&perPage=20`
        );
        if (res.ok) {
          const json: WorksResponse = await res.json();
          setData(json);
        }
      } catch {
        // network error — keep stale data
      }
      setLoading(false);
    },
    [bloggerSlug]
  );

  // Reset page and refetch when blogger changes
  useEffect(() => {
    setPage(0);
    setData(null);
    if (bloggerSlug) fetchWorks(0);
  }, [bloggerSlug, fetchWorks]);

  // Fetch when page changes (skip page 0 — handled by the effect above)
  useEffect(() => {
    if (page > 0) fetchWorks(page);
  }, [page, fetchWorks]);

  // Poll while any work is processing
  useEffect(() => {
    if (!data) return;
    const hasProcessing = data.works.some(
      (w) =>
        w.transcriptStatus === "processing" || w.evalStatus === "processing"
    );
    if (!hasProcessing) return;
    const timer = setInterval(() => fetchWorks(page), 5000);
    return () => clearInterval(timer);
  }, [data, page, fetchWorks]);

  // ── Action handlers ──────────────────────────────────────

  const handleTranscribe = async (work: WorkWithBlogger) => {
    await fetch(`/api/douyin/works/${work.id}/transcribe`, { method: "POST" });
    fetchWorks(page);
  };

  const handleSummarize = async (work: WorkWithBlogger) => {
    await fetch(`/api/douyin/works/${work.id}/summarize`, { method: "POST" });
    fetchWorks(page);
  };

  const handleEvaluate = async (work: WorkWithBlogger) => {
    await fetch(`/api/douyin/works/${work.id}/evaluate`, { method: "POST" });
    fetchWorks(page);
  };

  // ── Render ───────────────────────────────────────────────

  if (!bloggerSlug) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        请从左侧选择博主
      </div>
    );
  }

  const totalPages = data ? Math.ceil(data.total / data.perPage) : 0;

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-xs text-muted-foreground sticky top-0 bg-background z-10">
              <th className="text-left font-medium py-2 pl-4 w-10">封面</th>
              <th className="text-left font-medium py-2">描述</th>
              <th className="text-left font-medium py-2 w-16">类型</th>
              <th className="text-left font-medium py-2 w-16">时长</th>
              <th className="text-left font-medium py-2 w-20">转写</th>
              <th className="text-left font-medium py-2 w-32">观点</th>
              <th className="text-left font-medium py-2 w-28">评判</th>
              <th className="text-left font-medium py-2 pr-4 w-36">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="py-2 px-2">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data && data.works.length > 0 ? (
              data.works.map((w) => (
                <WorkRow
                  key={w.id}
                  work={w}
                  onDetail={() => onOpenDrawer(w)}
                  onTranscribe={() => handleTranscribe(w)}
                  onSummarize={() => handleSummarize(w)}
                  onEvaluate={() => handleEvaluate(w)}
                />
              ))
            ) : (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-12 text-muted-foreground text-sm"
                >
                  暂无作品
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-3 border-t shrink-0">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit --pretty src/app/settings/douyin/WorksTable.tsx`
Expected: no errors

- [ ] **Step 3: 提交**

```bash
git add src/app/settings/douyin/WorksTable.tsx
git commit -m "refactor: rewrite WorksTable with server pagination and auto-polling"
```

---

### Task 5: WorkDrawer 组件

**Files:**
- Create: `src/app/settings/douyin/WorkDrawer.tsx`

**Interfaces:**
- Consumes: `WorkWithBlogger`/`PredictionItem` from `@/types`, `Sheet` from `@/components/ui/sheet`
- Produces: `WorkDrawer({ work, onClose })` — Sheet 抽屉，展示作品详情

- [ ] **Step 1: 创建 WorkDrawer.tsx**

```typescript
// src/app/settings/douyin/WorkDrawer.tsx
"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Play, ImageIcon } from "lucide-react";
import type { WorkWithBlogger, PredictionItem, JudgmentResult } from "@/types";

const JUDGMENT_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  correct:         { label: "正确",   color: "text-green-500",  icon: "✅" },
  mostly_correct:  { label: "基本正确", color: "text-emerald-500", icon: "💚" },
  incorrect:       { label: "不正确", color: "text-red-500",    icon: "❌" },
  not_applicable:  { label: "不涉及", color: "text-gray-400",   icon: "—" },
  not_yet:         { label: "待验证", color: "text-amber-500",  icon: "⏳" },
};

interface WorkDrawerProps {
  work: WorkWithBlogger | null;
  onClose: () => void;
}

export function WorkDrawer({ work, onClose }: WorkDrawerProps) {
  const [items, setItems] = useState<PredictionItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  useEffect(() => {
    if (!work) {
      setItems([]);
      return;
    }
    setItemsLoading(true);
    fetch(`/api/douyin/records?workId=${work.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false));
  }, [work?.id, work]); // eslint-disable-line react-hooks/exhaustive-deps

  const isVideo = work?.mediaType === 4;
  let stats: Record<string, number> = {};
  try {
    if (work?.statistics) stats = JSON.parse(work.statistics);
  } catch {}

  return (
    <Sheet open={work !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-auto">
        {work && (
          <>
            <SheetHeader>
              <SheetTitle>作品详情</SheetTitle>
            </SheetHeader>

            <div className="space-y-5 mt-4">
              {/* 作品信息 */}
              <section>
                {work.coverUrl && (
                  <div className="relative bg-black rounded-lg overflow-hidden mb-3">
                    <img
                      src={work.coverUrl}
                      alt=""
                      className="w-full object-contain max-h-[240px]"
                    />
                    {isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-12 w-12 rounded-full bg-white/80 flex items-center justify-center shadow-lg">
                          <Play className="h-5 w-5 fill-black text-black ml-0.5" />
                        </div>
                      </div>
                    )}
                    {!isVideo && (
                      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" /> 图集
                      </div>
                    )}
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap mb-2">
                  {work.desc || "(无文案)"}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    {new Date(work.publishedAt * 1000).toLocaleString("zh-CN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>👍 {stats.digg_count?.toLocaleString() || 0}</span>
                  <span>💬 {stats.comment_count?.toLocaleString() || 0}</span>
                  <span>↗ {stats.share_count?.toLocaleString() || 0}</span>
                </div>
              </section>

              {/* 语音转写 */}
              <section>
                <h3 className="text-sm font-medium mb-2">语音转写</h3>
                {work.transcript && work.transcriptStatus === "done" ? (
                  <p className="text-sm p-3 rounded-md bg-muted/50 whitespace-pre-wrap leading-relaxed">
                    {work.transcript}
                  </p>
                ) : work.transcriptStatus === "failed" ? (
                  <p className="text-sm text-muted-foreground">转写失败，可重试</p>
                ) : work.transcriptStatus === "processing" ? (
                  <p className="text-sm text-muted-foreground">转写中…</p>
                ) : (
                  <p className="text-sm text-muted-foreground">等待转写</p>
                )}
              </section>

              {/* 观点摘要 */}
              <section>
                <h3 className="text-sm font-medium mb-2">观点摘要</h3>
                {work.opinionSummary ? (
                  <p className="text-sm p-3 rounded-md bg-muted/50 whitespace-pre-wrap leading-relaxed">
                    {work.opinionSummary}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">-</p>
                )}
              </section>

              {/* 预测明细 */}
              <section>
                <h3 className="text-sm font-medium mb-2">
                  预测明细
                  {items.length > 0 && (
                    <span className="text-muted-foreground font-normal ml-1">
                      ({items.length})
                    </span>
                  )}
                </h3>
                {itemsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : items.length > 0 ? (
                  <div className="space-y-2">
                    {items.map((item) => {
                      const jc = JUDGMENT_CONFIG[item.judgment as JudgmentResult];
                      return (
                        <div
                          key={item.id}
                          className="border rounded-lg p-3 text-sm"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {jc && (
                              <Badge
                                variant="secondary"
                                className={jc.color}
                              >
                                {jc.icon} {jc.label}
                              </Badge>
                            )}
                            {item.relatedSymbols && (
                              <span className="text-xs text-muted-foreground font-mono">
                                {item.relatedSymbols}
                              </span>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap">
                            {item.predictedContent}
                          </p>
                          {item.reasoning && (
                            <details className="mt-2">
                              <summary className="text-xs text-muted-foreground cursor-pointer">
                                推理依据
                              </summary>
                              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                                {item.reasoning}
                              </p>
                            </details>
                          )}
                          {item.judgment === "not_yet" && item.verifiableAfter && (
                            <p className="text-xs text-amber-500 mt-1">
                              ⏳ 预计 {item.verifiableAfter} 后可验证
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无预测数据</p>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit --pretty src/app/settings/douyin/WorkDrawer.tsx`
Expected: no errors

- [ ] **Step 3: 提交**

```bash
git add src/app/settings/douyin/WorkDrawer.tsx
git commit -m "feat: add WorkDrawer Sheet component"
```

---

### Task 6: 重写 page.tsx

**Files:**
- Modify: `src/app/settings/douyin/page.tsx`（完全替换）

**Interfaces:**
- Consumes: `BloggerSidebar`, `WorksTable`, `WorkDrawer`, `@/types`
- Produces: 左右布局的完整管理页

- [ ] **Step 1: 重写 page.tsx**

```typescript
// src/app/settings/douyin/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Radio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BloggerSidebar } from "./BloggerSidebar";
import { WorksTable } from "./WorksTable";
import { WorkDrawer } from "./WorkDrawer";
import { AddBloggerDialog } from "./AddBloggerDialog";
import type { DouyinBlogger, WorkWithBlogger } from "@/types";

export default function DouyinSettingsPage() {
  const [bloggers, setBloggers] = useState<DouyinBlogger[]>([]);
  const [loadingBloggers, setLoadingBloggers] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [drawerWork, setDrawerWork] = useState<WorkWithBlogger | null>(null);
  const [message, setMessage] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // ── Fetch bloggers ──────────────────────────────────────

  const fetchBloggers = useCallback(async () => {
    setLoadingBloggers(true);
    try {
      const res = await fetch("/api/douyin/bloggers?include=latest_opinion");
      if (res.ok) setBloggers(await res.json());
    } catch {
      // network error
    }
    setLoadingBloggers(false);
  }, []);

  useEffect(() => {
    fetchBloggers();
  }, [fetchBloggers]);

  // ── Blogger actions ─────────────────────────────────────

  const handleScan = async (blogger: DouyinBlogger) => {
    setMessage("");
    try {
      const res = await fetch(`/api/douyin/bloggers/${blogger.slug}/scan`, {
        method: "POST",
      });
      if (res.ok) {
        setMessage(`已扫描「${blogger.nickname}」`);
      } else {
        const data = await res.json();
        setMessage(`扫描失败: ${data.error || "未知错误"}`);
      }
    } catch {
      setMessage("扫描请求失败");
    }
  };

  const handleDelete = async (blogger: DouyinBlogger) => {
    if (!confirm(`确定删除博主「${blogger.nickname}」及其所有作品？`)) return;
    try {
      const res = await fetch(`/api/douyin/bloggers/${blogger.slug}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMessage(`已删除「${blogger.nickname}」`);
        if (selectedSlug === blogger.slug) setSelectedSlug(null);
        fetchBloggers();
      } else {
        setMessage("删除失败");
      }
    } catch {
      setMessage("删除失败");
    }
  };

  // ── Render ──────────────────────────────────────────────

  return (
    <Card className="h-[calc(100vh-8rem)] flex flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Radio className="h-4 w-4" />
          抖音雷达管理
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex min-h-0 p-0">
        {/* Left: Blogger sidebar */}
        <BloggerSidebar
          bloggers={bloggers}
          loading={loadingBloggers}
          selectedSlug={selectedSlug}
          onSelect={setSelectedSlug}
          onScan={handleScan}
          onDelete={handleDelete}
          onAdd={() => setAddDialogOpen(true)}
        />

        {/* Right: Works table + drawer */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Message banner */}
          {message && (
            <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b text-sm shrink-0">
              <span className="text-muted-foreground">{message}</span>
              <button
                onClick={() => setMessage("")}
                className="text-muted-foreground hover:text-foreground ml-2"
              >
                ×
              </button>
            </div>
          )}

          <WorksTable
            bloggerSlug={selectedSlug}
            onOpenDrawer={setDrawerWork}
          />
        </div>

        <WorkDrawer
          work={drawerWork}
          onClose={() => setDrawerWork(null)}
        />

        <AddBloggerDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          onAdded={() => {
            setAddDialogOpen(false);
            fetchBloggers();
          }}
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit --pretty src/app/settings/douyin/page.tsx`
Expected: no errors

- [ ] **Step 3: 启动开发服务器验证页面可加载**

Run: `npm run dev`
Open: `http://localhost:3000/settings/douyin`
Check: Left sidebar shows bloggers, clicking one loads works table on the right

- [ ] **Step 4: 提交**

```bash
git add src/app/settings/douyin/page.tsx
git commit -m "refactor: rewrite douyin settings page with left-right master-detail layout"
```

---

### Task 7: 清理旧组件

**Files:**
- Delete: `src/app/settings/douyin/BloggerTable.tsx`
- Delete: `src/app/settings/douyin/BloggerRow.tsx`
- Delete: `src/app/settings/douyin/VideoSubTable.tsx`
- Delete: `src/app/settings/douyin/VideoSubRow.tsx`
- Delete: `src/app/settings/douyin/FilterBar.tsx`
- Delete: `src/app/settings/douyin/BloggerToolbar.tsx`

- [ ] **Step 1: 确认无引用**

Run: `npx tsc --noEmit 2>&1 | grep -E "BloggerTable|BloggerRow|VideoSubTable|VideoSubRow|FilterBar|BloggerToolbar"`
Expected: no output (no imports remain)

- [ ] **Step 2: 删除文件并提交**

```bash
git rm src/app/settings/douyin/BloggerTable.tsx
git rm src/app/settings/douyin/BloggerRow.tsx
git rm src/app/settings/douyin/VideoSubTable.tsx
git rm src/app/settings/douyin/VideoSubRow.tsx
git rm src/app/settings/douyin/FilterBar.tsx
git rm src/app/settings/douyin/BloggerToolbar.tsx
git commit -m "chore: remove old nested-table components"
```

- [ ] **Step 3: 最终全量编译验证**

Run: `npm run build`
Expected: build succeeds
