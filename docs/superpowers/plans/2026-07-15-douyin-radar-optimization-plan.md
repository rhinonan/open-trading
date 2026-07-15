# 抖音雷达优化 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将抖音雷达从舆情分析中独立为一级导航模块，支持预测类/技术类手动分类，管理功能迁入设置页。

**Architecture:** 路由从 `/sentiment/douyin` 迁移到 `/douyin`；`bloggers.category` 值域改为 `predictor | technical`；works 表新增 `opinion_summary` 字段存储 LLM 提取的观点摘要；首页变为只读信息流，管理功能迁至 `/settings`。

**Tech Stack:** Next.js App Router, Drizzle ORM + SQLite, TypeScript, Tailwind CSS, shadcn/ui, Anthropic SDK (LLM)

## Global Constraints

- 遵循项目现有代码风格（client component, `"use client"`, fetch-based data loading）
- 使用已有的 UI 组件库（Card, Button, Badge, Skeleton, Select 等）
- SQLite 不支持 ALTER COLUMN，schema 中 enum 变更仅影响 TypeScript 类型
- 所有新页面均为 client component（与现有风格一致）
- 抖音雷达 API 路由路径不变（`/api/douyin/*`）

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `src/db/schema.ts` | category 值域变更 + opinion_summary 字段 |
| 修改 | `src/types/index.ts` | BloggerCategory 类型 + DouyinWork 新增字段 |
| 新建 | `drizzle/0002_*.sql` | works 表加 opinion_summary 列（drizzle-kit 自动生成） |
| 修改 | `src/services/douyin/blogger-service.ts` | addBlogger 接收 category 参数 |
| 新建 | `src/services/douyin/opinion-service.ts` | LLM 提取观点摘要 |
| 修改 | `src/services/douyin/pipeline-service.ts` | 转写完成后调用观点提取 |
| 修改 | `src/app/api/douyin/bloggers/route.ts` | GET 支持 include=latest_opinion；POST 接收 category |
| 修改 | `src/components/layout/sidebar.tsx` | NAV_ITEMS 新增抖音雷达（首位） |
| 修改 | `src/components/layout/header.tsx` | BREADCRUMB_MAP 新增 /douyin |
| 修改 | `src/app/sentiment/page.tsx` | 移除抖音监控 tab |
| 新建 | `src/app/douyin/page.tsx` | 抖音雷达首页（只读信息流） |
| 新建 | `src/app/douyin/[id]/page.tsx` | 博主详情页（按分类差异化） |
| 修改 | `src/app/settings/page.tsx` | 新增抖音雷达管理区域 |
| 删除 | `src/app/sentiment/douyin/page.tsx` | 旧首页 |
| 删除 | `src/app/sentiment/douyin/[id]/page.tsx` | 旧详情页 |

---

### Task 1: 数据模型变更

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/types/index.ts`
- Create: `drizzle/0002_breezy_cannonball.sql`

**Interfaces:**
- Produces: `BloggerCategory = "predictor" | "technical"`, `DouyinWork.opinionSummary`, `DouyinWork.videoUrl`

- [ ] **Step 1: 更新 schema.ts — category 值域 + opinion_summary 字段**

```typescript
// src/db/schema.ts — 修改 bloggers.category 的 enum 值
// 旧: text("category", { enum: ["pending", "predictor", "non_predictor"] })
// 新:
category: text("category", { enum: ["predictor", "technical"] })
  .notNull()
  .default("predictor"),
```

在 works 表定义中，`duration` 字段之后新增：

```typescript
// src/db/schema.ts — works 表新增字段
opinionSummary: text("opinion_summary").notNull().default(""),
```

- [ ] **Step 2: 更新 types/index.ts**

```typescript
// src/types/index.ts
// 旧: export type BloggerCategory = "pending" | "predictor" | "non_predictor";
// 新:
export type BloggerCategory = "predictor" | "technical";
```

在 `DouyinWork` 接口中，`videoUrl` 之后新增：

```typescript
export interface DouyinWork {
  // ... 现有字段保持不变
  videoUrl: string | null;        // 确保此字段存在（可能之前漏了）
  opinionSummary: string;         // 新增：LLM 提取的观点摘要
  // ... 其余字段
}
```

- [ ] **Step 3: 生成 Drizzle 迁移**

```bash
npx drizzle-kit generate
```

检查生成的 SQL 文件（`drizzle/0002_*.sql`），确认包含 `opinion_summary` 列的 ALTER TABLE 语句。

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/types/index.ts drizzle/
git commit -m "feat: 数据模型变更 — category 改为 predictor/technical，works 新增 opinion_summary"
```

---

### Task 2: Blogger Service — 手动分类

**Files:**
- Modify: `src/services/douyin/blogger-service.ts`

**Interfaces:**
- Produces: `addBlogger(douyinUid: string, category: BloggerCategory): Promise<DouyinBlogger>`

- [ ] **Step 1: 修改 addBlogger 签名和实现**

```typescript
// src/services/douyin/blogger-service.ts

// 修改函数签名：
export async function addBlogger(
  douyinUid: string,
  category: BloggerCategory = "predictor"
): Promise<DouyinBlogger> {
  // Check for duplicates — 不变
  const existing = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.douyinUid, douyinUid))
    .get();
  if (existing) {
    throw new Error(`博主 ${douyinUid} 已存在`);
  }

  // Fetch user profile from TikHub — 不变
  const profile = await fetchUserProfile(douyinUid);
  if (!profile) {
    throw new Error(`无法获取博主 ${douyinUid} 的信息，请检查 ID 是否正确`);
  }

  const pickAvatarUrl = (urls?: string[]): string => {
    if (!urls?.length) return "";
    return urls.find((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u)) || urls[0];
  };
  const avatar =
    pickAvatarUrl(profile.avatar_medium?.url_list) ||
    pickAvatarUrl(profile.avatar_thumb?.url_list) ||
    "";

  // 改动点：category 使用传入参数，不再硬编码 "pending"
  const blogger = db
    .insert(bloggers)
    .values({
      douyinUid: douyinUid,
      nickname: profile.nickname || "",
      avatarUrl: avatar,
      signature: profile.signature || "",
      followerCount: profile.follower_count || 0,
      category,  // 使用参数
    })
    .returning()
    .get() as DouyinBlogger;

  // 删除 TODO 注释块（classifyBlogger 已不需要）
  return blogger;
}
```

同时删除文件顶部和底部的 TODO 注释块（classifyBlogger 相关的大段注释）。

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/services/douyin/blogger-service.ts
git commit -m "feat: addBlogger 支持手动选择分类（predictor/technical）"
```

---

### Task 3: 观点提取服务 + Pipeline 集成

**Files:**
- Create: `src/services/douyin/opinion-service.ts`
- Modify: `src/services/douyin/pipeline-service.ts`

**Interfaces:**
- Consumes: `callClaude` from `@/lib/llm`, `works.opinionSummary` from Task 1
- Produces: `extractOpinion(transcript: string): Promise<string>`

- [ ] **Step 1: 创建 opinion-service.ts**

```typescript
// src/services/douyin/opinion-service.ts
import { callClaude, parseClaudeJson } from "@/lib/llm";

const SYSTEM_PROMPT = `你是一个财经内容分析师。用户会给你一段抖音博主的口播转写文本，请你用一句话（不超过80字）总结该博主的观点或判断。

要求：
1. 只返回一句话总结，不要任何额外解释
2. 如果文本中包含具体的预测判断（涨跌、点位、时间），必须包含在总结中
3. 如果是纯技术分析类内容（K线形态、指标解读等），请概括其核心论点
4. 如果文本内容与投资无关，返回"非投资相关内容"
5. 直接返回总结文字，不要JSON格式`;

export async function extractOpinion(transcript: string): Promise<string> {
  if (!transcript || transcript.trim().length === 0) {
    return "";
  }

  try {
    const result = await callClaude(
      transcript.slice(0, 4000), // 限制输入长度
      SYSTEM_PROMPT,
      { max_tokens: 200, temperature: 0.3 }
    );
    return result.trim();
  } catch (err) {
    console.error("[opinion] LLM 提取观点失败:", err);
    return "";
  }
}
```

- [ ] **Step 2: 在 pipeline-service.ts 中集成观点提取**

在 `processOneWork` 函数的第 6 步（回写 DB）之后，新增观点提取步骤。修改 `processOneWork` 函数中转录完成后的代码：

```typescript
// src/services/douyin/pipeline-service.ts

// 文件顶部新增 import
import { extractOpinion } from "./opinion-service";

// 在 processOneWork 函数中，替换原来的步骤 6（回写 DB）:
//    // 6. 回写 DB
//    db.update(works)
//      .set({
//        transcript,
//        transcriptStatus: "done",
//      })
//      .where(eq(works.id, id))
//      .run();

// 改为:

    // 6. 提取观点摘要
    let opinionSummary = "";
    try {
      console.log(`${logPrefix} 开始提取观点摘要...`);
      opinionSummary = await extractOpinion(transcript);
      console.log(`${logPrefix} 观点摘要 → ${opinionSummary.slice(0, 50)}...`);
    } catch (opinionErr) {
      console.error(`${logPrefix} 观点提取失败（非致命）:`, opinionErr);
    }

    // 7. 回写 DB（含 transcript + opinion_summary）
    db.update(works)
      .set({
        transcript,
        transcriptStatus: "done",
        opinionSummary,
      })
      .where(eq(works.id, id))
      .run();

    console.log(`${logPrefix} ✅ 全部完成`);
    return { awemeId, status: "done", transcript };
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/services/douyin/opinion-service.ts src/services/douyin/pipeline-service.ts
git commit -m "feat: 观点提取服务 + pipeline 集成"
```

---

### Task 4: API 路由适配

**Files:**
- Modify: `src/app/api/douyin/bloggers/route.ts`

**Interfaces:**
- Consumes: `addBlogger(uid, category)` from Task 2
- Produces: `GET ?include=latest_opinion` 返回博主列表+最新观点；`POST { douyinUid, category }`

- [ ] **Step 1: 修改 bloggers GET — 支持 include=latest_opinion**

```typescript
// src/app/api/douyin/bloggers/route.ts

import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") as
    | "predictor"
    | "technical"
    | null;
  const include = searchParams.get("include");

  try {
    const bloggers = await bloggerService.listBloggers(
      category || undefined
    );

    // 如果需要附带最新观点摘要
    if (include === "latest_opinion") {
      const enriched = bloggers.map((blogger) => {
        const latestWork = db
          .select({
            opinionSummary: works.opinionSummary,
            publishedAt: works.publishedAt,
          })
          .from(works)
          .where(
            and(
              eq(works.bloggerId, blogger.id),
              eq(works.transcriptStatus, "done")
            )
          )
          .orderBy(desc(works.publishedAt))
          .limit(1)
          .get();

        return {
          ...blogger,
          latestOpinion: latestWork?.opinionSummary || "",
          latestWorkAt: latestWork?.publishedAt || null,
        };
      });
      return Response.json(enriched);
    }

    return Response.json(bloggers);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { douyinUid, category } = await request.json();
    if (!douyinUid || typeof douyinUid !== "string") {
      return Response.json(
        { error: "douyinUid is required" },
        { status: 400 }
      );
    }

    // 验证 category
    const validCategory = ["predictor", "technical"].includes(category)
      ? category
      : "predictor";

    const blogger = await bloggerService.addBlogger(douyinUid, validCategory);
    return Response.json(blogger, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal error";
    const status = message.includes("已存在") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
```

- [ ] **Step 2: 前端类型适配 — 拓展 API 返回类型**

在 `src/types/index.ts` 中新增：

```typescript
export interface DouyinBloggerWithOpinion extends DouyinBlogger {
  latestOpinion: string;
  latestWorkAt: number | null;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/douyin/bloggers/route.ts src/types/index.ts
git commit -m "feat: bloggers API 支持 category 参数 + latest_opinion 扩展"
```

---

### Task 5: 导航 & 面包屑

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/header.tsx`

- [ ] **Step 1: sidebar.tsx — 新增抖音雷达导航项（首位）+ 新图标**

```typescript
// src/components/layout/sidebar.tsx

// import 中新增 Radio 图标（已有，无需改动）

const NAV_ITEMS = [
  { label: "抖音雷达", href: "/douyin", icon: Radio },   // 新增，首位
  { label: "仪表盘", href: "/", icon: LayoutDashboard },
  { label: "个股分析", href: "/stocks", icon: TrendingUp },
  { label: "行业分析", href: "/industry", icon: Building2 },
  { label: "舆情分析", href: "/sentiment", icon: MessageCircle },
  { label: "财报 & 研报", href: "/financials", icon: FileText },
  { label: "Agent 管理", href: "/agents", icon: Bot },
  { label: "设置", href: "/settings", icon: Settings },
];
```

- [ ] **Step 2: header.tsx — BREADCRUMB_MAP 新增 /douyin**

```typescript
// src/components/layout/header.tsx

const BREADCRUMB_MAP: Record<string, string> = {
  "/": "仪表盘",
  "/douyin": "抖音雷达",        // 新增
  "/stocks": "个股分析",
  "/industry": "行业分析",
  "/sentiment": "舆情分析",
  "/financials": "财报 & 研报",
  "/agents": "Agent 管理",
  "/settings": "设置",
};
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/sidebar.tsx src/components/layout/header.tsx
git commit -m "feat: 导航新增抖音雷达（首位），面包屑适配"
```

---

### Task 6: 舆情页清理

**Files:**
- Modify: `src/app/sentiment/page.tsx`

- [ ] **Step 1: 移除抖音监控 tab**

```typescript
// src/app/sentiment/page.tsx

// 删除 import 中的 Radio
// 旧: import { MessageCircle, Radio } from "lucide-react";
// 新:
import { MessageCircle } from "lucide-react";

export default function SentimentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">舆情分析</h1>
        <p className="text-muted-foreground mt-1">
          社交媒体情绪监测与热点话题追踪
        </p>
      </div>

      {/* 移除整个 sub-nav tabs 区块 */}

      <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <MessageCircle className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">
            舆情分析功能即将上线
          </p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示舆情时间线、情绪仪表盘与来源分布
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/sentiment/page.tsx
git commit -m "refactor: 舆情页移除抖音监控 tab"
```

---

### Task 7: 抖音雷达首页 `/douyin`

**Files:**
- Create: `src/app/douyin/page.tsx`

**Interfaces:**
- Consumes: `GET /api/douyin/bloggers?include=latest_opinion` (from Task 4), `DouyinBloggerWithOpinion` type

- [ ] **Step 1: 创建只读信息流首页**

```typescript
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, TrendingUp, Wrench, Settings } from "lucide-react";
import type { DouyinBloggerWithOpinion } from "@/types";

const categoryConfig: Record<string, { label: string; icon: typeof TrendingUp }> = {
  predictor: { label: "预测类", icon: TrendingUp },
  technical: { label: "技术类", icon: Wrench },
};

export default function DouyinPage() {
  const [bloggers, setBloggers] = useState<DouyinBloggerWithOpinion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"predictor" | "technical">("predictor");

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/douyin/bloggers?include=latest_opinion");
      if (res.ok) setBloggers(await res.json());
      setLoading(false);
    }
    load();
  }, []);

  const filtered = bloggers.filter((b) => b.category === activeTab);
  const predictorCount = bloggers.filter((b) => b.category === "predictor").length;
  const technicalCount = bloggers.filter((b) => b.category === "technical").length;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">抖音雷达</h1>
        <p className="text-muted-foreground mt-1">
          追踪抖音财经博主观点与预测
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{predictorCount}</p>
                <p className="text-sm text-muted-foreground">预测类博主</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Wrench className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{technicalCount}</p>
                <p className="text-sm text-muted-foreground">技术类博主</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 分类 Tab */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab("predictor")}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === "predictor"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          预测类
          {predictorCount > 0 && (
            <span className="text-xs bg-muted-foreground/20 px-1.5 py-0.5 rounded-full">
              {predictorCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("technical")}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === "technical"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Wrench className="h-4 w-4" />
          技术类
          {technicalCount > 0 && (
            <span className="text-xs bg-muted-foreground/20 px-1.5 py-0.5 rounded-full">
              {technicalCount}
            </span>
          )}
        </button>
      </div>

      {/* 博主列表 */}
      {filtered.length === 0 ? (
        <Card className="flex items-center justify-center min-h-[200px] border-dashed">
          <CardContent className="text-center py-12">
            <Radio className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-muted-foreground">
              {bloggers.length === 0
                ? "暂无博主，请前往设置页添加"
                : `暂无${activeTab === "predictor" ? "预测类" : "技术类"}博主`}
            </p>
            {bloggers.length === 0 && (
              <Link
                href="/settings"
                className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Settings className="h-3 w-3" />
                前往设置 &gt; 抖音雷达管理
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((blogger) => {
            const cat = categoryConfig[blogger.category] || categoryConfig.predictor;
            const CatIcon = cat.icon;

            return (
              <Link key={blogger.id} href={`/douyin/${blogger.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start gap-4">
                      {/* 头像 */}
                      {blogger.avatarUrl ? (
                        <img
                          src={blogger.avatarUrl}
                          alt={blogger.nickname}
                          className="h-12 w-12 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <Radio className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        {/* 博主信息行 */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold truncate">
                            {blogger.nickname}
                          </span>
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            <CatIcon className="h-3 w-3 mr-1" />
                            {cat.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {blogger.followerCount.toLocaleString()} 粉丝
                          </span>
                        </div>

                        {/* 最新观点 */}
                        {blogger.latestOpinion ? (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {blogger.latestOpinion}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground/50 italic mt-1">
                            暂无观点
                          </p>
                        )}

                        {/* 底部时间 */}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-muted-foreground/60">
                            {blogger.latestWorkAt
                              ? formatRelativeTime(blogger.latestWorkAt)
                              : ""}
                          </span>
                          <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                            查看详情 →
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 相对时间格式化 */
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
```

- [ ] **Step 2: Verify page renders**

```bash
npx tsc --noEmit
```

访问 `http://localhost:3000/douyin`，确认页面加载。

- [ ] **Step 3: Commit**

```bash
git add src/app/douyin/page.tsx
git commit -m "feat: 抖音雷达首页 — 只读信息流 + 分类 Tab"
```

---

### Task 8: 博主详情页 `/douyin/[id]`

**Files:**
- Create: `src/app/douyin/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/douyin/bloggers/[id]`, `GET /api/douyin/records?blogger_id=`

- [ ] **Step 1: 基于现有详情页代码，修改为按分类差异化展示**

关键改动点（在现有 `/sentiment/douyin/[id]/page.tsx` 基础上）：

1. **tab 类型和初始值**：类型扩展为 `"records" | "trend" | "works" | "opinions"`。预测类默认 `"records"`，技术类默认 `"opinions"`——在 blogger 数据加载后通过 `useEffect` 调整。
2. 返回链接改为 `href="/douyin"`
3. 分类标签文本更新：
   ```typescript
   // 旧标签映射替换为:
   const categoryLabel = blogger.category === "predictor" ? "预测类博主" : "技术类博主";
   const categoryVariant = blogger.category === "predictor" ? "default" : "secondary";
   ```
4. Tab 根据 `blogger.category` 差异化：
   - 预测类：三个 tab（预测记录 / 准确率趋势 / 作品列表）
   - 技术类：两个 tab（观点总结 / 作品列表）
5. 新增"观点总结"tab（技术类专用）：
   ```typescript
   {tab === "opinions" && (
     <div className="space-y-4">
       {works.filter(w => w.transcriptStatus === "done" && w.opinionSummary).length === 0 ? (
         <Card className="border-dashed">
           <CardContent className="text-center py-12">
             <p className="text-muted-foreground">暂无观点总结</p>
             <p className="text-sm text-muted-foreground/60 mt-1">
               作品完成转写后将自动提取观点
             </p>
           </CardContent>
         </Card>
       ) : (
         works
           .filter(w => w.transcriptStatus === "done" && w.opinionSummary)
           .sort((a, b) => b.publishedAt - a.publishedAt)
           .map((work) => (
             <Card key={work.id}>
               <CardContent className="pt-4 pb-3">
                 <p className="text-sm whitespace-pre-wrap">{work.opinionSummary}</p>
                 <div className="flex items-center justify-between mt-2">
                   <span className="text-xs text-muted-foreground">
                     {new Date(work.publishedAt * 1000).toLocaleDateString("zh-CN")}
                   </span>
                   <button
                     onClick={() => setSelectedWork(work)}
                     className="text-xs text-primary hover:underline"
                   >
                     查看原文 →
                   </button>
                 </div>
               </CardContent>
             </Card>
           ))
       )}
     </div>
   )}
   ```

6. 技术类的 tab 渲染（替换现有的三 tab）：
   ```typescript
   {blogger.category === "technical" ? (
     <>
       <button onClick={() => { setTab("opinions"); loadWorks(); }}
         className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
           tab === "opinions" ? "bg-accent" : "text-muted-foreground hover:text-foreground"
         }`}>观点总结</button>
       <button onClick={() => { setTab("works"); loadWorks(); }}
         className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
           tab === "works" ? "bg-accent" : "text-muted-foreground hover:text-foreground"
         }`}>作品列表</button>
     </>
   ) : (
     <>
       {/* 原有的预测类三 tab 保持不变 */}
     </>
   )}
   ```

7. `tab` 类型定义已在第1点更新为 `"records" | "trend" | "works" | "opinions"`

- [ ] **Step 2: 完整迁移文件**

由于改动点较多，建议直接复制 `src/app/sentiment/douyin/[id]/page.tsx` 到 `src/app/douyin/[id]/page.tsx`，然后应用上述改动。`WorkDetailSheet` 内部组件保持不变。

- [ ] **Step 3: Commit**

```bash
git add src/app/douyin/[id]/page.tsx
git commit -m "feat: 博主详情页 — 按预测类/技术类差异化 tab 展示"
```

---

### Task 9: 设置页 — 抖音雷达管理

**Files:**
- Modify: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `POST /api/douyin/bloggers`, `DELETE /api/douyin/bloggers/[id]`, `GET /api/douyin/bloggers`, `POST /api/douyin/scan`, `POST /api/douyin/transcribe`

- [ ] **Step 1: 重写设置页，新增抖音雷达管理区域**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  Settings,
  Sun,
  Moon,
  Monitor,
  Radio,
  Plus,
  RefreshCw,
  Mic,
  Loader2,
  Trash2,
  UserPlus,
} from "lucide-react";
import type { DouyinBlogger } from "@/types";

const categoryLabels: Record<string, { label: string; variant: "default" | "secondary" }> = {
  predictor: { label: "预测类", variant: "default" },
  technical: { label: "技术类", variant: "secondary" },
};

export default function SettingsPage() {
  // --- 抖音管理状态 ---
  const [bloggers, setBloggers] = useState<DouyinBlogger[]>([]);
  const [loading, setLoading] = useState(true);
  const [uidInput, setUidInput] = useState("");
  const [categorySelect, setCategorySelect] = useState<"predictor" | "technical">("predictor");
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [message, setMessage] = useState("");

  const fetchBloggers = useCallback(async () => {
    const res = await fetch("/api/douyin/bloggers");
    if (res.ok) setBloggers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchBloggers(); }, [fetchBloggers]);

  const handleAdd = async () => {
    if (!uidInput.trim()) return;
    setAdding(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/bloggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ douyinUid: uidInput.trim(), category: categorySelect }),
      });
      const data = await res.json();
      if (res.ok) {
        setUidInput("");
        setMessage(`已添加 ${data.nickname}`);
        fetchBloggers();
      } else {
        setMessage(`错误: ${data.error}`);
      }
    } catch {
      setMessage("添加失败，请检查网络");
    }
    setAdding(false);
  };

  const handleDelete = async (id: number, nickname: string) => {
    if (!confirm(`确定要删除博主「${nickname}」吗？相关作品和评判记录将一并删除。`)) return;
    try {
      const res = await fetch(`/api/douyin/bloggers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMessage(`已删除 ${nickname}`);
        fetchBloggers();
      } else {
        const data = await res.json();
        setMessage(`错误: ${data.error}`);
      }
    } catch {
      setMessage("删除失败");
    }
  };

  const handleScan = async () => {
    setScanning(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/scan", { method: "POST" });
      const data = await res.json();
      setMessage(`扫描完成：检查了 ${data.total} 个博主，发现 ${data.totalNewWorks} 条新作品`);
    } catch {
      setMessage("扫描失败");
    }
    setScanning(false);
  };

  const handleTranscribe = async () => {
    setTranscribing(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/transcribe", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`转写完成：共 ${data.total} 条，成功 ${data.done} 条${data.failed > 0 ? `，失败 ${data.failed} 条` : ""}`);
      } else {
        setMessage(`转写失败: ${data.error}`);
      }
    } catch {
      setMessage("转写请求失败");
    }
    setTranscribing(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">设置</h1>
        <p className="text-muted-foreground mt-1">
          管理主题偏好与抖音雷达配置
        </p>
      </div>

      {/* 外观设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">主题偏好</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 rounded-md border p-1">
                <Sun className="h-4 w-4 text-muted-foreground" />
                <Moon className="h-4 w-4 text-muted-foreground" />
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">切换主题</p>
                <p className="text-xs text-muted-foreground">
                  选择亮色、暗色或跟随系统
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

      {/* 抖音雷达管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Radio className="h-4 w-4" />
            抖音雷达管理
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 添加博主 */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">添加博主</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={uidInput}
                onChange={(e) => setUidInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="输入抖音博主 sec_uid..."
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <select
                value={categorySelect}
                onChange={(e) => setCategorySelect(e.target.value as "predictor" | "technical")}
                className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="predictor">预测类</option>
                <option value="technical">技术类</option>
              </select>
              <Button onClick={handleAdd} disabled={adding || !uidInput.trim()}>
                {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                添加
              </Button>
            </div>
          </div>

          {/* 已添加博主列表 */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">已添加博主</h3>
            {loading ? (
              <p className="text-sm text-muted-foreground">加载中...</p>
            ) : bloggers.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无博主</p>
            ) : (
              <div className="space-y-2">
                {bloggers.map((blogger) => {
                  const cat = categoryLabels[blogger.category] || categoryLabels.predictor;
                  return (
                    <div
                      key={blogger.id}
                      className="flex items-center gap-3 rounded-md border p-3"
                    >
                      {blogger.avatarUrl ? (
                        <img src={blogger.avatarUrl} alt={blogger.nickname}
                          className="h-8 w-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{blogger.nickname}</p>
                        <p className="text-xs text-muted-foreground">
                          {blogger.followerCount.toLocaleString()} 粉丝
                        </p>
                      </div>
                      <Badge variant={cat.variant} className="shrink-0 text-xs">
                        {cat.label}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0"
                        onClick={() => handleDelete(blogger.id, blogger.nickname)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 操作区 */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">操作</h3>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleScan} disabled={scanning}>
                {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                扫描全部博主
              </Button>
              <Button variant="outline" onClick={handleTranscribe} disabled={transcribing}>
                {transcribing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mic className="h-4 w-4 mr-2" />}
                开始转写
              </Button>
            </div>
          </div>

          {/* 反馈消息 */}
          {message && (
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">{message}</p>
          )}
        </CardContent>
      </Card>

      {/* 更多设置占位 */}
      <Card className="flex items-center justify-center min-h-[100px] border-dashed">
        <CardContent className="text-center py-8">
          <Settings className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">更多设置即将上线</p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: 设置页新增抖音雷达管理区域"
```

---

### Task 10: 删除旧页面 & 最终验证

**Files:**
- Delete: `src/app/sentiment/douyin/page.tsx`
- Delete: `src/app/sentiment/douyin/[id]/page.tsx`

- [ ] **Step 1: 删除旧文件**

```bash
rm -rf src/app/sentiment/douyin
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

确认无编译错误。

- [ ] **Step 3: 端到端验证**

启动应用 `npm run dev`，逐项验证：

| 验证点 | 操作 | 预期 |
|--------|------|------|
| 侧边栏 | 查看导航栏 | "抖音雷达"在首位，可点击跳转 |
| 首页空态 | 无博主时访问 `/douyin` | 显示空状态 + 引导去设置页 |
| 添加博主 | 设置页 → 输入 sec_uid → 选择分类 → 添加 | 成功添加，列表中显示 |
| 首页列表 | 返回 `/douyin` | 按分类 tab 显示博主卡片 |
| 扫描 | 设置页 → 扫描 | 返回扫描结果 |
| 转写+观点 | 设置页 → 转写 → 等待完成 | 作品转写成功，opinion_summary 写入 |
| 首页观点 | 回到 `/douyin` | 博主卡片显示最新观点摘要 |
| 预测类详情 | 点击预测类博主 | 三个 tab：记录/趋势/作品 |
| 技术类详情 | 点击技术类博主 | 两个 tab：观点总结/作品列表 |
| 删除博主 | 设置页 → 删除 | 级联删除，首页不再显示 |

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: 删除旧抖音雷达页面，最终清理"
```
