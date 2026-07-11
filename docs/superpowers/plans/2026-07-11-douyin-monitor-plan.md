# 抖音博主监控 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete Douyin blogger monitoring system with blogger management, work scanning, ASR transcription (placeholder), and LLM-powered post-market prediction evaluation.

**Architecture:** Next.js full-stack with Service Layer pattern. Business logic lives in `src/services/douyin/`, API Routes are thin wrappers, SQLite via Drizzle ORM for persistence. LLM calls go through `@anthropic-ai/sdk` pointing to newapi proxy. Frontend at `/sentiment/douyin`.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Drizzle ORM + better-sqlite3, `@anthropic-ai/sdk`, Tailwind CSS, shadcn/ui, lucide-react

## Global Constraints

- Next.js 16 App Router: API routes use `export async function GET/POST/DELETE`, `params` is `Promise<>` that must be awaited
- All imports use `@/*` alias mapping to `./src/*`
- TypeScript strict mode enabled
- Use `Response.json()` for API responses (Web API standard)
- SQLite database file at project root: `data/douyin.db`
- Environment variables via `process.env` with `!` assertion after guard
- Tailwind v4 with `@tailwindcss/postcss`

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install production dependencies**

```bash
npm install drizzle-orm better-sqlite3 @anthropic-ai/sdk
```

- [ ] **Step 2: Install dev dependencies**

```bash
npm install -D drizzle-kit @types/better-sqlite3
```

- [ ] **Step 3: Add drizzle-kit config**

Create `drizzle.config.ts` at project root:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/douyin.db",
  },
});
```

- [ ] **Step 4: Add db scripts to package.json**

In `package.json`, add to `"scripts"`:

```json
"db:generate": "drizzle-kit generate",
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio"
```

- [ ] **Step 5: Create data directory**

```bash
mkdir -p data
```

- [ ] **Step 6: Add .gitignore entries**

Add to `.gitignore`:

```
# database
/data/*.db
/drizzle
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json drizzle.config.ts .gitignore
git commit -m "chore: add drizzle, better-sqlite3, anthropic-sdk dependencies"
```

---

### Task 2: Database Schema & Connection

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/index.ts`

**Produces:**
- `db` — `BetterSQLite3Database` instance
- `bloggers`, `works`, `evaluations`, `predictionItems` — Drizzle table definitions

- [ ] **Step 1: Write the schema**

```typescript
// src/db/schema.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const bloggers = sqliteTable("bloggers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  douyinUid: text("douyin_uid").notNull().unique(),
  nickname: text("nickname").notNull(),
  avatarUrl: text("avatar_url").notNull().default(""),
  signature: text("signature").notNull().default(""),
  followerCount: integer("follower_count").notNull().default(0),
  category: text("category", { enum: ["pending", "predictor", "non_predictor"] })
    .notNull()
    .default("pending"),
  classifiedAt: integer("classified_at"),
  classificationNote: text("classification_note"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const works = sqliteTable("works", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  awemeId: text("aweme_id").notNull().unique(),
  bloggerId: integer("blogger_id")
    .notNull()
    .references(() => bloggers.id, { onDelete: "cascade" }),
  desc: text("desc").notNull().default(""),
  transcript: text("transcript"),
  transcriptStatus: text("transcript_status", {
    enum: ["pending", "processing", "done", "failed"],
  })
    .notNull()
    .default("pending"),
  duration: integer("duration").notNull().default(0),
  coverUrl: text("cover_url").notNull().default(""),
  shareUrl: text("share_url").notNull().default(""),
  statistics: text("statistics").notNull().default("{}"),
  publishedAt: integer("published_at").notNull(),
  scannedAt: integer("scanned_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const evaluations = sqliteTable("evaluations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bloggerId: integer("blogger_id")
    .notNull()
    .references(() => bloggers.id, { onDelete: "cascade" }),
  evalDate: text("eval_date").notNull(),
  worksCount: integer("works_count").notNull().default(0),
  predictionSummary: text("prediction_summary").notNull().default(""),
  accuracyScore: integer("accuracy_score").notNull().default(0),
  evalDetail: text("eval_detail").notNull().default("{}"),
  marketSnapshot: text("market_snapshot").notNull().default("{}"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const predictionItems = sqliteTable("prediction_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  evaluationId: integer("evaluation_id")
    .notNull()
    .references(() => evaluations.id, { onDelete: "cascade" }),
  workId: integer("work_id")
    .notNull()
    .references(() => works.id, { onDelete: "cascade" }),
  predictedContent: text("predicted_content").notNull(),
  predictionType: text("prediction_type", {
    enum: ["market_direction", "index_level", "sector", "stock_pick"],
  }).notNull(),
  predictionTarget: text("prediction_target").notNull().default(""),
  predictionDetail: text("prediction_detail").notNull().default("{}"),
  isCorrect: integer("is_correct"),
  judgment: text("judgment").notNull().default(""),
  relatedSymbols: text("related_symbols").notNull().default("[]"),
});
```

- [ ] **Step 2: Write the database connection**

```typescript
// src/db/index.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "douyin.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
```

- [ ] **Step 3: Generate initial migration**

```bash
npx drizzle-kit generate
```

- [ ] **Step 4: Push schema to database**

```bash
npx drizzle-kit push
```

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/index.ts drizzle/ .gitignore
git commit -m "feat: add database schema and connection for douyin monitor"
```

---

### Task 3: Extend Type Definitions

**Files:**
- Modify: `src/types/index.ts`

**Produces:** New interfaces `DouyinBlogger`, `DouyinWork`, `DouyinEvaluation`, `PredictionItem`, `PredictionType`, `BloggerCategory`, `TranscriptStatus`, `PredictionMix`, `MarketSnapshot`

- [ ] **Step 1: Add new types**

Append to `src/types/index.ts`:

```typescript
// ==================== 抖音博主监控 ====================

export type BloggerCategory = "pending" | "predictor" | "non_predictor";
export type TranscriptStatus = "pending" | "processing" | "done" | "failed";
export type PredictionType =
  | "market_direction"
  | "index_level"
  | "sector"
  | "stock_pick";

export interface DouyinBlogger {
  id: number;
  douyinUid: string;
  nickname: string;
  avatarUrl: string;
  signature: string;
  followerCount: number;
  category: BloggerCategory;
  classifiedAt: number | null;
  classificationNote: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DouyinWork {
  id: number;
  awemeId: string;
  bloggerId: number;
  desc: string;
  transcript: string | null;
  transcriptStatus: TranscriptStatus;
  duration: number;
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
  predictionType: PredictionType;
  predictionTarget: string;
  predictionDetail: string;
  isCorrect: number | null;
  judgment: string;
  relatedSymbols: string;
}

export interface PredictionMix {
  marketDirection: number;
  indexLevel: number;
  sector: number;
  stockPick: number;
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

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add douyin monitor type definitions"
```

---

### Task 4: LLM Client Setup

**Files:**
- Create: `src/lib/llm.ts`

**Produces:** `getClaudeClient()` — returns configured Anthropic client, `callClaude(prompt, systemPrompt)` — convenience wrapper

- [ ] **Step 1: Write the LLM client**

```typescript
// src/lib/llm.ts
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.NEWAPI_API_KEY;
    if (!apiKey) {
      throw new Error("NEWAPI_API_KEY environment variable is not set");
    }
    client = new Anthropic({
      baseURL: process.env.NEWAPI_BASE_URL || "https://newapi.tdance.cc/v1",
      apiKey,
    });
  }
  return client;
}

export interface CallClaudeOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callClaude(
  userMessage: string,
  systemPrompt: string,
  options: CallClaudeOptions = {}
): Promise<string> {
  const anthropic = getAnthropicClient();

  const response = await anthropic.messages.create({
    model: options.model || "claude-sonnet-4-20250514",
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.3,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Unexpected response format from Claude: no text block");
  }

  return textBlock.text;
}

export function parseClaudeJson<T>(raw: string): T {
  // Claude sometimes wraps JSON in ```json ... ``` fences
  const cleaned = raw
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```\s*$/g, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/llm.ts
git commit -m "feat: add LLM client with Anthropic SDK via newapi proxy"
```

---

### Task 5: Douyin API Client

**Files:**
- Create: `src/lib/douyin-api.ts`

**Produces:** `fetchDouyinVideos(uid, count?)` — calls user's API, returns parsed video list

- [ ] **Step 1: Write the Douyin API client**

```typescript
// src/lib/douyin-api.ts

export interface DouyinVideoData {
  aweme_id: string;
  desc: string;
  create_time: number;
  aweme_type: number;
  author: {
    nickname: string;
    unique_id: string;
    uid: string;
    sec_uid: string;
    signature: string;
    avatar_thumb: { url_list: string[] };
    avatar_medium: { url_list: string[] };
    avatar_larger: { url_list: string[] };
    follower_count: number;
    total_favorited: number;
    aweme_count: number;
  };
  video: {
    duration: number;
    cover: { url_list: string[] };
    play_addr: { url_list: string[] };
    download_addr: { url_list: string[] };
  };
  statistics: {
    admire_count: number;
    comment_count: number;
    digg_count: number;
    play_count: number;
    share_count: number;
    collect_count: number;
    download_count: number;
  };
  share_url: string;
  text_extra: Array<{
    hashtag_id: string;
    hashtag_name: string;
    type: number;
  }>;
}

export interface DouyinApiResponse {
  code: number;
  data: {
    status_code: number;
    aweme_detail: DouyinVideoData;
  };
}

const DOUYIN_API_BASE =
  process.env.DOUYIN_API_BASE || "http://localhost:8000/api/douyin";

export async function fetchDouyinVideo(
  awemeId: string
): Promise<DouyinVideoData | null> {
  const url = `${DOUYIN_API_BASE}/web/fetch_one_video?aweme_id=${awemeId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json: DouyinApiResponse = await res.json();
  if (json.code !== 200 || json.data.status_code !== 0) return null;
  return json.data.aweme_detail;
}

export async function fetchDouyinUserPosts(
  secUid: string,
  maxCount = 20
): Promise<DouyinVideoData[]> {
  const url = `${DOUYIN_API_BASE}/web/fetch_user_post?sec_uid=${secUid}&max_cursor=0&count=${maxCount}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  if (json.code !== 200 || !json.data?.aweme_list) return [];
  return json.data.aweme_list as DouyinVideoData[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/douyin-api.ts
git commit -m "feat: add douyin API client for fetching videos and user posts"
```

---

### Task 6: Transcriber (Placeholder) & Market Snapshot Service

**Files:**
- Create: `src/services/douyin/transcriber.ts`
- Create: `src/services/douyin/market-snapshot.ts`

**Produces:**
- `transcribeAudio(videoUrl: string): Promise<string>` — placeholder, throws with clear message
- `getMarketSnapshot(date?: string): Promise<MarketSnapshot>` — placeholder returning mock data

- [ ] **Step 1: Write the transcriber placeholder**

```typescript
// src/services/douyin/transcriber.ts

/**
 * Transcribe audio from a Douyin video URL.
 *
 * PLACEHOLDER: Currently throws. Implement by calling your chosen
 * cloud ASR provider (Aliyun / Tencent / Xunfei / etc.) once you've
 * compared pricing and quality.
 *
 * Expected flow once implemented:
 *   1. Download the video from videoUrl
 *   2. Extract audio track (ffmpeg or similar)
 *   3. Upload audio to ASR provider
 *   4. Return transcribed text
 */
export async function transcribeAudio(videoUrl: string): Promise<string> {
  throw new Error(
    `ASR not configured. Tried to transcribe: ${videoUrl}. ` +
      `Set ASR_API_KEY / ASR_API_SECRET env and implement the adapter in ` +
      `src/services/douyin/transcriber.ts.`
  );
}

/**
 * Batch transcribe multiple videos. Returns a Map of awemeId → transcript.
 * Failed transcriptions have empty string values.
 */
export async function transcribeBatch(
  videos: Array<{ awemeId: string; videoUrl: string }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (const { awemeId, videoUrl } of videos) {
    try {
      const text = await transcribeAudio(videoUrl);
      results.set(awemeId, text);
    } catch {
      // Leave as empty string for failed transcriptions
      results.set(awemeId, "");
    }
  }

  return results;
}
```

- [ ] **Step 2: Write the market snapshot service**

```typescript
// src/services/douyin/market-snapshot.ts
import type { MarketSnapshot } from "@/types";

/**
 * Get market snapshot for a given date.
 *
 * PLACEHOLDER: Returns minimal mock data. Replace with real market
 * data API (Sina / EastMoney / TuShare / etc.) when ready.
 */
export async function getMarketSnapshot(
  date?: string
): Promise<MarketSnapshot> {
  const today = date || new Date().toISOString().slice(0, 10);

  return {
    date: today,
    indices: {
      shanghai: { close: 0, change: 0, changePercent: 0 },
      shenzhen: { close: 0, change: 0, changePercent: 0 },
      chinext: { close: 0, change: 0, changePercent: 0 },
    },
    topSectors: [],
    bottomSectors: [],
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/services/douyin/transcriber.ts src/services/douyin/market-snapshot.ts
git commit -m "feat: add transcriber placeholder and market snapshot service"
```

---

### Task 7: Blogger Service

**Files:**
- Create: `src/services/douyin/blogger-service.ts`

**Produces:**
- `listBloggers(category?)` → `DouyinBlogger[]`
- `getBloggerById(id)` → `DouyinBlogger | null`
- `addBlogger(douyinUid)` → `DouyinBlogger` (fetches info, saves, triggers classification)
- `deleteBlogger(id)` → `void`
- `classifyBlogger(bloggerId)` → `void` (pull recent works, run ASR, call LLM, update category)

- [ ] **Step 1: Write the blogger service**

```typescript
// src/services/douyin/blogger-service.ts
import { db } from "@/db";
import { bloggers, works } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { fetchDouyinVideo, fetchDouyinUserPosts } from "@/lib/douyin-api";
import { callClaude, parseClaudeJson } from "@/lib/llm";
import { transcribeBatch } from "./transcriber";
import type { DouyinBlogger, BloggerCategory, PredictionMix } from "@/types";

const BLOGGER_CLASSIFY_PROMPT = `你是A股市场分析专家。以下是一个抖音博主最近发布的视频文案汇总。请判断该博主是否在做A股市场的行情预测。

判断标准：
- 行情预测包括：大盘涨跌方向、指数具体点位、板块或行业走势、个股推荐
- 模糊的市场情绪表达（如"最近行情不好"）不算预测
- 需要有明确的判断方向或结论

返回严格JSON（不要markdown代码块包裹）：
{
  "category": "predictor",
  "prediction_mix": { "marketDirection": 0.4, "indexLevel": 0.2, "sector": 0.3, "stockPick": 0.1 },
  "hasReasoning": true,
  "note": "该博主以大盘方向判断为主，兼有板块分析，具备明确的逻辑框架"
}

如果博主不做行情预测，category 填 "non_predictor"，prediction_mix 全部为 0。`;

interface ClassifyResult {
  category: "predictor" | "non_predictor";
  prediction_mix: PredictionMix;
  hasReasoning: boolean;
  note: string;
}

export async function listBloggers(
  category?: BloggerCategory
): Promise<DouyinBlogger[]> {
  if (category) {
    return db
      .select()
      .from(bloggers)
      .where(eq(bloggers.category, category))
      .orderBy(desc(bloggers.createdAt))
      .all() as DouyinBlogger[];
  }
  return db
    .select()
    .from(bloggers)
    .orderBy(desc(bloggers.createdAt))
    .all() as DouyinBlogger[];
}

export async function getBloggerById(
  id: number
): Promise<DouyinBlogger | null> {
  const result = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.id, id))
    .get();
  return (result as DouyinBlogger) ?? null;
}

export async function addBlogger(douyinUid: string): Promise<DouyinBlogger> {
  // Check for duplicates
  const existing = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.douyinUid, douyinUid))
    .get();
  if (existing) {
    throw new Error(`博主 ${douyinUid} 已存在`);
  }

  // Fetch a video to get author info (the douyin API returns author data on any video fetch)
  // Use fetchDouyinUserPosts to get author + recent works in one call
  const posts = await fetchDouyinUserPosts(douyinUid, 1);
  if (posts.length === 0) {
    throw new Error(`无法获取博主 ${douyinUid} 的信息，请检查 ID 是否正确`);
  }

  const author = posts[0].author;
  const avatar = author.avatar_medium?.url_list?.[0]
    || author.avatar_thumb?.url_list?.[0]
    || "";

  const blogger = db
    .insert(bloggers)
    .values({
      douyinUid: douyinUid,
      nickname: author.nickname,
      avatarUrl: avatar,
      signature: author.signature || "",
      followerCount: author.follower_count || 0,
      category: "pending",
    })
    .returning()
    .get() as DouyinBlogger;

  // Trigger classification in background (don't await — caller gets immediate response)
  classifyBlogger(blogger.id).catch(console.error);

  return blogger;
}

export async function deleteBlogger(id: number): Promise<void> {
  db.delete(bloggers).where(eq(bloggers.id, id)).run();
}

export async function classifyBlogger(bloggerId: number): Promise<void> {
  const blogger = await getBloggerById(bloggerId);
  if (!blogger) throw new Error(`Blogger ${bloggerId} not found`);

  // Fetch recent works
  const posts = await fetchDouyinUserPosts(blogger.douyinUid, 20);
  if (posts.length === 0) return;

  // Insert works (skip existing by awemeId)
  const inserted: Array<{ id: number; awemeId: string }> = [];
  for (const post of posts) {
    const existing = db
      .select({ id: works.id })
      .from(works)
      .where(eq(works.awemeId, post.aweme_id))
      .get();
    if (!existing) {
      const w = db
        .insert(works)
        .values({
          awemeId: post.aweme_id,
          bloggerId: blogger.id,
          desc: post.desc || "",
          duration: post.video?.duration || 0,
          coverUrl: post.video?.cover?.url_list?.[0] || "",
          shareUrl: post.share_url || "",
          statistics: JSON.stringify(post.statistics || {}),
          publishedAt: post.create_time,
          transcriptStatus: "pending",
        })
        .returning()
        .get();
      inserted.push({ id: (w as any).id, awemeId: post.aweme_id });
    }
  }

  // Attempt ASR transcription for new works
  const videosToTranscribe = posts
    .filter((p) => inserted.some((iw) => iw.awemeId === p.aweme_id))
    .map((p) => ({
      awemeId: p.aweme_id,
      videoUrl: p.video?.download_addr?.url_list?.[0]
        || p.video?.play_addr?.url_list?.[0]
        || "",
    }))
    .filter((v) => v.videoUrl);

  const transcripts = await transcribeBatch(videosToTranscribe);

  // Update transcripts
  for (const [awemeId, text] of transcripts) {
    if (text) {
      db.update(works)
        .set({ transcript: text, transcriptStatus: "done" })
        .where(eq(works.awemeId, awemeId))
        .run();
    } else {
      db.update(works)
        .set({ transcriptStatus: "failed" })
        .where(eq(works.awemeId, awemeId))
        .run();
    }
  }

  // Build the content summary for LLM classification
  const allWorks = db
    .select()
    .from(works)
    .where(eq(works.bloggerId, bloggerId))
    .orderBy(desc(works.publishedAt))
    .limit(20)
    .all();

  const contentSummary = allWorks
    .map(
      (w) =>
        `[${new Date(w.publishedAt * 1000).toISOString().slice(0, 10)}] desc: ${
          w.desc
        }\ntranscript: ${w.transcript || "(未转写)"}`
    )
    .join("\n\n");

  if (!contentSummary.trim()) return;

  const llmResponse = await callClaude(
    contentSummary,
    BLOGGER_CLASSIFY_PROMPT
  );
  const result = parseClaudeJson<ClassifyResult>(llmResponse);

  const now = Math.floor(Date.now() / 1000);
  db.update(bloggers)
    .set({
      category: result.category,
      classifiedAt: now,
      classificationNote: result.note,
      updatedAt: now,
    })
    .where(eq(bloggers.id, bloggerId))
    .run();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/douyin/blogger-service.ts
git commit -m "feat: add blogger service with CRUD and LLM classification"
```

---

### Task 8: Scanner Service

**Files:**
- Create: `src/services/douyin/scanner-service.ts`

**Produces:**
- `scanAllBloggers()` → scans all predictor bloggers for new works
- `scanBlogger(bloggerId)` → scans single blogger

- [ ] **Step 1: Write the scanner service**

```typescript
// src/services/douyin/scanner-service.ts
import { db } from "@/db";
import { bloggers, works } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchDouyinUserPosts } from "@/lib/douyin-api";
import { transcribeBatch } from "./transcriber";
import type { DouyinBlogger } from "@/types";

export interface ScanResult {
  bloggerId: number;
  nickname: string;
  newWorks: number;
  transcribedWorks: number;
  errors: string[];
}

export async function scanAllBloggers(): Promise<ScanResult[]> {
  const predictorBloggers = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.category, "predictor"))
    .all() as DouyinBlogger[];

  const results: ScanResult[] = [];
  for (const blogger of predictorBloggers) {
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
    transcribedWorks: 0,
    errors: [],
  };

  try {
    const posts = await fetchDouyinUserPosts(blogger.douyinUid, 10);
    if (posts.length === 0) return result;

    // Find new works not yet in DB
    const newPosts = [];
    for (const post of posts) {
      const existing = db
        .select({ id: works.id })
        .from(works)
        .where(eq(works.awemeId, post.aweme_id))
        .get();
      if (!existing) {
        newPosts.push(post);
      }
    }

    if (newPosts.length === 0) return result;
    result.newWorks = newPosts.length;

    // Insert new works
    const videosToTranscribe: Array<{ awemeId: string; videoUrl: string }> =
      [];
    for (const post of newPosts) {
      db.insert(works)
        .values({
          awemeId: post.aweme_id,
          bloggerId: blogger.id,
          desc: post.desc || "",
          duration: post.video?.duration || 0,
          coverUrl: post.video?.cover?.url_list?.[0] || "",
          shareUrl: post.share_url || "",
          statistics: JSON.stringify(post.statistics || {}),
          publishedAt: post.create_time,
          transcriptStatus: "pending",
        })
        .run();

      const videoUrl =
        post.video?.download_addr?.url_list?.[0] ||
        post.video?.play_addr?.url_list?.[0] ||
        "";
      if (videoUrl) {
        videosToTranscribe.push({ awemeId: post.aweme_id, videoUrl });
      }
    }

    // Transcribe
    if (videosToTranscribe.length > 0) {
      const transcripts = await transcribeBatch(videosToTranscribe);
      for (const [awemeId, text] of transcripts) {
        if (text) {
          db.update(works)
            .set({ transcript: text, transcriptStatus: "done" })
            .where(eq(works.awemeId, awemeId))
            .run();
          result.transcribedWorks++;
        } else {
          db.update(works)
            .set({ transcriptStatus: "failed" })
            .where(eq(works.awemeId, awemeId))
            .run();
        }
      }
    }
  } catch (err) {
    result.errors.push(
      err instanceof Error ? err.message : "Unknown error"
    );
  }

  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/douyin/scanner-service.ts
git commit -m "feat: add scanner service for periodic work scanning"
```

---

### Task 9: Evaluator Service

**Files:**
- Create: `src/services/douyin/evaluator-service.ts`

**Produces:**
- `evaluateAllBloggers(evalDate?)` → `EvaluationResult[]`
- `evaluateBlogger(bloggerId, evalDate?)` → `EvaluationResult`

- [ ] **Step 1: Write the evaluator service**

```typescript
// src/services/douyin/evaluator-service.ts
import { db } from "@/db";
import { bloggers, works, evaluations, predictionItems } from "@/db/schema";
import { eq, and, isNull, gte, desc } from "drizzle-orm";
import { callClaude, parseClaudeJson } from "@/lib/llm";
import { getMarketSnapshot } from "./market-snapshot";
import type {
  DouyinBlogger,
  DouyinWork,
  MarketSnapshot,
  PredictionType,
} from "@/types";

const EVALUATION_PROMPT = `你是A股市场分析专家。请根据今天的实际行情数据和博主的视频文案，完成以下任务：

1. 从文案中提取所有明确的行情预测（模糊观点忽略）
2. 根据今天的实际行情，逐一判断每条预测是否正确
3. 综合评估该博主今天的预测准确率（0-100）

注意：
- 只判断已经可以验证的预测（如果博主的预测需要更长时间验证，is_correct 设为 null）
- accuracy_score 只计入已明确可判的条目
- prediction_type 必须是 market_direction / index_level / sector / stock_pick 之一
- 对于 "market_direction"，方向正确（涨/跌）即正确
- 对于 "sector"，该板块今天涨幅排前列（前20）可视为走强
- 对于 "stock_pick"，个股涨幅跑赢大盘可视为短期正确，到达目标价才完全正确

返回严格JSON（不要markdown代码块包裹）：
{
  "worksCount": 3,
  "predictionSummary": "今日共提取3条预测，大盘方向正确，个股推荐1条待验证",
  "accuracyScore": 67,
  "items": [
    {
      "predictedContent": "明天大盘大概率红盘",
      "predictionType": "market_direction",
      "predictionTarget": "大盘",
      "predictionDetail": { "direction": "up" },
      "isCorrect": 1,
      "judgment": "今日上证+0.8%，预测正确",
      "relatedSymbols": []
    }
  ]
}`;

interface LLMEvalItem {
  predictedContent: string;
  predictionType: PredictionType;
  predictionTarget: string;
  predictionDetail: Record<string, unknown>;
  isCorrect: number | null;
  judgment: string;
  relatedSymbols: string[];
}

interface LLMEvalResult {
  worksCount: number;
  predictionSummary: string;
  accuracyScore: number;
  items: LLMEvalItem[];
}

export interface EvaluationResult {
  bloggerId: number;
  nickname: string;
  evalDate: string;
  worksCount: number;
  predictionSummary: string;
  accuracyScore: number;
  itemsCount: number;
  error?: string;
}

export async function evaluateAllBloggers(
  evalDate?: string
): Promise<EvaluationResult[]> {
  const predictorBloggers = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.category, "predictor"))
    .all() as DouyinBlogger[];

  const results: EvaluationResult[] = [];
  for (const blogger of predictorBloggers) {
    results.push(await evaluateBlogger(blogger.id, evalDate));
  }

  return results;
}

export async function evaluateBlogger(
  bloggerId: number,
  evalDate?: string
): Promise<EvaluationResult> {
  const date = evalDate || new Date().toISOString().slice(0, 10);

  const blogger = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.id, bloggerId))
    .get() as DouyinBlogger | undefined;

  const result: EvaluationResult = {
    bloggerId,
    nickname: blogger?.nickname || "unknown",
    evalDate: date,
    worksCount: 0,
    predictionSummary: "",
    accuracyScore: 0,
    itemsCount: 0,
  };

  if (!blogger) {
    result.error = "Blogger not found";
    return result;
  }

  // Get unevaluated works from the last 7 days
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const recentWorks = db
    .select()
    .from(works)
    .where(
      and(
        eq(works.bloggerId, bloggerId),
        gte(works.publishedAt, sevenDaysAgo)
      )
    )
    .orderBy(desc(works.publishedAt))
    .all() as DouyinWork[];

  if (recentWorks.length === 0) return result;

  result.worksCount = recentWorks.length;

  // Get market snapshot
  let marketSnapshot: MarketSnapshot;
  try {
    marketSnapshot = await getMarketSnapshot(date);
  } catch {
    marketSnapshot = {
      date,
      indices: {
        shanghai: { close: 0, change: 0, changePercent: 0 },
        shenzhen: { close: 0, change: 0, changePercent: 0 },
        chinext: { close: 0, change: 0, changePercent: 0 },
      },
      topSectors: [],
      bottomSectors: [],
    };
  }

  // Build the LLM input
  const marketSection = `今日行情数据：\n${JSON.stringify(
    marketSnapshot,
    null,
    2
  )}`;

  const worksSection = recentWorks
    .map(
      (w, i) =>
        `[作品${i + 1}] 发布时间: ${new Date(w.publishedAt * 1000)
          .toISOString()
          .slice(0, 10)}\ndesc: ${w.desc}\ntranscript: ${
          w.transcript || "(未转写)"
        }`
    )
    .join("\n\n");

  const userMessage = `${marketSection}\n\n---\n\n以下是博主 ${
    blogger.nickname
  } 在近期发布的视频文案：\n\n${worksSection}`;

  try {
    const llmResponse = await callClaude(userMessage, EVALUATION_PROMPT);
    const evalResult = parseClaudeJson<LLMEvalResult>(llmResponse);

    result.predictionSummary = evalResult.predictionSummary;
    result.accuracyScore = evalResult.accuracyScore;
    result.itemsCount = evalResult.items.length;

    // Save evaluation
    const evaluation = db
      .insert(evaluations)
      .values({
        bloggerId,
        evalDate: date,
        worksCount: recentWorks.length,
        predictionSummary: evalResult.predictionSummary,
        accuracyScore: evalResult.accuracyScore,
        evalDetail: JSON.stringify(evalResult),
        marketSnapshot: JSON.stringify(marketSnapshot),
      })
      .returning()
      .get();

    const evalId = (evaluation as any).id as number;

    // Save prediction items
    for (const item of evalResult.items) {
      db.insert(predictionItems)
        .values({
          evaluationId: evalId,
          workId: recentWorks[0]?.id || 0, // best-effort linking to first work
          predictedContent: item.predictedContent,
          predictionType: item.predictionType,
          predictionTarget: item.predictionTarget,
          predictionDetail: JSON.stringify(item.predictionDetail),
          isCorrect: item.isCorrect,
          judgment: item.judgment,
          relatedSymbols: JSON.stringify(item.relatedSymbols),
        })
        .run();
    }
  } catch (err) {
    result.error =
      err instanceof Error ? err.message : "Evaluation failed";
  }

  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/douyin/evaluator-service.ts
git commit -m "feat: add evaluator service for post-market prediction assessment"
```

---

### Task 10: API Routes — Bloggers

**Files:**
- Create: `src/app/api/douyin/bloggers/route.ts`
- Create: `src/app/api/douyin/bloggers/[id]/route.ts`

- [ ] **Step 1: Write bloggers list/create route**

```typescript
// src/app/api/douyin/bloggers/route.ts
import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") as
    | "pending"
    | "predictor"
    | "non_predictor"
    | null;

  try {
    const bloggers = await bloggerService.listBloggers(category || undefined);
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

- [ ] **Step 2: Write blogger detail/delete route**

```typescript
// src/app/api/douyin/bloggers/[id]/route.ts
import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/douyin/bloggers/[id]">
) {
  const { id } = await ctx.params;
  const blogger = await bloggerService.getBloggerById(Number(id));
  if (!blogger) {
    return Response.json({ error: "Blogger not found" }, { status: 404 });
  }
  return Response.json(blogger);
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/douyin/bloggers/[id]">
) {
  const { id } = await ctx.params;
  await bloggerService.deleteBlogger(Number(id));
  return Response.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/douyin/bloggers/route.ts src/app/api/douyin/bloggers/\[id\]/route.ts
git commit -m "feat: add API routes for blogger CRUD"
```

---

### Task 11: API Routes — Scan and Evaluate

**Files:**
- Create: `src/app/api/douyin/scan/route.ts`
- Create: `src/app/api/douyin/evaluate/route.ts`

- [ ] **Step 1: Write scan route**

```typescript
// src/app/api/douyin/scan/route.ts
import { scanAllBloggers } from "@/services/douyin/scanner-service";

export async function POST() {
  try {
    const results = await scanAllBloggers();
    const totalNew = results.reduce((sum, r) => sum + r.newWorks, 0);
    const totalTranscribed = results.reduce(
      (sum, r) => sum + r.transcribedWorks,
      0
    );
    return Response.json({
      total: results.length,
      totalNewWorks: totalNew,
      totalTranscribedWorks: totalTranscribed,
      results,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Write evaluate route**

```typescript
// src/app/api/douyin/evaluate/route.ts
import { evaluateAllBloggers } from "@/services/douyin/evaluator-service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const evalDate = body?.evalDate || undefined;

    const results = await evaluateAllBloggers(evalDate);
    const totalItems = results.reduce((sum, r) => sum + r.itemsCount, 0);
    const errors = results.filter((r) => r.error);

    return Response.json({
      date: evalDate || new Date().toISOString().slice(0, 10),
      totalBloggers: results.length,
      totalPredictions: totalItems,
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

- [ ] **Step 3: Commit**

```bash
git add src/app/api/douyin/scan/route.ts src/app/api/douyin/evaluate/route.ts
git commit -m "feat: add API routes for scan and evaluate triggers"
```

---

### Task 12: API Routes — Records (Query)

**Files:**
- Create: `src/app/api/douyin/records/route.ts`

- [ ] **Step 1: Write records query route**

```typescript
// src/app/api/douyin/records/route.ts
import { NextRequest } from "next/server";
import { db } from "@/db";
import { evaluations, predictionItems, bloggers } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const bloggerId = searchParams.get("blogger_id");
  const evalDate = searchParams.get("eval_date");
  const type = searchParams.get("type");

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

    if (bloggerId) {
      query = query.where(eq(evaluations.bloggerId, Number(bloggerId)));
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
        if (
          type &&
          row.items.predictionType !== type
        ) {
          continue;
        }
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

- [ ] **Step 2: Commit**

```bash
git add src/app/api/douyin/records/route.ts
git commit -m "feat: add records query API route"
```

---

### Task 13: Frontend — Main Page Layout

**Files:**
- Create: `src/app/sentiment/douyin/page.tsx`
- Modify: `src/app/sentiment/page.tsx`

- [ ] **Step 1: Add a link from the sentiment page to douyin page**

Edit `src/app/sentiment/page.tsx`, add a tab/nav section above the placeholder card:

```typescript
// src/app/sentiment/page.tsx (full replacement)
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, Radio } from "lucide-react";

export default function SentimentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">舆情分析</h1>
        <p className="text-muted-foreground mt-1">
          社交媒体情绪监测与热点话题追踪
        </p>
      </div>

      {/* Sub-nav tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Link
          href="/sentiment"
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-accent text-accent-foreground"
        >
          <MessageCircle className="h-4 w-4" />
          舆情概览
        </Link>
        <Link
          href="/sentiment/douyin"
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Radio className="h-4 w-4" />
          抖音监控
        </Link>
      </div>

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

- [ ] **Step 2: Create the douyin main page shell**

```typescript
// src/app/sentiment/douyin/page.tsx (full file)
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageCircle,
  Radio,
  Plus,
  RefreshCw,
  BarChart3,
  UserPlus,
  Loader2,
} from "lucide-react";
import type { DouyinBlogger } from "@/types";

const categoryLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  pending: { label: "定位中", variant: "secondary" },
  predictor: { label: "预测型", variant: "default" },
  non_predictor: { label: "非预测型", variant: "outline" },
};

export default function DouyinPage() {
  const [bloggers, setBloggers] = useState<DouyinBlogger[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [uidInput, setUidInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [message, setMessage] = useState("");

  const fetchBloggers = useCallback(async () => {
    const res = await fetch("/api/douyin/bloggers");
    if (res.ok) {
      setBloggers(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBloggers();
  }, [fetchBloggers]);

  const handleAdd = async () => {
    if (!uidInput.trim()) return;
    setAdding(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/bloggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ douyinUid: uidInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setUidInput("");
        setMessage(`已添加 ${data.nickname}，正在后台定位中...`);
        fetchBloggers();
      } else {
        setMessage(`错误: ${data.error}`);
      }
    } catch {
      setMessage("添加失败，请检查网络");
    }
    setAdding(false);
  };

  const handleScan = async () => {
    setScanning(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/scan", { method: "POST" });
      const data = await res.json();
      setMessage(
        `扫描完成：检查了 ${data.total} 个博主，发现 ${data.totalNewWorks} 条新作品`
      );
    } catch {
      setMessage("扫描失败");
    }
    setScanning(false);
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/evaluate", { method: "POST" });
      const data = await res.json();
      setMessage(
        `评判完成：${data.totalBloggers} 个博主，共 ${data.totalPredictions} 条预测`
      );
    } catch {
      setMessage("评判失败");
    }
    setEvaluating(false);
  };

  return (
    <div className="space-y-6">
      {/* Header with sub-nav */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">舆情分析</h1>
        <p className="text-muted-foreground mt-1">
          社交媒体情绪监测与热点话题追踪
        </p>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <Link
          href="/sentiment"
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          舆情概览
        </Link>
        <Link
          href="/sentiment/douyin"
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-accent text-accent-foreground"
        >
          <Radio className="h-4 w-4" />
          抖音监控
        </Link>
      </div>

      {/* Add blogger row */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={uidInput}
              onChange={(e) => setUidInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="输入抖音博主 sec_uid..."
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button onClick={handleAdd} disabled={adding || !uidInput.trim()}>
              {adding ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              添加博主
            </Button>
          </div>
          {message && (
            <p className="mt-3 text-sm text-muted-foreground">{message}</p>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={handleScan} disabled={scanning}>
          {scanning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          手动扫描
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

      {/* Blogger grid */}
      {loading ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : bloggers.length === 0 ? (
        <Card className="flex items-center justify-center min-h-[200px] border-dashed">
          <CardContent className="text-center py-12">
            <Radio className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-muted-foreground">
              暂无博主，请添加一个抖音博主
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {bloggers.map((blogger) => {
            const cat = categoryLabels[blogger.category] || categoryLabels.pending;
            return (
              <Link key={blogger.id} href={`/sentiment/douyin/${blogger.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      {blogger.avatarUrl ? (
                        <img
                          src={blogger.avatarUrl}
                          alt={blogger.nickname}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <Radio className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{blogger.nickname}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {blogger.signature || "暂无签名"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <Badge variant={cat.variant}>{cat.label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {blogger.followerCount.toLocaleString()} 粉丝
                      </span>
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
```

- [ ] **Step 3: Commit**

```bash
git add src/app/sentiment/page.tsx src/app/sentiment/douyin/page.tsx
git commit -m "feat: add douyin monitor main page with blogger management"
```

---

### Task 14: Frontend — Blogger Detail Page

**Files:**
- Create: `src/app/sentiment/douyin/[id]/page.tsx`

- [ ] **Step 1: Write the detail page**

```typescript
// src/app/sentiment/douyin/[id]/page.tsx (full file)
"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2 } from "lucide-react";
import type {
  DouyinBlogger,
  DouyinEvaluation,
  PredictionItem,
} from "@/types";

const typeLabels: Record<string, string> = {
  market_direction: "大盘方向",
  index_level: "指数点位",
  sector: "板块",
  stock_pick: "个股",
};

export default function BloggerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [blogger, setBlogger] = useState<DouyinBlogger | null>(null);
  const [records, setRecords] = useState<
    Array<DouyinEvaluation & { items: PredictionItem[] }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"records" | "trend">("records");

  useEffect(() => {
    async function load() {
      const [bloggerRes, recordsRes] = await Promise.all([
        fetch(`/api/douyin/bloggers/${id}`),
        fetch(`/api/douyin/records?blogger_id=${id}`),
      ]);
      if (bloggerRes.ok) setBlogger(await bloggerRes.json());
      if (recordsRes.ok) setRecords(await recordsRes.json());
      setLoading(false);
    }
    load();
  }, [id]);

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
          href="/sentiment/douyin"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Link>
        <p className="text-muted-foreground">博主不存在</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/sentiment/douyin"
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
                <Badge
                  variant={
                    blogger.category === "predictor"
                      ? "default"
                      : blogger.category === "non_predictor"
                        ? "outline"
                        : "secondary"
                  }
                >
                  {blogger.category === "predictor"
                    ? "预测型博主"
                    : blogger.category === "non_predictor"
                      ? "非预测型"
                      : "定位中..."}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {blogger.followerCount.toLocaleString()} 粉丝
                </span>
              </div>
              {blogger.classificationNote && (
                <p className="mt-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                  📝 {blogger.classificationNote}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setTab("records")}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            tab === "records"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          预测记录
        </button>
        <button
          onClick={() => setTab("trend")}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            tab === "trend"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          准确率趋势
        </button>
      </div>

      {/* Records Tab */}
      {tab === "records" && (
        <div className="space-y-4">
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
            records.map((evaluation) => (
              <Card key={evaluation.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {evaluation.evalDate}
                    </CardTitle>
                    <Badge variant="secondary">
                      准确率 {evaluation.accuracyScore}%
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {evaluation.predictionSummary}
                  </p>
                </CardHeader>
                <CardContent>
                  {evaluation.items.length > 0 && (
                    <div className="space-y-3">
                      {evaluation.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 rounded-md border p-3 text-sm"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs h-5">
                                {typeLabels[item.predictionType] ||
                                  item.predictionType}
                              </Badge>
                              <span className="font-medium truncate">
                                {item.predictionTarget}
                              </span>
                            </div>
                            <p className="text-muted-foreground line-clamp-2">
                              &ldquo;{item.predictedContent}&rdquo;
                            </p>
                            <p className="mt-1 text-xs">
                              {item.isCorrect === 1 ? (
                                <span className="text-green-500">✅ 预测正确</span>
                              ) : item.isCorrect === 0 ? (
                                <span className="text-red-500">❌ 预测错误</span>
                              ) : (
                                <span className="text-yellow-500">
                                  ⏳ 待验证
                                </span>
                              )}
                              <span className="text-muted-foreground ml-2">
                                {item.judgment}
                              </span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Trend Tab */}
      {tab === "trend" && (
        <Card>
          <CardContent className="pt-6">
            {records.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                暂无数据，需要至少一次评判记录
              </p>
            ) : (
              <div className="space-y-4">
                {records.map((evaluation) => (
                  <div
                    key={evaluation.id}
                    className="flex items-center gap-4"
                  >
                    <span className="text-sm w-24 shrink-0">
                      {evaluation.evalDate}
                    </span>
                    <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{
                          width: `${Math.max(evaluation.accuracyScore, 4)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-10 text-right">
                      {evaluation.accuracyScore}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/sentiment/douyin/\[id\]/page.tsx
git commit -m "feat: add blogger detail page with prediction records and trend"
```

---

### Task 15: Extend Frontend API Client

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add douyinAPI to the frontend API client**

Add after the existing `sentimentAPI` block in `src/lib/api.ts`:

```typescript
// ==================== Douyin Monitor API ====================

export const douyinAPI = {
  bloggers: {
    list: (category?: string) =>
      fetchAPI<import("@/types").DouyinBlogger[]>("/douyin/bloggers", {
        params: category ? { category } : undefined,
      }),

    get: (id: number) =>
      fetchAPI<import("@/types").DouyinBlogger>(`/douyin/bloggers/${id}`),

    create: (douyinUid: string) =>
      fetchAPI<import("@/types").DouyinBlogger>("/douyin/bloggers", {
        method: "POST",
        body: JSON.stringify({ douyinUid }),
      }),

    delete: (id: number) =>
      fetchAPI<{ success: boolean }>(`/douyin/bloggers/${id}`, {
        method: "DELETE",
      }),
  },

  scan: () =>
    fetchAPI<{
      total: number;
      totalNewWorks: number;
      results: unknown[];
    }>("/douyin/scan", { method: "POST" }),

  evaluate: (evalDate?: string) =>
    fetchAPI<{
      date: string;
      totalBloggers: number;
      totalPredictions: number;
      results: unknown[];
    }>("/douyin/evaluate", {
      method: "POST",
      body: evalDate ? JSON.stringify({ evalDate }) : undefined,
    }),

  records: (params?: {
    bloggerId?: number;
    evalDate?: string;
    type?: string;
  }) =>
    fetchAPI<
      Array<import("@/types").DouyinEvaluation & {
        items: import("@/types").PredictionItem[];
      }>
    >("/douyin/records", { params }),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add douyin API client methods"
```

---

### Task 16: Integration Test & Verification

- [ ] **Step 1: Verify database initialization**

```bash
npx drizzle-kit push
```

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Test API endpoints with curl**

```bash
# Test blogger list (should return empty array)
curl http://localhost:3000/api/douyin/bloggers

# Test scan (no bloggers yet, should return empty results)
curl -X POST http://localhost:3000/api/douyin/scan

# Test evaluate (no bloggers yet)
curl -X POST http://localhost:3000/api/douyin/evaluate
```

- [ ] **Step 4: Verify frontend pages load**

- Visit `http://localhost:3000/sentiment` — should show sub-nav with 舆情概览 + 抖音监控 tabs
- Visit `http://localhost:3000/sentiment/douyin` — should show empty state with add blogger input
- Verify page renders without errors in browser console

- [ ] **Step 5: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "chore: integration fixes and verification"
```

---

### Task 17: Add `.env.local` Template

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Write env template**

```bash
# .env.example
DOUYIN_API_BASE=https://your-douyin-api.com/api/douyin
NEWAPI_BASE_URL=https://newapi.tdance.cc/v1
NEWAPI_API_KEY=sk-your-key-here
ASR_API_KEY=
ASR_API_SECRET=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add env template for douyin monitor"
```

---

## Implementation Order

Tasks are ordered sequentially due to dependencies:
1. **Task 1**: Dependencies (blocker for all)
2. **Task 2**: Database schema (blocker for services)
3. **Task 3**: Types (blocker for services)
4. **Task 4**: LLM client (blocker for blogger + evaluator)
5. **Task 5**: Douyin API client (blocker for blogger + scanner)
6. **Task 6**: Transcriber + Market snapshot (blocker for blogger + evaluator)
7. **Task 7**: Blogger service (blocker for API routes)
8. **Task 8**: Scanner service (blocker for scan API)
9. **Task 9**: Evaluator service (blocker for evaluate API)
10. **Task 10-12**: API routes (blocker for frontend)
11. **Task 13-15**: Frontend pages
12. **Task 16-17**: Verification + env template
