# 抖音雷达 V2 优化 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 抖音雷达五大优化：默认页重定向、slug URL、去博主分类+四档评判、扫描分页循环、博主排序

**Architecture:** 自底向上实施 — Schema → Types → Services → API Routes → Frontend → Config。每个 phase 内部独立可测试，phase 之间顺序依赖。

**Tech Stack:** Next.js 16 (App Router), React 19, Drizzle ORM + better-sqlite3 (SQLite), TypeScript 5, Tailwind CSS 4

## Global Constraints

- 所有路由迁移使用 Next.js `redirect()` / `permanentRedirect()`
- slug 生成规则：`SHA256(douyin_uid).toString("hex").slice(0, 12)`
- 评判四档：`correct | mostly_correct | incorrect | not_applicable`
- 准确率公式：`(correct + mostly_correct) / (correct + mostly_correct + incorrect)`，`not_applicable` 不参与分母
- 扫描截止日期环境变量 `DOUYIN_SCAN_CUTOFF_DATE`，默认 `2026-06-01`
- 扫描最多 50 页
- 博主排序默认按粉丝数降序
- 不删除 `src/components/dashboard/` 目录

---

### Task 1: 更新 Drizzle Schema

**Files:**
- Modify: `src/db/schema.ts`

**Interfaces:**
- Produces: Updated `bloggers` table (slug +, category/classifiedAt/classificationNote -), updated `predictionItems` table (isCorrect -, judgment +), updated `works` + `evaluations` (unchanged)

- [ ] **Step 1: 更新 bloggers 表定义**

Replace the bloggers table definition in `src/db/schema.ts`:

```typescript
export const bloggers = sqliteTable("bloggers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().default(""),
  douyinUid: text("douyin_uid").notNull().unique(),
  nickname: text("nickname").notNull(),
  avatarUrl: text("avatar_url").notNull().default(""),
  signature: text("signature").notNull().default(""),
  followerCount: integer("follower_count").notNull().default(0),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});
```

- [ ] **Step 2: 更新 predictionItems 表定义**

Replace the predictionItems table definition:

```typescript
export const predictionItems = sqliteTable("prediction_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  evaluationId: integer("evaluation_id")
    .notNull()
    .references(() => evaluations.id, { onDelete: "cascade" }),
  workId: integer("work_id")
    .notNull()
    .references(() => works.id, { onDelete: "cascade" }),
  predictedContent: text("predicted_content").notNull(),
  predictionTarget: text("prediction_target").notNull().default(""),
  predictionDetail: text("prediction_detail").notNull().default("{}"),
  judgment: text("judgment", {
    enum: ["correct", "mostly_correct", "incorrect", "not_applicable"],
  })
    .notNull()
    .default("not_applicable"),
  relatedSymbols: text("related_symbols").notNull().default("[]"),
});
```

- [ ] **Step 3: 检查和清理无用 import**

移除 `predictionItems` 表定义中可能不再需要的 import（确认 `sqliteTable, text, integer` 仍在使用即可）。

- [ ] **Step 4: Build 验证 schema 变更**

```bash
npx tsc --noEmit
```

Expected: 类型错误（因为 types/index.ts 还在引用旧类型），这是预期行为。Task 2 会修复类型。

- [ ] **Step 5: 生成 Drizzle migration**

```bash
npm run db:generate
```

Expected: 在 `drizzle/` 目录生成新的 migration SQL 文件（如 `0003_*.sql`）。

- [ ] **Step 6: Run migration**

```bash
npm run db:push
```

Expected: SQLite 数据库表结构更新成功。

- [ ] **Step 7: 编写存量数据迁移脚本**

Create `scripts/migrate-slug.ts`:

```typescript
import { createHash } from "crypto";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "douyin.db");
const db = new Database(DB_PATH);

function computeSlug(douyinUid: string): string {
  return createHash("sha256").update(douyinUid).digest("hex").slice(0, 12);
}

const bloggers = db.prepare("SELECT id, douyin_uid, slug FROM bloggers").all() as Array<{
  id: number;
  douyin_uid: string;
  slug: string;
}>;

const update = db.prepare("UPDATE bloggers SET slug = ? WHERE id = ?");

for (const b of bloggers) {
  if (!b.slug) {
    update.run(computeSlug(b.douyin_uid), b.id);
    console.log(`Updated blogger ${b.id}: slug=${computeSlug(b.douyin_uid)}`);
  }
}

console.log("Done.");
```

- [ ] **Step 8: 运行存量数据脚本**

```bash
npx tsx scripts/migrate-slug.ts
```

Expected: 所有存量博主的 slug 字段被填充。

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts drizzle/ scripts/migrate-slug.ts
git commit -m "feat: update schema — add bloggers.slug, drop category fields, add prediction_items.judgment"
```

---

### Task 2: 更新 TypeScript 类型

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `JudgmentResult`, `SortDimension`, updated `DouyinBlogger`, `DouyinBloggerWithOpinion`, `PredictionItem`, `DouyinEvaluation`

- [ ] **Step 1: 替换抖音相关类型定义**

Replace the entire `// ==================== 抖音博主监控 ====================` section in `src/types/index.ts`:

```typescript
// ==================== 抖音博主监控 ====================

export type JudgmentResult =
  | "correct"
  | "mostly_correct"
  | "incorrect"
  | "not_applicable";

export type SortDimension = "followers" | "recent" | "accuracy";

export type TranscriptStatus = "pending" | "processing" | "done" | "failed";

export interface DouyinBlogger {
  id: number;
  slug: string;
  douyinUid: string;
  nickname: string;
  avatarUrl: string;
  signature: string;
  followerCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface DouyinBloggerWithOpinion extends DouyinBlogger {
  latestOpinion: string;
  latestWorkAt: number | null;
  accuracy: number | null;
}

export interface DouyinWork {
  id: number;
  awemeId: string;
  bloggerId: number;
  desc: string;
  transcript: string | null;
  transcriptStatus: TranscriptStatus;
  duration: number;
  videoUrl: string | null;
  opinionSummary: string;
  coverUrl: string;
  shareUrl: string;
  statistics: string;
  publishedAt: number;
  scannedAt: number;
}

export interface DouyinEvaluation {
  id: number;
  bloggerId: number;
  evalDate: string;
  worksCount: number;
  predictionSummary: string;
  accuracyScore: number;
  evalDetail: string;
  marketSnapshot: string;
  createdAt: number;
}

export interface PredictionItem {
  id: number;
  evaluationId: number;
  workId: number;
  predictedContent: string;
  predictionTarget: string;
  predictionDetail: string;
  judgment: JudgmentResult;
  relatedSymbols: string;
}

export interface MarketSnapshot {
  date: string;
  indices: {
    shanghai: { close: number; change: number; changePercent: number };
    shenzhen: { close: number; change: number; changePercent: number };
    chinext: { close: number; change: number; changePercent: number };
  };
  topSectors: Array<{ name: string; changePercent: number }>;
  bottomSectors: Array<{ name: string; changePercent: number }>;
}
```

- [ ] **Step 2: 删除旧的类型导出**

确认已删除以下类型（若存在于文件中）：
- `BloggerCategory`
- `PredictionType`
- `PredictionMix`
- `DouyinBloggerWithOpinion` 旧定义（含 category）

- [ ] **Step 3: TypeScript 编译验证**

```bash
npx tsc --noEmit
```

Expected: 出现大量的类型错误（因为 service/api/frontend 文件还在引用旧的类型）。确认错误来自其他文件而非 `types/index.ts` 自身即可。

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: update types — add slug, judgment, sort; remove category/predictionType"
```

---

### Task 3: 更新 douyin-api (支持游标分页)

**Files:**
- Modify: `src/lib/douyin-api.ts`

**Interfaces:**
- Produces: updated `fetchUserPosts(secUid, maxCursor, count)` returning `{ awemeList, nextCursor, hasMore }`

- [ ] **Step 1: 更新 fetchUserPosts 签名和实现**

Replace the `fetchUserPosts` function in `src/lib/douyin-api.ts`:

```typescript
export interface FetchPostsResult {
  awemeList: DouyinVideoData[];
  nextCursor: number;
  hasMore: boolean;
}

export async function fetchUserPosts(
  secUid: string,
  maxCursor = 0,
  count = 20
): Promise<FetchPostsResult> {
  try {
    const json = await tikHubFetch<any>(
      `/api/v1/douyin/app/v3/fetch_user_post_videos?sec_user_id=${encodeURIComponent(secUid)}&max_cursor=${maxCursor}&count=${count}`
    );
    return {
      awemeList: json.data?.aweme_list ?? [],
      nextCursor: json.data?.max_cursor ?? 0,
      hasMore: json.data?.has_more ?? false,
    };
  } catch {
    return { awemeList: [], nextCursor: 0, hasMore: false };
  }
}
```

- [ ] **Step 2: TypeScript 编译验证**

```bash
npx tsc --noEmit
```

Expected: `douyin-api.ts` 相关的错误消失。确认类型导出正确。

- [ ] **Step 3: Commit**

```bash
git add src/lib/douyin-api.ts
git commit -m "feat: update fetchUserPosts to support cursor pagination"
```

---

### Task 4: 更新 blogger-service

**Files:**
- Modify: `src/services/douyin/blogger-service.ts`

**Interfaces:**
- Consumes: Updated schema types (bloggers with slug, no category), updated douyin-api
- Produces: `listBloggers()`, `getBloggerBySlug(slug)`, `addBlogger(douyinUid)`, `deleteBlogger(id)`

- [ ] **Step 1: 重写 blogger-service.ts**

Replace the entire content of `src/services/douyin/blogger-service.ts`:

```typescript
import { createHash } from "crypto";
import { db } from "@/db";
import { bloggers, works } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { fetchUserProfile } from "@/lib/douyin-api";
import type { DouyinBlogger } from "@/types";

function computeSlug(douyinUid: string): string {
  return createHash("sha256").update(douyinUid).digest("hex").slice(0, 12);
}

export async function listBloggers(): Promise<DouyinBlogger[]> {
  return db
    .select()
    .from(bloggers)
    .orderBy(desc(bloggers.followerCount))
    .all() as DouyinBlogger[];
}

export async function getBloggerBySlug(
  slug: string
): Promise<DouyinBlogger | null> {
  const result = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.slug, slug))
    .get();
  return (result as DouyinBlogger) ?? null;
}

export async function addBlogger(
  douyinUid: string
): Promise<DouyinBlogger> {
  const existing = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.douyinUid, douyinUid))
    .get();
  if (existing) {
    throw new Error(`博主 ${douyinUid} 已存在`);
  }

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

  const blogger = db
    .insert(bloggers)
    .values({
      slug: computeSlug(douyinUid),
      douyinUid: douyinUid,
      nickname: profile.nickname || "",
      avatarUrl: avatar,
      signature: profile.signature || "",
      followerCount: profile.follower_count || 0,
    })
    .returning()
    .get() as DouyinBlogger;

  return blogger;
}

export async function deleteBlogger(id: number): Promise<void> {
  db.delete(bloggers).where(eq(bloggers.id, id)).run();
}

export async function getBloggerAccuracy(
  bloggerId: number
): Promise<number | null> {
  const { db: database } = await import("@/db");
  const { evaluations, predictionItems } = await import("@/db/schema");
  const { eq, and, ne } = await import("drizzle-orm");

  const rows = database
    .select({
      judgment: predictionItems.judgment,
    })
    .from(predictionItems)
    .innerJoin(evaluations, eq(predictionItems.evaluationId, evaluations.id))
    .where(
      and(
        eq(evaluations.bloggerId, bloggerId),
        ne(predictionItems.judgment, "not_applicable")
      )
    )
    .all() as Array<{ judgment: string }>;

  if (rows.length === 0) return null;

  const correct = rows.filter(
    (r) => r.judgment === "correct" || r.judgment === "mostly_correct"
  ).length;
  return Math.round((correct / rows.length) * 100);
}
```

Wait — the `getBloggerAccuracy` function above has dynamic imports which is awkward. Let me reconsider — the accuracy query should be done differently.

Actually, for this plan, let me keep accuracy calculation simple: just do it in the API route where we already have the db import. The `getBloggerAccuracy` function isn't needed in blogger-service. We'll handle accuracy in the bloggers API route.

Let me redo this step with a cleaner approach. I'll drop `getBloggerAccuracy` from the blogger-service and handle it in the API.

- [ ] **Step 1: 重写 blogger-service.ts**

Replace the entire content of `src/services/douyin/blogger-service.ts`:

```typescript
import { createHash } from "crypto";
import { db } from "@/db";
import { bloggers } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { fetchUserProfile } from "@/lib/douyin-api";
import type { DouyinBlogger } from "@/types";

function computeSlug(douyinUid: string): string {
  return createHash("sha256").update(douyinUid).digest("hex").slice(0, 12);
}

export async function listBloggers(): Promise<DouyinBlogger[]> {
  return db
    .select()
    .from(bloggers)
    .orderBy(desc(bloggers.followerCount))
    .all() as DouyinBlogger[];
}

export async function getBloggerBySlug(
  slug: string
): Promise<DouyinBlogger | null> {
  const result = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.slug, slug))
    .get();
  return (result as DouyinBlogger) ?? null;
}

export async function addBlogger(douyinUid: string): Promise<DouyinBlogger> {
  const existing = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.douyinUid, douyinUid))
    .get();
  if (existing) {
    throw new Error(`博主 ${douyinUid} 已存在`);
  }

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

  const blogger = db
    .insert(bloggers)
    .values({
      slug: computeSlug(douyinUid),
      douyinUid: douyinUid,
      nickname: profile.nickname || "",
      avatarUrl: avatar,
      signature: profile.signature || "",
      followerCount: profile.follower_count || 0,
    })
    .returning()
    .get() as DouyinBlogger;

  return blogger;
}

export async function deleteBlogger(id: number): Promise<void> {
  db.delete(bloggers).where(eq(bloggers.id, id)).run();
}
```

- [ ] **Step 2: TypeScript 编译验证**

```bash
npx tsc --noEmit
```

Expected: blogger-service 相关的类型错误消失。

- [ ] **Step 3: Commit**

```bash
git add src/services/douyin/blogger-service.ts
git commit -m "feat: update blogger-service — slug-based lookup, remove category param"
```

---

### Task 5: 更新 scanner-service (分页循环)

**Files:**
- Modify: `src/services/douyin/scanner-service.ts`

**Interfaces:**
- Consumes: Updated `fetchUserPosts` returning `{ awemeList, nextCursor, hasMore }`
- Produces: `scanAllBloggers()`, `scanBlogger(blogger)` with pagination loop

- [ ] **Step 1: 重写 scanner-service.ts**

Replace the entire content of `src/services/douyin/scanner-service.ts`:

```typescript
import { db } from "@/db";
import { bloggers, works } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchUserPosts } from "@/lib/douyin-api";
import type { DouyinBlogger } from "@/types";

const CUTOFF_DATE = process.env.DOUYIN_SCAN_CUTOFF_DATE || "2026-06-01";
const MAX_PAGES = 50;
const PER_PAGE = 20;

export interface ScanResult {
  bloggerId: number;
  nickname: string;
  newWorks: number;
  errors: string[];
}

export async function scanAllBloggers(): Promise<ScanResult[]> {
  const allBloggers = db.select().from(bloggers).all() as DouyinBlogger[];

  const results: ScanResult[] = [];
  for (const blogger of allBloggers) {
    results.push(await scanBlogger(blogger));
  }

  return results;
}

export async function scanBlogger(
  blogger: DouyinBlogger
): Promise<ScanResult> {
  const result: ScanResult = {
    bloggerId: blogger.id,
    nickname: blogger.nickname,
    newWorks: 0,
    errors: [],
  };

  const cutoffTimestamp = Math.floor(
    new Date(CUTOFF_DATE).getTime() / 1000
  );

  try {
    let cursor = 0;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < MAX_PAGES) {
      const { awemeList, nextCursor, hasMore: more } = await fetchUserPosts(
        blogger.douyinUid,
        cursor,
        PER_PAGE
      );

      const newPosts = [];
      for (const post of awemeList) {
        // Stop if we've reached the cutoff date
        if (post.create_time < cutoffTimestamp) {
          hasMore = false;
          break;
        }

        const existing = db
          .select({ id: works.id })
          .from(works)
          .where(eq(works.awemeId, post.aweme_id))
          .get();
        if (!existing) {
          newPosts.push(post);
        }
      }

      if (newPosts.length > 0) {
        result.newWorks += newPosts.length;

        for (const post of newPosts) {
          const isImage = post.media_type === 2;
          const isVideo = post.media_type === 4;

          const pickCover = (urlList: string[]) =>
            urlList.find((u) => u.includes(".jpeg") || u.includes(".jpg")) ||
            urlList.find((u) => u.includes(".webp")) ||
            urlList.find((u) => u.includes(".png")) ||
            urlList[0] ||
            "";

          let coverUrl = "";
          if (isVideo) {
            const originCover = (post.video as any)?.origin_cover?.url_list || [];
            coverUrl = pickCover(originCover) || pickCover(post.video?.cover?.url_list || []);
          } else if (isImage && post.images?.length) {
            coverUrl = pickCover(post.images[0].url_list || []);
          }
          if (!coverUrl) {
            coverUrl = post.video?.cover?.url_list?.[0] || "";
          }

          db.insert(works)
            .values({
              awemeId: post.aweme_id,
              bloggerId: blogger.id,
              desc: post.desc || "",
              videoUrl: isVideo
                ? post.video?.download_addr?.url_list?.[0] || null
                : null,
              duration: post.video?.duration || 0,
              coverUrl,
              shareUrl: post.share_url || "",
              statistics: JSON.stringify(post.statistics || {}),
              publishedAt: post.create_time,
              transcriptStatus: isVideo ? "pending" : "done",
            })
            .run();
        }
      }

      if (!more) hasMore = false;
      cursor = nextCursor;
      pageCount++;
    }
  } catch (err) {
    result.errors.push(
      err instanceof Error ? err.message : "Unknown error"
    );
  }

  return result;
}
```

- [ ] **Step 2: TypeScript 编译验证**

```bash
npx tsc --noEmit
```

Expected: scanner-service 相关的类型错误消失。

- [ ] **Step 3: Commit**

```bash
git add src/services/douyin/scanner-service.ts
git commit -m "feat: scanner pagination loop with cutoff date and cursor"
```

---

### Task 6: 更新 API 路由 — bloggers

**Files:**
- Modify: `src/app/api/douyin/bloggers/route.ts`
- Rename: `src/app/api/douyin/bloggers/[id]/route.ts` → `src/app/api/douyin/bloggers/[slug]/route.ts`

**Interfaces:**
- Consumes: Updated blogger-service (`getBloggerBySlug`, `addBlogger` without category, `listBloggers` without category filter)
- Produces: Updated API responses with slug and accuracy fields

- [ ] **Step 1: 重写 bloggers 列表 API**

Replace the content of `src/app/api/douyin/bloggers/route.ts`:

```typescript
import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { db } from "@/db";
import { works, evaluations, predictionItems } from "@/db/schema";
import { eq, desc, and, ne } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const include = searchParams.get("include");

  try {
    const bloggers = await bloggerService.listBloggers();

    if (include === "latest_opinion") {
      const enriched = bloggers.map((blogger) => {
        // Latest work + opinion
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

        // Accuracy
        const judgmentRows = db
          .select({ judgment: predictionItems.judgment })
          .from(predictionItems)
          .innerJoin(
            evaluations,
            eq(predictionItems.evaluationId, evaluations.id)
          )
          .where(
            and(
              eq(evaluations.bloggerId, blogger.id),
              ne(predictionItems.judgment, "not_applicable")
            )
          )
          .all() as Array<{ judgment: string }>;

        let accuracy: number | null = null;
        if (judgmentRows.length > 0) {
          const correct = judgmentRows.filter(
            (r) =>
              r.judgment === "correct" || r.judgment === "mostly_correct"
          ).length;
          accuracy = Math.round((correct / judgmentRows.length) * 100);
        }

        return {
          ...blogger,
          latestOpinion: latestWork?.opinionSummary ?? "",
          latestWorkAt: latestWork?.publishedAt ?? null,
          accuracy,
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
    const { douyinUid } = await request.json();
    if (!douyinUid || typeof douyinUid !== "string") {
      return Response.json(
        { error: "douyinUid is required" },
        { status: 400 }
      );
    }

    const blogger = await bloggerService.addBlogger(douyinUid);
    return Response.json(blogger, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal error";
    const status = message.includes("已存在") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
```

- [ ] **Step 2: 创建 bloggers [slug] API**

Create the directory and file. First, delete the old `[id]` directory after creating `[slug]`:

```bash
mkdir -p src/app/api/douyin/bloggers/\[slug\]
```

Then create `src/app/api/douyin/bloggers/[slug]/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import * as bloggerService from "@/services/douyin/blogger-service";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const blogger = await bloggerService.getBloggerBySlug(slug);
  if (!blogger) {
    return Response.json({ error: "Blogger not found" }, { status: 404 });
  }

  const include = req.nextUrl.searchParams.get("include");
  if (include === "works") {
    const worksList = db
      .select()
      .from(works)
      .where(eq(works.bloggerId, blogger.id))
      .orderBy(desc(works.publishedAt))
      .limit(50)
      .all();
    return Response.json({ ...blogger, works: worksList });
  }

  return Response.json(blogger);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const blogger = await bloggerService.getBloggerBySlug(slug);
  if (!blogger) {
    return Response.json({ error: "Blogger not found" }, { status: 404 });
  }
  await bloggerService.deleteBlogger(blogger.id);
  return Response.json({ success: true });
}
```

- [ ] **Step 3: 删除旧的 [id] 路由目录**

```bash
rm -rf src/app/api/douyin/bloggers/\[id\]
```

- [ ] **Step 4: TypeScript 编译验证**

```bash
npx tsc --noEmit
```

Expected: bloggers API 相关的类型错误消失。

- [ ] **Step 5: Commit**

```bash
git add src/app/api/douyin/bloggers/
git rm src/app/api/douyin/bloggers/\[id\]/route.ts 2>/dev/null || true
git commit -m "feat: update bloggers API — slug-based routing, accuracy field, no category"
```

---

### Task 7: 更新 API 路由 — records

**Files:**
- Modify: `src/app/api/douyin/records/route.ts`

**Interfaces:**
- Consumes: Updated schema (predictionItems.judgment instead of is_correct/predictionType)
- Produces: Response with judgment field, support `blogger_slug` param

- [ ] **Step 1: 重写 records API**

Replace `src/app/api/douyin/records/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { db } from "@/db";
import { evaluations, predictionItems, bloggers } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const bloggerSlug = searchParams.get("blogger_slug");
  const evalDate = searchParams.get("eval_date");

  try {
    let query = db
      .select({
        evaluation: evaluations,
        items: predictionItems,
        blogger: bloggers,
      })
      .from(evaluations)
      .leftJoin(
        predictionItems,
        eq(evaluations.id, predictionItems.evaluationId)
      )
      .leftJoin(bloggers, eq(evaluations.bloggerId, bloggers.id))
      .orderBy(desc(evaluations.evalDate))
      .$dynamic();

    if (bloggerSlug) {
      query = query.where(eq(bloggers.slug, bloggerSlug));
    }
    if (evalDate) {
      query = query.where(eq(evaluations.evalDate, evalDate));
    }

    const rows = await query;

    // Group by evaluation
    const grouped = new Map<number, any>();
    for (const row of rows) {
      if (!grouped.has(row.evaluation.id)) {
        grouped.set(row.evaluation.id, {
          ...row.evaluation,
          blogger: row.blogger,
          items: [],
        });
      }
      if (row.items) {
        grouped.get(row.evaluation.id)!.items.push(row.items);
      }
    }

    return Response.json(Array.from(grouped.values()));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Query failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: TypeScript 编译验证**

```bash
npx tsc --noEmit
```

Expected: records API 相关的类型错误消失。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/douyin/records/route.ts
git commit -m "feat: update records API — support blogger_slug param, use judgment field"
```

---

### Task 8: 更新 evaluator-service (四档评判接口)

**Files:**
- Modify: `src/services/douyin/evaluator-service.ts`
- Modify: `src/app/api/douyin/evaluate/route.ts`

**Interfaces:**
- Consumes: Updated types (JudgmentResult, PredictionItem without predictionType)
- Produces: Updated `EvaluationResult` type with four-tier judgment support

> 注：evaluator 的 LLM 评判逻辑本身仍然是 stub（等待 ASR pipeline 成熟），此任务仅更新类型接口为四档评判。

- [ ] **Step 1: 更新 evaluator-service 接口**

Replace `src/services/douyin/evaluator-service.ts`:

```typescript
import type { JudgmentResult } from "@/types";

export interface EvaluationResult {
  bloggerId: number;
  nickname: string;
  evalDate: string;
  worksCount: number;
  predictionSummary: string;
  accuracyScore: number;
  itemsCount: number;
  // Judgment breakdown
  correct: number;
  mostlyCorrect: number;
  incorrect: number;
  notApplicable: number;
  error?: string;
}

export async function evaluateAllBloggers(
  _evalDate?: string
): Promise<EvaluationResult[]> {
  // TODO: 等 ASR pipeline 就绪后实现完整的四档 LLM 评判
  // 每个视频产出 judgment: correct | mostly_correct | incorrect | not_applicable
  return [];
}

export async function evaluateBlogger(
  _bloggerId: number,
  _evalDate?: string
): Promise<EvaluationResult> {
  // TODO: 等 ASR pipeline 就绪后实现
  return {
    bloggerId: _bloggerId,
    nickname: "unknown",
    evalDate: _evalDate || new Date().toISOString().slice(0, 10),
    worksCount: 0,
    predictionSummary: "评判功能暂未启用（需先实现 ASR pipeline）",
    accuracyScore: 0,
    itemsCount: 0,
    correct: 0,
    mostlyCorrect: 0,
    incorrect: 0,
    notApplicable: 0,
  };
}
```

- [ ] **Step 2: 更新 evaluate API route**

Replace `src/app/api/douyin/evaluate/route.ts` (update response fields):

```typescript
import { evaluateAllBloggers } from "@/services/douyin/evaluator-service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const evalDate = body?.evalDate || undefined;

    const results = await evaluateAllBloggers(evalDate);
    const totalItems = results.reduce((sum, r) => sum + r.itemsCount, 0);
    const totalCorrect = results.reduce((sum, r) => sum + r.correct, 0);
    const totalMostlyCorrect = results.reduce((sum, r) => sum + r.mostlyCorrect, 0);
    const errors = results.filter((r) => r.error);

    return Response.json({
      date: evalDate || new Date().toISOString().slice(0, 10),
      totalBloggers: results.length,
      totalPredictions: totalItems,
      correct: totalCorrect,
      mostlyCorrect: totalMostlyCorrect,
      errors: errors.length,
      results,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Evaluation failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: TypeScript 编译验证**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/services/douyin/evaluator-service.ts src/app/api/douyin/evaluate/route.ts
git commit -m "feat: update evaluator to support four-tier judgment interface"
```

---

### Task 9: 首页重定向 + 侧边栏更新

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/header.tsx`

- [ ] **Step 1: 首页重定向**

Replace `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/douyin");
}
```

- [ ] **Step 2: 侧边栏删除仪表盘入口**

In `src/components/layout/sidebar.tsx`, update `NAV_ITEMS` (第32-41行):

```typescript
const NAV_ITEMS = [
  { label: "抖音雷达", href: "/douyin", icon: Radio },
  { label: "个股分析", href: "/stocks", icon: TrendingUp },
  { label: "行业分析", href: "/industry", icon: Building2 },
  { label: "舆情分析", href: "/sentiment", icon: MessageCircle },
  { label: "财报 & 研报", href: "/financials", icon: FileText },
  { label: "Agent 管理", href: "/agents", icon: Bot },
  { label: "设置", href: "/settings", icon: Settings },
];
```

同时删除不再使用的 `LayoutDashboard` import（第19行）：

```typescript
import {
  // ... 其他 imports, 移除 LayoutDashboard
  TrendingUp,
  Building2,
  MessageCircle,
  FileText,
  Bot,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  Radio,
} from "lucide-react";
```

- [ ] **Step 3: Header 面包屑更新**

In `src/components/layout/header.tsx`, update `BREADCRUMB_MAP` (第7-16行):

```typescript
const BREADCRUMB_MAP: Record<string, string> = {
  "/": "首页",
  "/douyin": "抖音雷达",
  "/stocks": "个股分析",
  "/industry": "行业分析",
  "/sentiment": "舆情分析",
  "/financials": "财报 & 研报",
  "/agents": "Agent 管理",
  "/settings": "设置",
};
```

同时更新 `getBreadcrumbs` 中的根面包屑（第20行）：

```typescript
const crumbs: { label: string; href: string }[] = [{ label: "首页", href: "/" }];
```

- [ ] **Step 4: Build 验证**

```bash
npm run build
```

Expected: 构建成功，无错误。

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/layout/sidebar.tsx src/components/layout/header.tsx
git commit -m "feat: redirect home to /douyin, remove dashboard from nav"
```

---

### Task 10: 抖音雷达列表页 — 去分类 + 排序

**Files:**
- Modify: `src/app/douyin/page.tsx`

- [ ] **Step 1: 重写列表页**

Replace the content of `src/app/douyin/page.tsx`:

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, Settings } from "lucide-react";
import type { DouyinBloggerWithOpinion, SortDimension } from "@/types";

const SORT_OPTIONS: { key: SortDimension; label: string }[] = [
  { key: "followers", label: "粉丝数" },
  { key: "recent", label: "最近更新" },
  { key: "accuracy", label: "准确率" },
];

export default function DouyinPage() {
  const [bloggers, setBloggers] = useState<DouyinBloggerWithOpinion[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortDimension>("followers");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/douyin/bloggers?include=latest_opinion");
        if (res.ok) setBloggers(await res.json());
      } catch {
        // network error — show empty state
      }
      setLoading(false);
    }
    load();
  }, []);

  const sorted = useMemo(() => {
    const list = [...bloggers];
    switch (sortBy) {
      case "followers":
        list.sort((a, b) => b.followerCount - a.followerCount);
        break;
      case "recent":
        list.sort(
          (a, b) => (b.latestWorkAt ?? 0) - (a.latestWorkAt ?? 0)
        );
        break;
      case "accuracy":
        list.sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1));
        break;
    }
    return list;
  }, [bloggers, sortBy]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
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

      {/* 排序栏 */}
      <div className="flex gap-2 border-b pb-2">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              sortBy === opt.key
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {opt.label}
            {sortBy === opt.key && " ▼"}
          </button>
        ))}
      </div>

      {/* 博主列表 */}
      {sorted.length === 0 ? (
        <Card className="flex items-center justify-center min-h-[200px] border-dashed">
          <CardContent className="text-center py-12">
            <Radio className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-muted-foreground">
              暂无博主，请前往设置页添加
            </p>
            <Link
              href="/settings"
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Settings className="h-3 w-3" />
              前往设置 &gt; 抖音雷达管理
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((blogger) => (
            <Link key={blogger.id} href={`/douyin/${blogger.slug}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start gap-4">
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
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold truncate">
                          {blogger.nickname}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {(blogger.followerCount ?? 0).toLocaleString()} 粉丝
                        </span>
                        {blogger.accuracy !== null && (
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            准确率 {blogger.accuracy}%
                          </Badge>
                        )}
                      </div>

                      {blogger.latestOpinion ? (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {blogger.latestOpinion}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground/50 italic mt-1">
                          暂无观点
                        </p>
                      )}

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
          ))}
        </div>
      )}
    </div>
  );
}

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

- [ ] **Step 2: Build 验证**

```bash
npm run build
```

Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/app/douyin/page.tsx
git commit -m "feat: douyin list page — remove category tabs, add sort by followers/recent/accuracy"
```

---

### Task 11: 抖音雷达详情页 — slug + 统一 tab

**Files:**
- Rename: `src/app/douyin/[id]/` → `src/app/douyin/[slug]/`
- Modify: `src/app/douyin/[slug]/page.tsx`

- [ ] **Step 1: 创建新目录并删除旧目录**

```bash
mkdir -p src/app/douyin/\[slug\]
mv src/app/douyin/\[id\]/page.tsx src/app/douyin/\[slug\]/page.tsx
rmdir src/app/douyin/\[id\]
```

- [ ] **Step 2: 重写详情页**

Replace `src/app/douyin/[slug]/page.tsx`:

```tsx
"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2, X, Play, ImageIcon } from "lucide-react";
import type {
  DouyinBlogger,
  DouyinEvaluation,
  DouyinWork,
  PredictionItem,
  JudgmentResult,
} from "@/types";

const JUDGMENT_CONFIG: Record<
  JudgmentResult,
  { label: string; color: string; icon: string }
> = {
  correct: { label: "正确", color: "text-green-500", icon: "✅" },
  mostly_correct: {
    label: "基本正确",
    color: "text-emerald-500",
    icon: "💚",
  },
  incorrect: { label: "不正确", color: "text-red-500", icon: "❌" },
  not_applicable: { label: "不涉及", color: "text-gray-400", icon: "—" },
};

export default function BloggerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [blogger, setBlogger] = useState<DouyinBlogger | null>(null);
  const [records, setRecords] = useState<
    Array<DouyinEvaluation & { items: PredictionItem[] }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"works" | "summary">("works");
  const [works, setWorks] = useState<DouyinWork[]>([]);
  const [worksLoading, setWorksLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedWork, setSelectedWork] = useState<DouyinWork | null>(null);

  const loadWorks = useCallback(async () => {
    setWorksLoading(true);
    try {
      const res = await fetch(`/api/douyin/bloggers/${slug}?include=works`);
      if (res.ok) {
        const data = await res.json();
        setWorks(data.works || []);
      }
    } catch {
      // silent fail
    }
    setWorksLoading(false);
  }, [slug]);

  useEffect(() => {
    async function load() {
      const [bloggerRes, recordsRes] = await Promise.all([
        fetch(`/api/douyin/bloggers/${slug}`),
        fetch(`/api/douyin/records?blogger_slug=${slug}`),
      ]);
      if (bloggerRes.ok) setBlogger(await bloggerRes.json());
      if (recordsRes.ok) setRecords(await recordsRes.json());
      setLoading(false);
    }
    load();
  }, [slug]);

  useEffect(() => {
    loadWorks();
  }, [loadWorks]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!blogger) {
    return (
      <div className="space-y-6">
        <Link
          href="/douyin"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Link>
        <p className="text-muted-foreground">博主不存在</p>
      </div>
    );
  }

  // Compute accuracy stats from records
  const allItems = records.flatMap((r) => r.items);
  const judgmentCounts = {
    correct: allItems.filter((i) => i.judgment === "correct").length,
    mostly_correct: allItems.filter((i) => i.judgment === "mostly_correct")
      .length,
    incorrect: allItems.filter((i) => i.judgment === "incorrect").length,
    not_applicable: allItems.filter((i) => i.judgment === "not_applicable")
      .length,
  };
  const totalJudged =
    judgmentCounts.correct +
    judgmentCounts.mostly_correct +
    judgmentCounts.incorrect;
  const accuracy =
    totalJudged > 0
      ? Math.round(
          ((judgmentCounts.correct + judgmentCounts.mostly_correct) /
            totalJudged) *
            100
        )
      : null;

  return (
    <div className="space-y-6">
      <Link
        href="/douyin"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-fit"
      >
        <ArrowLeft className="h-4 w-4" />
        返回列表
      </Link>

      {/* Blogger info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            {blogger.avatarUrl ? (
              <img
                src={blogger.avatarUrl}
                alt={blogger.nickname}
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-muted" />
            )}
            <div>
              <h1 className="text-xl font-bold">{blogger.nickname}</h1>
              <p className="text-sm text-muted-foreground">
                {blogger.signature || "暂无签名"}
              </p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-muted-foreground">
                  {(blogger.followerCount ?? 0).toLocaleString()} 粉丝
                </span>
                {accuracy !== null && (
                  <Badge variant="secondary">
                    准确率 {accuracy}%
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => {
            setTab("works");
            loadWorks();
          }}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            tab === "works"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          作品列表
        </button>
        <button
          onClick={() => setTab("summary")}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            tab === "summary"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          评判汇总
        </button>
      </div>

      {/* Works Tab */}
      {tab === "works" && (
        <>
          {worksLoading ? (
            <div className="grid grid-cols-3 gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-sm" />
              ))}
            </div>
          ) : works.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">暂无作品</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  扫描后将自动拉取作品并转写
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {works.map((work) => {
                let stats: Record<string, number> = {};
                try {
                  stats = JSON.parse(work.statistics || "{}");
                } catch {}

                // Find judgment for this work
                const workJudgment = allItems.find(
                  (item) => item.workId === work.id
                );
                const jConfig = workJudgment
                  ? JUDGMENT_CONFIG[workJudgment.judgment]
                  : null;

                return (
                  <div
                    key={work.id}
                    className="relative aspect-[3/4] bg-muted rounded-sm overflow-hidden cursor-pointer group"
                    onClick={() => setSelectedWork(work)}
                  >
                    {work.coverUrl ? (
                      <img
                        src={work.coverUrl}
                        alt={work.desc || ""}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).classList.add(
                            "hidden"
                          );
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                    )}

                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent" />

                    <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5 text-white text-xs">
                      {!!work.videoUrl ? (
                        <Play className="h-3 w-3 fill-white" />
                      ) : (
                        <ImageIcon className="h-3 w-3" />
                      )}
                      <span>{stats.play_count?.toLocaleString() || 0}</span>
                    </div>

                    {stats.digg_count > 0 && (
                      <div className="absolute top-1.5 right-2 text-white text-xs drop-shadow-sm">
                        👍 {stats.digg_count.toLocaleString()}
                      </div>
                    )}

                    {/* 评判标记 */}
                    {jConfig && (
                      <div className="absolute top-1.5 left-1.5 bg-background/90 text-xs px-1.5 py-0.5 rounded shadow">
                        <span className={jConfig.color}>{jConfig.icon}</span>{" "}
                        {jConfig.label}
                      </div>
                    )}

                    {work.transcriptStatus === "failed" && !jConfig && (
                      <div className="absolute top-1.5 left-1.5 bg-red-500/90 text-white text-[10px] px-1.5 py-0.5 rounded">
                        转写失败
                      </div>
                    )}
                    {work.transcriptStatus === "done" && !jConfig && (
                      <div className="absolute top-1.5 left-1.5 bg-green-500/90 text-white text-[10px] px-1.5 py-0.5 rounded">
                        已转写
                      </div>
                    )}

                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </div>
                );
              })}
            </div>
          )}

          {selectedWork && (
            <WorkDetailSheet
              work={selectedWork}
              onClose={() => setSelectedWork(null)}
              onPreview={(url) => setPreviewImage(url)}
            />
          )}
        </>
      )}

      {/* Summary Tab */}
      {tab === "summary" && (
        <div className="space-y-6">
          {/* Stats overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-green-500">
                  {judgmentCounts.correct}
                </p>
                <p className="text-xs text-muted-foreground mt-1">✅ 正确</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-emerald-500">
                  {judgmentCounts.mostly_correct}
                </p>
                <p className="text-xs text-muted-foreground mt-1">💚 基本正确</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-red-500">
                  {judgmentCounts.incorrect}
                </p>
                <p className="text-xs text-muted-foreground mt-1">❌ 不正确</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-gray-400">
                  {judgmentCounts.not_applicable}
                </p>
                <p className="text-xs text-muted-foreground mt-1">— 不涉及</p>
              </CardContent>
            </Card>
          </div>

          {/* Overall accuracy */}
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-muted-foreground">综合准确率</p>
              <p className="text-3xl font-bold mt-1">
                {accuracy !== null ? `${accuracy}%` : "--"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                基于 {totalJudged} 条有效评判
              </p>
            </CardContent>
          </Card>

          {/* Timeline records */}
          {records.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">暂无评判记录</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  每日收盘后触发"收盘评判"即可生成记录
                </p>
              </CardContent>
            </Card>
          ) : (
            records.map((evaluation) => {
              const evJudgmentCounts = {
                correct: evaluation.items.filter(
                  (i) => i.judgment === "correct"
                ).length,
                mostly_correct: evaluation.items.filter(
                  (i) => i.judgment === "mostly_correct"
                ).length,
                incorrect: evaluation.items.filter(
                  (i) => i.judgment === "incorrect"
                ).length,
                not_applicable: evaluation.items.filter(
                  (i) => i.judgment === "not_applicable"
                ).length,
              };
              const evTotal =
                evJudgmentCounts.correct +
                evJudgmentCounts.mostly_correct +
                evJudgmentCounts.incorrect;
              const evAccuracy =
                evTotal > 0
                  ? Math.round(
                      ((evJudgmentCounts.correct +
                        evJudgmentCounts.mostly_correct) /
                        evTotal) *
                        100
                    )
                  : null;

              return (
                <Card key={evaluation.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {evaluation.evalDate}
                      </CardTitle>
                      {evAccuracy !== null && (
                        <Badge variant="secondary">准确率 {evAccuracy}%</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {evaluation.predictionSummary}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {evaluation.items.length > 0 && (
                      <div className="space-y-3">
                        {evaluation.items.map((item) => {
                          const jConfig = JUDGMENT_CONFIG[item.judgment];
                          return (
                            <div
                              key={item.id}
                              className="flex items-start gap-3 rounded-md border p-3 text-sm"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium truncate">
                                    {item.predictionTarget}
                                  </span>
                                </div>
                                <p className="text-muted-foreground line-clamp-2">
                                  &ldquo;{item.predictedContent}&rdquo;
                                </p>
                                <p className="mt-1 text-xs">
                                  <span className={jConfig.color}>
                                    {jConfig.icon} {jConfig.label}
                                  </span>
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Image preview lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setPreviewImage(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPreviewImage(null);
          }}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            onClick={() => setPreviewImage(null)}
          >
            <X className="h-8 w-8" />
          </button>
          <img
            src={previewImage}
            alt="预览"
            className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// WorkDetailSheet — 复用旧版作品详情弹窗代码
function WorkDetailSheet({
  work,
  onClose,
  onPreview,
}: {
  work: DouyinWork;
  onClose: () => void;
  onPreview: (url: string) => void;
}) {
  let stats: Record<string, number> = {};
  try {
    stats = JSON.parse(work.statistics || "{}");
  } catch {}

  const statusCfg: Record<
    string,
    { label: string; className: string }
  > = {
    pending: { label: "等待中", className: "bg-muted text-muted-foreground" },
    processing: {
      label: "转写中...",
      className:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    },
    done: {
      label: "已转写",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    },
    failed: {
      label: "转写失败",
      className:
        "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    },
  };
  const status = statusCfg[work.transcriptStatus] || {
    label: work.transcriptStatus,
    className: "bg-muted",
  };

  const isVideo = !!work.videoUrl;

  return (
    <div
      className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm flex flex-col"
      onClick={onClose}
    >
      <div
        className="flex-1 flex flex-col max-w-lg mx-auto w-full bg-background border-x overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur border-b">
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> 返回
          </button>
          <Badge className={status.className}>{status.label}</Badge>
        </div>

        {work.coverUrl && (
          <div className="relative bg-black flex items-center justify-center">
            <img
              src={work.coverUrl}
              alt={work.desc || ""}
              className="w-full object-contain max-h-[60vh] cursor-pointer"
              onClick={() => onPreview(work.coverUrl)}
            />
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-14 w-14 rounded-full bg-white/80 flex items-center justify-center shadow-lg">
                  <Play className="h-6 w-6 fill-black text-black ml-0.5" />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="px-4 py-3 border-b">
          <p className="text-sm whitespace-pre-wrap">
            {work.desc || "(无文案)"}
          </p>
        </div>

        <div className="flex items-center gap-5 px-4 py-3 border-b text-xs text-muted-foreground">
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
          {stats.play_count > 0 && (
            <span className="flex items-center gap-0.5">
              <Play className="h-3 w-3" /> {stats.play_count.toLocaleString()}
            </span>
          )}
        </div>

        {work.transcript && work.transcriptStatus === "done" ? (
          <div className="px-4 py-3">
            <h3 className="text-sm font-medium mb-2">语音转写</h3>
            <p className="text-sm p-3 rounded-md bg-muted/50 whitespace-pre-wrap leading-relaxed">
              {work.transcript}
            </p>
          </div>
        ) : work.transcriptStatus === "failed" ? (
          <div className="px-4 py-3">
            <p className="text-sm text-muted-foreground">
              转写失败，可稍后重试
            </p>
          </div>
        ) : work.transcriptStatus === "pending" ? (
          <div className="px-4 py-3">
            <p className="text-sm text-muted-foreground">
              等待转写队列中...
            </p>
          </div>
        ) : null}

        <div className="h-safe pb-8" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 删除旧的 [id] 目录（如果还存在）**

```bash
rm -rf src/app/douyin/\[id\] 2>/dev/null || true
```

- [ ] **Step 3: Build 验证**

```bash
npm run build
```

Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/app/douyin/
git rm -r src/app/douyin/\[id\] 2>/dev/null || true
git commit -m "feat: douyin detail page — slug routing, unified tabs, four-tier judgment display"
```

---

### Task 12: 设置页 — 去掉分类

**Files:**
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: 更新设置页**

In `src/app/settings/page.tsx`, make the following edits:

**Edit 1:** Remove `categorySelect` state (大约第33行):

Delete:
```typescript
const [categorySelect, setCategorySelect] = useState<"predictor" | "technical">("predictor");
```

**Edit 2:** Remove category labels config (大约第23-26行):

Delete:
```typescript
const categoryLabels: Record<string, { label: string; variant: "default" | "secondary" }> = {
  predictor: { label: "预测类", variant: "default" },
  technical: { label: "技术类", variant: "secondary" },
};
```

**Edit 3:** Update add blogger form body (第56行):

Change:
```typescript
body: JSON.stringify({ douyinUid: uidInput.trim(), category: categorySelect }),
```
To:
```typescript
body: JSON.stringify({ douyinUid: uidInput.trim() }),
```

**Edit 4:** Remove category select dropdown from JSX (第194-201行):

Delete the `<select>` element:
```tsx
<select
  value={categorySelect}
  onChange={(e) => setCategorySelect(e.target.value as "predictor" | "technical")}
  className="..."
>
  <option value="predictor">预测类</option>
  <option value="technical">技术类</option>
</select>
```

**Edit 5:** Remove category Badge from blogger list items (第237-239行):

Delete:
```tsx
<Badge variant={cat.variant} className="shrink-0 text-xs">
  {cat.label}
</Badge>
```
And the associated variable lookup (第219行):
```typescript
const cat = categoryLabels[blogger.category] || categoryLabels.predictor;
```

**Edit 6:** Remove unused imports — only remove if no longer needed:
- Remove `Badge` if category badges were the only usage

- [ ] **Step 2: Build 验证**

```bash
npm run build
```

Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: settings page — remove blogger category UI"
```

---

### Task 13: 环境变量 & 配置

**Files:**
- Modify: `.env`
- Modify: `.env.example`

- [ ] **Step 1: Add DOUYIN_SCAN_CUTOFF_DATE to .env**

Add this line to `.env` (after existing DOUYIN_CACHE_MODE line):

```bash
DOUYIN_SCAN_CUTOFF_DATE=2026-06-01
```

- [ ] **Step 2: Add DOUYIN_SCAN_CUTOFF_DATE to .env.example**

Add to `.env.example` (after `DOUYIN_CACHE_MODE=true`):

```bash
# 扫描截止日期：只拉取此日期之后发布的视频 (YYYY-MM-DD)
DOUYIN_SCAN_CUTOFF_DATE=2026-06-01
```

- [ ] **Step 3: Final build verification**

```bash
npm run build
```

Expected: Full project builds successfully with no errors.

- [ ] **Step 4: Commit**

```bash
git add .env .env.example
git commit -m "feat: add DOUYIN_SCAN_CUTOFF_DATE env var"
```

---

## Implementation Order

Tasks must be executed in order: **1 → 2 → 3 → ... → 13**. Each task depends on the previous one completing. Do not skip or reorder.

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| Schema | 1, 2 | Updated DB schema + TypeScript types |
| Services | 3, 4, 5 | Updated API client, blogger service, scanner |
| API | 6, 7, 8 | Updated API routes (bloggers, records, evaluate) |
| Frontend | 9, 10, 11, 12 | Home redirect, sidebar, list, detail, settings |
| Config | 13 | Environment variables |

## Verification

After all tasks complete, verify end-to-end:

1. `npm run build` — clean build, no TS errors
2. `npm run dev` — app starts
3. Navigate to `http://localhost:3000/` → redirects to `/douyin`
4. `/douyin` — shows blogger list with sort options, no category tabs
5. Click a blogger → `/douyin/{slug}` — shows works + summary tabs
6. `/settings` — add blogger form has no category select
7. Trigger scan → uses cursor pagination with `DOUYIN_SCAN_CUTOFF_DATE`
