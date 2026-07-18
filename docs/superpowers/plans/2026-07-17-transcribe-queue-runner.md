# 转写任务队列化（原子认领 + 进程内 Runner）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 转写相关 API 从「同步等待整条管线」改为「入队立即返回」，由进程内单例 runner 后台消费；任务捡取用原子 UPDATE 认领 + `claimedAt` 超时重捡，消灭并发重复处理与僵尸 `processing`。

**Architecture:** `works` 表本身就是队列（`transcriptStatus` 状态机 pending → processing → done/failed）。新增 `pipeline-queue.ts`（队列原语：原子认领、僵尸恢复、入队）与 `pipeline-runner.ts`（globalThis 单例、固定并发 2 的 worker 池、kick 唤醒语义）；`pipeline-service.ts` 瘦身为入队 API；三个 transcribe 路由改为触发即返回；前端在有 `processing` 作品时每 5 秒轮询刷新。单条作品的实际执行仍走现有 Mastra `transcribeWorkWorkflow`（不改动）。

**Tech Stack:** Next.js 16 App Router / Drizzle ORM (better-sqlite3, WAL) / Mastra workflow / vitest（本计划引入，测试跑在内存 SQLite 上）

## Global Constraints

- Node >= 22.13.0；Next.js 16 App Router——改路由文件前按 AGENTS.md 要求先读 `node_modules/next/dist/docs/` 相关章节
- 业务库是 `data/douyin.db`（drizzle-kit 管理）；**不要**触碰 `data/mastra.db`
- 本方案依赖「单容器长驻进程」部署形态（docker-compose 单实例 `next start`），不引入外部队列组件（Redis/BullMQ 一律不加）
- 代码注释与 UI 文案使用中文；错误消息「该作品正在转写中」等既有文案必须逐字保留（前端/路由按字符串匹配）
- 允许的 API 行为变更（内部应用）：transcribe 路由改为立即返回队列计数；请求参数 `concurrency` / `maxTasks` 废弃（runner 固定并发 2，跑到队列清空为止）
- 测试通过 `npm test`（vitest）；每个任务收尾跑 `npx tsc --noEmit` 与 `npm run lint` 确认无回归
- 时间戳一律 unixepoch 秒（与现有 schema 一致）

---

### Task 1: vitest 基础设施 + 内存库测试助手

**Files:**
- Modify: `package.json`（scripts 加 `test`）
- Create: `vitest.config.ts`
- Create: `tests/helpers/test-db.ts`
- Test: `tests/test-db.test.ts`

**Interfaces:**
- Consumes: `drizzle/*.sql` 迁移文件（已存在，`--> statement-breakpoint` 分隔语句）
- Produces: `createTestDb(): TestDb` —— 返回跑完全部迁移的内存 drizzle 实例；`TestDb = ReturnType<typeof createTestDb>`。后续所有测试用它建库。

- [ ] **Step 1: 安装 vitest 并加 test script**

```bash
npm install -D vitest
```

`package.json` 的 `scripts` 中加一行（放在 `"lint"` 之后）：

```json
    "test": "vitest run",
```

- [ ] **Step 2: 创建 vitest 配置（对齐 `@/` 路径别名）**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 3: 写失败的冒烟测试**

```ts
// tests/test-db.test.ts
import { describe, it, expect } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { bloggers, works } from "@/db/schema";

describe("test-db helper", () => {
  it("从 drizzle 迁移文件构建出可用的内存库", () => {
    const dbi = createTestDb();
    const r = dbi
      .insert(bloggers)
      .values({ slug: "s", douyinUid: "u", nickname: "n" })
      .run();
    const bloggerId = Number(r.lastInsertRowid);
    dbi.insert(works).values({ awemeId: "a1", bloggerId, publishedAt: 1 }).run();
    const rows = dbi.select().from(works).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].transcriptStatus).toBe("pending");
  });
});
```

- [ ] **Step 4: 运行确认失败**

Run: `npm test`
Expected: FAIL —— `Cannot find module './helpers/test-db'`（或等价的模块不存在错误）

- [ ] **Step 5: 实现 test-db 助手**

```ts
// tests/helpers/test-db.ts
// 内存 SQLite + 全量 drizzle 迁移，供单元测试使用。
// 迁移文件天然覆盖 schema 变更（含后续新增列/索引），无需手写 DDL。
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import fs from "node:fs";
import path from "node:path";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  const dir = path.join(process.cwd(), "drizzle");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), "utf-8");
    // drizzle-kit 用 "--> statement-breakpoint" 分隔多条语句
    for (const stmt of raw.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }

  return drizzle(sqlite, { schema });
}

export type TestDb = ReturnType<typeof createTestDb>;
```

- [ ] **Step 6: 运行确认通过**

Run: `npm test`
Expected: PASS（1 个测试文件，1 个用例）

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/
git commit -m "test: add vitest + in-memory migration test harness"
```

---

### Task 2: schema 加 `claimed_at` 列与索引

**Files:**
- Modify: `src/db/schema.ts:20-43`（works 表）
- Modify: `src/db/index.ts`（导出 `Db` 类型）
- Create: `drizzle/0006_*.sql`（由 db:generate 生成，勿手写）
- Test: `tests/test-db.test.ts`（扩展冒烟测试）

**Interfaces:**
- Produces: `works.claimedAt`（integer 可空，unixepoch 秒，表示最近一次被 runner 认领的时刻）；索引 `works_blogger_id_idx`、`works_transcript_status_idx`；`src/db/index.ts` 导出 `type Db = typeof db`（Task 3/4 的依赖注入参数类型）

- [ ] **Step 1: 写失败的测试（新列 + 索引存在）**

在 `tests/test-db.test.ts` 的 describe 内追加：

```ts
  it("works 表有 claimedAt 列和查询索引", () => {
    const dbi = createTestDb();
    const r = dbi
      .insert(bloggers)
      .values({ slug: "s2", douyinUid: "u2", nickname: "n2" })
      .run();
    const bloggerId = Number(r.lastInsertRowid);
    dbi
      .insert(works)
      .values({ awemeId: "a2", bloggerId, publishedAt: 1, claimedAt: 123 })
      .run();
    const row = dbi.select().from(works).all()[0];
    expect(row.claimedAt).toBe(123);

    const idxRows = dbi.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'index'`
    );
    expect(idxRows.map((x) => x.name)).toEqual(
      expect.arrayContaining([
        "works_blogger_id_idx",
        "works_transcript_status_idx",
      ])
    );
  });
```

文件顶部 import 增加：

```ts
import { sql } from "drizzle-orm";
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL —— insert 报错（`claimed_at` 列不存在 / TS 对象字面量校验失败）

- [ ] **Step 3: 修改 schema**

`src/db/schema.ts` 第 1 行 import 改为：

```ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
```

works 表的 `scannedAt` 字段后追加一列，并给表加第三个参数（索引定义）。修改后 works 表整体为：

```ts
export const works = sqliteTable(
  "works",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    awemeId: text("aweme_id").notNull().unique(),
    bloggerId: integer("blogger_id")
      .notNull()
      .references(() => bloggers.id, { onDelete: "cascade" }),
    desc: text("desc").notNull().default(""),
    videoUrl: text("video_url"),
    transcript: text("transcript"),
    transcriptStatus: text("transcript_status", {
      enum: ["pending", "processing", "done", "failed"],
    })
      .notNull()
      .default("pending"),
    duration: integer("duration").notNull().default(0),
    opinionSummary: text("opinion_summary").notNull().default(""),
    coverUrl: text("cover_url").notNull().default(""),
    shareUrl: text("share_url").notNull().default(""),
    statistics: text("statistics").notNull().default("{}"),
    publishedAt: integer("published_at").notNull(),
    scannedAt: integer("scanned_at")
      .notNull()
      .default(sql`(unixepoch())`),
    // 最近一次被 runner 认领的时刻（unixepoch 秒）；null = 从未认领
    claimedAt: integer("claimed_at"),
  },
  (t) => [
    index("works_blogger_id_idx").on(t.bloggerId),
    index("works_transcript_status_idx").on(t.transcriptStatus),
  ]
);
```

- [ ] **Step 4: 导出 Db 类型**

`src/db/index.ts` 末尾追加：

```ts
// 供服务层做依赖注入（测试传内存库）
export type Db = typeof db;
```

- [ ] **Step 5: 生成并应用迁移**

```bash
npm run db:generate
npm run db:push
```

Expected: `drizzle/` 下出现 `0006_*.sql`（内容为 1 条 `ALTER TABLE ... ADD claimed_at integer` + 2 条 `CREATE INDEX`）；push 对现有库无破坏（加可空列 + 索引，无确认提示或选择保留数据即可）

- [ ] **Step 6: 运行测试确认通过**

Run: `npm test`
Expected: PASS（迁移助手自动拾取 0006 文件）

- [ ] **Step 7: Commit**

```bash
git add src/db/ drizzle/ tests/test-db.test.ts
git commit -m "feat: add works.claimed_at column and status/blogger indexes"
```

---

### Task 3: pipeline-queue —— 原子认领 / 僵尸恢复 / 入队原语

**Files:**
- Create: `src/services/douyin/pipeline-queue.ts`
- Test: `tests/pipeline-queue.test.ts`

**Interfaces:**
- Consumes: `Db` 类型（Task 2）、`works` schema
- Produces（Task 4/5 依赖，签名必须一致）:
  - `claimNextPending(dbi?: Db, now?: number): ClaimedWork | null`
  - `recoverStaleProcessing(dbi?: Db, now?: number): number`
  - `resetFailedForBlogger(bloggerId: number, dbi?: Db): number`
  - `enqueueWork(workId: number, dbi?: Db): { queued: boolean; reason?: string }`
  - `countByStatus(status: "pending" | "processing", bloggerId?: number, dbi?: Db): number`
  - `markWorkFailed(workId: number, dbi?: Db): void`
  - `interface ClaimedWork { id: number; awemeId: string; videoUrl: string | null; duration: number }`
  - `STALE_CLAIM_SECONDS = 900`

- [ ] **Step 1: 写失败的测试**

```ts
// tests/pipeline-queue.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "./helpers/test-db";
import { bloggers, works } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  claimNextPending,
  recoverStaleProcessing,
  resetFailedForBlogger,
  enqueueWork,
  countByStatus,
  markWorkFailed,
  STALE_CLAIM_SECONDS,
} from "@/services/douyin/pipeline-queue";

let dbi: TestDb;
let seq = 0;

function seedBlogger(slug = "b1"): number {
  const r = dbi
    .insert(bloggers)
    .values({ slug, douyinUid: `uid-${slug}`, nickname: slug })
    .run();
  return Number(r.lastInsertRowid);
}

function seedWork(
  bloggerId: number,
  overrides: Partial<typeof works.$inferInsert> = {}
): number {
  seq += 1;
  const r = dbi
    .insert(works)
    .values({
      awemeId: `aweme-${seq}`,
      bloggerId,
      videoUrl: "https://example.com/v.mp4",
      publishedAt: 1000 + seq,
      scannedAt: 1000 + seq,
      ...overrides,
    })
    .run();
  return Number(r.lastInsertRowid);
}

function getWork(id: number) {
  return dbi.select().from(works).where(eq(works.id, id)).get()!;
}

beforeEach(() => {
  dbi = createTestDb();
  seq = 0;
});

describe("claimNextPending", () => {
  it("按 scannedAt 升序认领最早的 pending，置 processing 并记录 claimedAt", () => {
    const b = seedBlogger();
    const w1 = seedWork(b, { scannedAt: 100 });
    seedWork(b, { scannedAt: 200 });
    const claimed = claimNextPending(dbi, 5000);
    expect(claimed?.id).toBe(w1);
    const row = getWork(w1);
    expect(row.transcriptStatus).toBe("processing");
    expect(row.claimedAt).toBe(5000);
  });

  it("没有 pending 时返回 null", () => {
    const b = seedBlogger();
    seedWork(b, { transcriptStatus: "done" });
    seedWork(b, { transcriptStatus: "processing" });
    seedWork(b, { transcriptStatus: "failed" });
    expect(claimNextPending(dbi, 5000)).toBeNull();
  });

  it("连续认领互不重复，认领完返回 null", () => {
    const b = seedBlogger();
    seedWork(b);
    seedWork(b);
    const a = claimNextPending(dbi, 5000);
    const c = claimNextPending(dbi, 5000);
    expect(a!.id).not.toBe(c!.id);
    expect(claimNextPending(dbi, 5000)).toBeNull();
  });
});

describe("recoverStaleProcessing", () => {
  it("重置超时与无 claimedAt 的 processing，保留新鲜的", () => {
    const b = seedBlogger();
    const now = 100_000;
    const stale = seedWork(b, {
      transcriptStatus: "processing",
      claimedAt: now - STALE_CLAIM_SECONDS - 1,
    });
    const legacy = seedWork(b, {
      transcriptStatus: "processing",
      claimedAt: null,
    });
    const fresh = seedWork(b, {
      transcriptStatus: "processing",
      claimedAt: now - 60,
    });
    const n = recoverStaleProcessing(dbi, now);
    expect(n).toBe(2);
    expect(getWork(stale).transcriptStatus).toBe("pending");
    expect(getWork(stale).claimedAt).toBeNull();
    expect(getWork(legacy).transcriptStatus).toBe("pending");
    expect(getWork(fresh).transcriptStatus).toBe("processing");
  });
});

describe("resetFailedForBlogger", () => {
  it("只重置指定博主的 failed", () => {
    const b1 = seedBlogger("b1");
    const b2 = seedBlogger("b2");
    const f1 = seedWork(b1, { transcriptStatus: "failed" });
    const f2 = seedWork(b2, { transcriptStatus: "failed" });
    const d1 = seedWork(b1, { transcriptStatus: "done" });
    const n = resetFailedForBlogger(b1, dbi);
    expect(n).toBe(1);
    expect(getWork(f1).transcriptStatus).toBe("pending");
    expect(getWork(f2).transcriptStatus).toBe("failed");
    expect(getWork(d1).transcriptStatus).toBe("done");
  });
});

describe("enqueueWork", () => {
  it("作品不存在", () => {
    expect(enqueueWork(999, dbi)).toEqual({
      queued: false,
      reason: "作品不存在",
    });
  });

  it("没有视频链接", () => {
    const b = seedBlogger();
    const w = seedWork(b, { videoUrl: null });
    expect(enqueueWork(w, dbi)).toEqual({
      queued: false,
      reason: "该作品没有视频链接",
    });
  });

  it("正在转写中不重复入队", () => {
    const b = seedBlogger();
    const w = seedWork(b, { transcriptStatus: "processing" });
    expect(enqueueWork(w, dbi)).toEqual({
      queued: false,
      reason: "该作品正在转写中",
    });
  });

  it("failed / done / pending 都可入队（重转语义）", () => {
    const b = seedBlogger();
    for (const status of ["failed", "done", "pending"] as const) {
      const w = seedWork(b, { transcriptStatus: status, claimedAt: 42 });
      expect(enqueueWork(w, dbi)).toEqual({ queued: true });
      expect(getWork(w).transcriptStatus).toBe("pending");
      expect(getWork(w).claimedAt).toBeNull();
    }
  });
});

describe("countByStatus / markWorkFailed", () => {
  it("按状态与博主统计", () => {
    const b1 = seedBlogger("b1");
    const b2 = seedBlogger("b2");
    seedWork(b1);
    seedWork(b1, { transcriptStatus: "processing" });
    seedWork(b2);
    expect(countByStatus("pending", undefined, dbi)).toBe(2);
    expect(countByStatus("pending", b1, dbi)).toBe(1);
    expect(countByStatus("processing", b1, dbi)).toBe(1);
  });

  it("markWorkFailed 置 failed", () => {
    const b = seedBlogger();
    const w = seedWork(b, { transcriptStatus: "processing" });
    markWorkFailed(w, dbi);
    expect(getWork(w).transcriptStatus).toBe("failed");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL —— `Cannot find module '@/services/douyin/pipeline-queue'`

- [ ] **Step 3: 实现 pipeline-queue**

```ts
// src/services/douyin/pipeline-queue.ts
// works 表即转写任务队列：pending → processing(claimedAt) → done/failed。
// 认领靠一条原子 UPDATE（better-sqlite3 单写者 + WAL，天然串行化），
// 僵尸恢复兜住「进程中途挂掉导致 processing 卡死」的情况。
import { db, type Db } from "@/db";
import { works } from "@/db/schema";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";

/** processing 超过该秒数视为僵尸，可被重捡 */
export const STALE_CLAIM_SECONDS = 15 * 60;

export interface ClaimedWork {
  id: number;
  awemeId: string;
  videoUrl: string | null;
  duration: number;
}

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

/** 原子认领下一条 pending（scannedAt 最早优先）；队列空返回 null */
export function claimNextPending(
  dbi: Db = db,
  now: number = nowEpoch()
): ClaimedWork | null {
  // 认领失败（被并发 worker 抢走）时循环取下一条
  while (true) {
    const candidate = dbi
      .select({
        id: works.id,
        awemeId: works.awemeId,
        videoUrl: works.videoUrl,
        duration: works.duration,
      })
      .from(works)
      .where(eq(works.transcriptStatus, "pending"))
      .orderBy(asc(works.scannedAt))
      .limit(1)
      .get();
    if (!candidate) return null;

    const res = dbi
      .update(works)
      .set({ transcriptStatus: "processing", claimedAt: now })
      .where(
        and(eq(works.id, candidate.id), eq(works.transcriptStatus, "pending"))
      )
      .run();
    if (res.changes === 1) return candidate;
  }
}

/** 将超时（或历史遗留无 claimedAt）的 processing 重置回 pending，返回条数 */
export function recoverStaleProcessing(
  dbi: Db = db,
  now: number = nowEpoch()
): number {
  const cutoff = now - STALE_CLAIM_SECONDS;
  const res = dbi
    .update(works)
    .set({ transcriptStatus: "pending", claimedAt: null })
    .where(
      and(
        eq(works.transcriptStatus, "processing"),
        or(isNull(works.claimedAt), lt(works.claimedAt, cutoff))
      )
    )
    .run();
  return res.changes;
}

/** 把某博主的 failed 作品重置为 pending（单博主转写的重试语义），返回条数 */
export function resetFailedForBlogger(bloggerId: number, dbi: Db = db): number {
  const res = dbi
    .update(works)
    .set({ transcriptStatus: "pending", claimedAt: null })
    .where(
      and(eq(works.bloggerId, bloggerId), eq(works.transcriptStatus, "failed"))
    )
    .run();
  return res.changes;
}

/** 单作品入队：processing 中的不重复入队，其余状态一律重置为 pending（重转语义） */
export function enqueueWork(
  workId: number,
  dbi: Db = db
): { queued: boolean; reason?: string } {
  const row = dbi
    .select({
      id: works.id,
      videoUrl: works.videoUrl,
      transcriptStatus: works.transcriptStatus,
    })
    .from(works)
    .where(eq(works.id, workId))
    .get();
  if (!row) return { queued: false, reason: "作品不存在" };
  if (!row.videoUrl) return { queued: false, reason: "该作品没有视频链接" };
  if (row.transcriptStatus === "processing")
    return { queued: false, reason: "该作品正在转写中" };

  dbi
    .update(works)
    .set({ transcriptStatus: "pending", claimedAt: null })
    .where(eq(works.id, workId))
    .run();
  return { queued: true };
}

export function countByStatus(
  status: "pending" | "processing",
  bloggerId?: number,
  dbi: Db = db
): number {
  const conds = [eq(works.transcriptStatus, status)];
  if (bloggerId !== undefined) conds.push(eq(works.bloggerId, bloggerId));
  const row = dbi
    .select({ count: sql<number>`count(*)` })
    .from(works)
    .where(and(...conds))
    .get();
  return row?.count ?? 0;
}

export function markWorkFailed(workId: number, dbi: Db = db): void {
  dbi
    .update(works)
    .set({ transcriptStatus: "failed" })
    .where(eq(works.id, workId))
    .run();
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（全部用例）

- [ ] **Step 5: Commit**

```bash
git add src/services/douyin/pipeline-queue.ts tests/pipeline-queue.test.ts
git commit -m "feat: add pipeline-queue with atomic claim and stale recovery"
```

---

### Task 4: pipeline-runner —— 进程内单例 worker 池

**Files:**
- Create: `src/services/douyin/pipeline-runner.ts`
- Test: `tests/pipeline-runner.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `claimNextPending` / `recoverStaleProcessing` / `markWorkFailed` / `ClaimedWork`；`mastra.getWorkflow("transcribeWorkWorkflow")`（现有）
- Produces（Task 5 依赖）:
  - `createRunner(opts: { processWork: (w: ClaimedWork) => Promise<void>; dbi?: Db; concurrency?: number }): Runner`
  - `interface Runner { kick(): void; isRunning(): boolean }`
  - `getTranscribeRunner(): Runner` —— globalThis 单例，processWork 接真实 Mastra workflow

- [ ] **Step 1: 写失败的测试**

```ts
// tests/pipeline-runner.test.ts
import { describe, it, expect, vi } from "vitest";
import { createTestDb, type TestDb } from "./helpers/test-db";
import { bloggers, works } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createRunner } from "@/services/douyin/pipeline-runner";
import type { ClaimedWork } from "@/services/douyin/pipeline-queue";

let seq = 0;

function seedBlogger(dbi: TestDb): number {
  const r = dbi
    .insert(bloggers)
    .values({ slug: "b", douyinUid: "u", nickname: "n" })
    .run();
  return Number(r.lastInsertRowid);
}

function seedWork(
  dbi: TestDb,
  bloggerId: number,
  overrides: Partial<typeof works.$inferInsert> = {}
): number {
  seq += 1;
  const r = dbi
    .insert(works)
    .values({
      awemeId: `aweme-${seq}`,
      bloggerId,
      videoUrl: "https://example.com/v.mp4",
      publishedAt: 1000 + seq,
      scannedAt: 1000 + seq,
      ...overrides,
    })
    .run();
  return Number(r.lastInsertRowid);
}

function markDone(dbi: TestDb, id: number) {
  dbi
    .update(works)
    .set({ transcriptStatus: "done" })
    .where(eq(works.id, id))
    .run();
}

async function waitIdle(runner: { isRunning(): boolean }) {
  await vi.waitFor(() => expect(runner.isRunning()).toBe(false));
}

describe("createRunner", () => {
  it("kick 后清空全部 pending，并发不超上限", async () => {
    const dbi = createTestDb();
    const b = seedBlogger(dbi);
    for (let i = 0; i < 5; i++) seedWork(dbi, b);

    let active = 0;
    let maxActive = 0;
    const processed: number[] = [];
    const runner = createRunner({
      dbi,
      concurrency: 2,
      processWork: async (w: ClaimedWork) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        processed.push(w.id);
        markDone(dbi, w.id);
        active--;
      },
    });

    runner.kick();
    expect(runner.isRunning()).toBe(true);
    await waitIdle(runner);

    expect(processed).toHaveLength(5);
    expect(new Set(processed).size).toBe(5); // 无重复处理
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("processWork 抛异常时该作品置 failed，其余继续", async () => {
    const dbi = createTestDb();
    const b = seedBlogger(dbi);
    const bad = seedWork(dbi, b, { scannedAt: 1 });
    const good = seedWork(dbi, b, { scannedAt: 2 });

    const runner = createRunner({
      dbi,
      concurrency: 1,
      processWork: async (w: ClaimedWork) => {
        if (w.id === bad) throw new Error("boom");
        markDone(dbi, w.id);
      },
    });

    runner.kick();
    await waitIdle(runner);

    const badRow = dbi.select().from(works).where(eq(works.id, bad)).get()!;
    const goodRow = dbi.select().from(works).where(eq(works.id, good)).get()!;
    expect(badRow.transcriptStatus).toBe("failed");
    expect(goodRow.transcriptStatus).toBe("done");
  });

  it("运行中重复 kick 不会并行起第二个循环（无重复处理）", async () => {
    const dbi = createTestDb();
    const b = seedBlogger(dbi);
    for (let i = 0; i < 3; i++) seedWork(dbi, b);

    const processed: number[] = [];
    const runner = createRunner({
      dbi,
      concurrency: 1,
      processWork: async (w: ClaimedWork) => {
        processed.push(w.id);
        await new Promise((r) => setTimeout(r, 5));
        markDone(dbi, w.id);
      },
    });

    runner.kick();
    runner.kick();
    runner.kick();
    await waitIdle(runner);
    expect(processed).toHaveLength(3);
    expect(new Set(processed).size).toBe(3);
  });

  it("空跑后可再次 kick 处理新任务", async () => {
    const dbi = createTestDb();
    const b = seedBlogger(dbi);
    const runner = createRunner({
      dbi,
      concurrency: 1,
      processWork: async (w: ClaimedWork) => markDone(dbi, w.id),
    });

    runner.kick();
    await waitIdle(runner);

    const w = seedWork(dbi, b);
    runner.kick();
    await waitIdle(runner);
    const row = dbi.select().from(works).where(eq(works.id, w)).get()!;
    expect(row.transcriptStatus).toBe("done");
  });

  it("kick 时顺带恢复僵尸 processing", async () => {
    const dbi = createTestDb();
    const b = seedBlogger(dbi);
    const zombie = seedWork(dbi, b, {
      transcriptStatus: "processing",
      claimedAt: null, // 历史遗留卡死
    });

    const runner = createRunner({
      dbi,
      concurrency: 1,
      processWork: async (w: ClaimedWork) => markDone(dbi, w.id),
    });
    runner.kick();
    await waitIdle(runner);
    const row = dbi.select().from(works).where(eq(works.id, zombie)).get()!;
    expect(row.transcriptStatus).toBe("done");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL —— `Cannot find module '@/services/douyin/pipeline-runner'`

- [ ] **Step 3: 实现 pipeline-runner**

```ts
// src/services/douyin/pipeline-runner.ts
// 进程内单例转写 runner：kick() 唤醒，worker 池按并发上限从队列
// 原子认领任务，跑完（含唤醒期间新入队的）自动歇下。
// 依赖单容器长驻进程部署形态；进程挂掉靠 claimedAt 超时重捡兜底。
import { db, type Db } from "@/db";
import { mastra } from "@/mastra";
import {
  claimNextPending,
  recoverStaleProcessing,
  markWorkFailed,
  type ClaimedWork,
} from "@/services/douyin/pipeline-queue";

const CONCURRENCY = 2;

export interface Runner {
  kick(): void;
  isRunning(): boolean;
}

interface RunnerOptions {
  processWork: (work: ClaimedWork) => Promise<void>;
  dbi?: Db;
  concurrency?: number;
}

/** 可注入依赖的工厂（测试用）；生产统一走 getTranscribeRunner() */
export function createRunner(opts: RunnerOptions): Runner {
  const dbi = opts.dbi ?? db;
  const concurrency = opts.concurrency ?? CONCURRENCY;
  let running = false;
  let wake = false;

  async function worker(): Promise<void> {
    while (true) {
      const claimed = claimNextPending(dbi);
      if (!claimed) return;
      try {
        await opts.processWork(claimed);
      } catch (err) {
        // processWork 不应抛出；兜底防止单个任务击穿 worker
        console.error(`[pipeline-runner] [${claimed.awemeId}] 处理异常:`, err);
        markWorkFailed(claimed.id, dbi);
      }
    }
  }

  async function loop(): Promise<void> {
    do {
      wake = false;
      recoverStaleProcessing(dbi);
      await Promise.all(
        Array.from({ length: concurrency }, () => worker())
      );
    } while (wake); // 运行期间有新 kick → 再扫一轮
  }

  return {
    kick() {
      if (running) {
        wake = true;
        return;
      }
      running = true;
      void loop()
        .catch((err) => console.error("[pipeline-runner] loop crashed:", err))
        .finally(() => {
          running = false;
        });
    },
    isRunning: () => running,
  };
}

/** 真实任务执行：跑 Mastra 转写 workflow；自身消化所有错误（失败回写 DB），不抛出 */
async function runTranscribeWorkflow(work: ClaimedWork): Promise<void> {
  const { id, awemeId, videoUrl, duration } = work;
  const logPrefix = `[${awemeId}]`;
  try {
    if (!videoUrl) throw new Error("No video_url stored for this work");
    const run = await mastra.getWorkflow("transcribeWorkWorkflow").createRun();
    const result = await run.start({
      inputData: { workId: id, awemeId, videoUrl, duration },
    });
    if (result.status !== "success") {
      const errorMsg =
        result.status === "failed"
          ? result.error instanceof Error
            ? result.error.message
            : String(result.error)
          : `workflow ended with status: ${result.status}`;
      throw new Error(errorMsg);
    }
    // done 状态与 transcript/opinionSummary 由 workflow 末步回写 DB
    console.log(`${logPrefix} ✅ 转写完成`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`${logPrefix} ❌ 失败: ${errorMsg}`);
    markWorkFailed(id);
  }
}

// dev 热重载会重建模块，用 globalThis 保住单例，避免双 runner 并跑。
// （HMR 后旧闭包仍在跑旧代码属可接受的开发期折衷，僵尸恢复可兜底。）
const g = globalThis as typeof globalThis & { __transcribeRunner?: Runner };

export function getTranscribeRunner(): Runner {
  g.__transcribeRunner ??= createRunner({ processWork: runTranscribeWorkflow });
  return g.__transcribeRunner;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（全部用例；runner 测试有 setTimeout，总耗时应在数秒内）

- [ ] **Step 5: Commit**

```bash
git add src/services/douyin/pipeline-runner.ts tests/pipeline-runner.test.ts
git commit -m "feat: add in-process transcribe runner (singleton, concurrency 2)"
```

---

### Task 5: pipeline-service 瘦身为入队 API，接线 works-service

**Files:**
- Modify: `src/services/douyin/pipeline-service.ts`（整文件重写）
- Modify: `src/services/douyin/works-service.ts:185-243`（删除 `transcribeWork`）、`:279-299`（`batchOperate` 改接线）

**Interfaces:**
- Consumes: Task 3 队列原语、Task 4 `getTranscribeRunner()`
- Produces（Task 6 路由依赖）:
  - `startTranscribePendingWorks(): EnqueueResult`
  - `startTranscribeBloggerWorks(bloggerId: number): EnqueueResult`
  - `startTranscribeWork(workId: number): { success: boolean; error?: string }`
  - `interface EnqueueResult { accepted: true; pending: number; processing: number }`
- 删除导出：`transcribePendingWorks`、`transcribeBloggerWorks`（pipeline-service）、`transcribeWork`（works-service）——Task 6 会同步更新所有引用方

- [ ] **Step 1: 重写 pipeline-service**

整文件替换为：

```ts
// src/services/douyin/pipeline-service.ts
// 转写任务的入队 API：路由只调这里，立即返回；实际执行由 pipeline-runner 后台消费。
// 旧版在此同步跑整条管线（信号量 + 等待全部完成），已废弃。
import {
  enqueueWork,
  recoverStaleProcessing,
  resetFailedForBlogger,
  countByStatus,
} from "@/services/douyin/pipeline-queue";
import { getTranscribeRunner } from "@/services/douyin/pipeline-runner";

export interface EnqueueResult {
  accepted: true;
  /** 排队中（含刚被僵尸恢复重置的） */
  pending: number;
  /** 正在转写 */
  processing: number;
}

/** 全局转写：恢复僵尸 + 唤醒 runner 清空整个 pending 队列 */
export function startTranscribePendingWorks(): EnqueueResult {
  recoverStaleProcessing();
  getTranscribeRunner().kick();
  return {
    accepted: true,
    pending: countByStatus("pending"),
    processing: countByStatus("processing"),
  };
}

/** 单博主转写：该博主的 failed 重置为 pending（重试语义）后唤醒 */
export function startTranscribeBloggerWorks(bloggerId: number): EnqueueResult {
  recoverStaleProcessing();
  resetFailedForBlogger(bloggerId);
  getTranscribeRunner().kick();
  return {
    accepted: true,
    pending: countByStatus("pending", bloggerId),
    processing: countByStatus("processing", bloggerId),
  };
}

/** 单作品转写：入队后唤醒 */
export function startTranscribeWork(workId: number): {
  success: boolean;
  error?: string;
} {
  const r = enqueueWork(workId);
  if (!r.queued) return { success: false, error: r.reason };
  getTranscribeRunner().kick();
  return { success: true };
}
```

（原文件中的 `Semaphore`、`processOneWork`、`transcribePendingWorks`、`transcribeBloggerWorks`、`PipelineConfig` 等全部删除——执行逻辑已迁入 runner，认领逻辑已迁入 queue。）

- [ ] **Step 2: 修改 works-service**

删除 `transcribeWork` 函数（`works-service.ts:185-243` 整段），及顶部 import 中不再使用的 `mastra`（第 5 行 `import { mastra } from "@/mastra";`——确认删除后无其他使用再移除）。

`batchOperate` 内的调用改为（顶部新增 import）：

```ts
import { startTranscribeWork } from "@/services/douyin/pipeline-service";
```

```ts
  for (const workId of workIds) {
    let result: { success: boolean; error?: string };
    if (action === "transcribe") {
      result = startTranscribeWork(workId);
    } else {
      result = await summarizeWork(workId);
    }
```

- [ ] **Step 3: 类型检查（此时预期报错，指向 Task 6 要改的路由）**

Run: `npx tsc --noEmit`
Expected: 仅剩 3 处错误，全部位于 `src/app/api/douyin/**` 路由（引用了已删除的 `transcribePendingWorks` / `transcribeBloggerWorks` / `transcribeWork`）。若出现其他位置的错误，先修复再继续。

- [ ] **Step 4: 运行既有测试确认无回归**

Run: `npm test`
Expected: PASS（queue/runner 测试不受影响）

- [ ] **Step 5: Commit**

```bash
git add src/services/douyin/pipeline-service.ts src/services/douyin/works-service.ts
git commit -m "refactor: pipeline-service becomes enqueue API backed by queue+runner"
```

---

### Task 6: 三个 transcribe 路由改为触发即返回

**Files:**
- Modify: `src/app/api/douyin/transcribe/route.ts`（整文件重写）
- Modify: `src/app/api/douyin/bloggers/[slug]/transcribe/route.ts:3,15`
- Modify: `src/app/api/douyin/works/[id]/transcribe/route.ts:3,16`

**Interfaces:**
- Consumes: Task 5 的 `startTranscribePendingWorks` / `startTranscribeBloggerWorks` / `startTranscribeWork`
- Produces: 路由响应新形态——全局与单博主返回 `{ accepted: true, pending, processing }`（单博主外加 `success: true`）；单作品保持 `{ success, workId }` 与 409 语义不变。前端（Task 7）依赖这些形态。

- [ ] **Step 1: 重写全局路由**

```ts
// src/app/api/douyin/transcribe/route.ts
// 触发即返回：入队计数立即响应，转写由 pipeline-runner 后台执行，
// 进度通过 /api/douyin/works 的 transcriptStatus 轮询。
// （旧参数 concurrency/maxTasks 已废弃：runner 固定并发，跑到队列清空。）
import { startTranscribePendingWorks } from "@/services/douyin/pipeline-service";

export async function POST() {
  try {
    return Response.json(startTranscribePendingWorks());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 修改单博主路由**

`src/app/api/douyin/bloggers/[slug]/transcribe/route.ts` 第 3 行 import 与第 15 行调用改为：

```ts
import { startTranscribeBloggerWorks } from "@/services/douyin/pipeline-service";
```

```ts
    const result = startTranscribeBloggerWorks(blogger.id);
    return Response.json({ success: true, ...result });
```

- [ ] **Step 3: 修改单作品路由**

`src/app/api/douyin/works/[id]/transcribe/route.ts` 第 3 行 import 与第 16 行调用改为：

```ts
import { startTranscribeWork } from "@/services/douyin/pipeline-service";
```

```ts
    const result = startTranscribeWork(workId);
```

（其余逻辑不动：`!result.success` 时按 `"该作品正在转写中"` 映射 409 的分支原样保留。）

- [ ] **Step 4: 类型检查与 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误（Task 5 遗留的 3 处引用错误在此消除）

- [ ] **Step 5: 手工验证触发即返回**

```bash
npm run dev
```

另开终端：

```bash
curl -s -X POST http://localhost:3000/api/douyin/transcribe
```

Expected: **亚秒级**返回 `{"accepted":true,"pending":N,"processing":M}`；dev 终端随后陆续出现 `[awemeId] 开始下载视频...` 等 runner 日志（若库中有 pending 作品）。再次立即重复 curl，返回同样秒回且日志无重复处理同一 awemeId 的迹象。

- [ ] **Step 6: Commit**

```bash
git add src/app/api/douyin/transcribe/route.ts "src/app/api/douyin/bloggers/[slug]/transcribe/route.ts" "src/app/api/douyin/works/[id]/transcribe/route.ts"
git commit -m "feat: transcribe routes return immediately after enqueue"
```

---

### Task 7: 前端轮询转写进度

**Files:**
- Modify: `src/app/settings/douyin/page.tsx:126-148`（提示语）、`:94` 后（新增轮询 effect）

**Interfaces:**
- Consumes: 既有 `/api/douyin/works?blogger_slugs=...` 查询（`transcriptStatus` 字段）；既有 worksCache 失效即重取的 effect（`page.tsx:68-94`）
- Produces: 无新导出——纯页面行为：展开的博主作品列表存在 `processing` 时每 5 秒自动刷新

- [ ] **Step 1: 新增轮询 effect**

在 `page.tsx` 现有「Fetch works for expanded blogger」effect（第 94 行 `}, [expandedId, bloggers, worksCache]);`）之后插入：

```tsx
  // --- Poll works while transcribing ---
  // 展开的作品列表里还有 processing 时，每 5 秒失效缓存触发重取；
  // 全部完成后自动停止。
  useEffect(() => {
    if (expandedId === null) return;
    const list = worksCache[expandedId];
    if (!list?.some((w) => w.transcriptStatus === "processing")) return;
    const timer = setInterval(() => {
      setWorksCache((prev) => {
        const next = { ...prev };
        delete next[expandedId];
        return next;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [expandedId, worksCache]);
```

- [ ] **Step 2: 更新提示语**

`handleTranscribe` 内（`page.tsx:133`）：

```ts
        setMessage("转写任务已加入队列，完成后自动刷新");
```

- [ ] **Step 3: 类型检查与 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误（若 lint 对 effect 依赖提示 `set-state-in-effect`，按文件内既有写法加同款 eslint-disable 注释）

- [ ] **Step 4: 手工验证**

`npm run dev` → 打开 http://localhost:3000/settings/douyin → 展开一个有未转写视频的博主 → 点单条「转写」：

Expected: 提示「转写任务已加入队列」，状态先变 processing，无需手动刷新，完成后约 5 秒内自动变为 done 并显示文稿。

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/douyin/page.tsx
git commit -m "feat: settings page polls transcription progress"
```

---

### Task 8: 文档收尾 + 全量验证

**Files:**
- Modify: `CLAUDE.md`（技术债列表 1、2 移除，4/5 更新；转写小节与常用命令更新）

**Interfaces:**
- Consumes: 本计划全部产出
- Produces: 文档与代码一致

- [ ] **Step 1: 更新 CLAUDE.md**

a) 「常用命令」列表 `npm run lint` 之后加一行：

```markdown
- `npm test` — vitest 单测（内存 SQLite 上跑队列/runner 逻辑）
```

b) 「抖音雷达管线」第 2 点整段替换为：

```markdown
2. **转写**：works 表即任务队列（`transcriptStatus` + `claimedAt`）。`pipeline-queue.ts` 提供原子认领（`UPDATE ... WHERE status='pending'`）与僵尸恢复（processing 超 15 分钟重置）；`pipeline-runner.ts` 是进程内 globalThis 单例（固定并发 2），`kick()` 唤醒后清空队列自动歇下。每条作品跑一次 Mastra `transcribeWorkWorkflow`：下载视频 → ffmpeg 提取音频 → 讯飞 ASR（≤60s 走 IAT，>60s 走 LFASR）→ LLM 观点提取并回写业务库，每步自动重试 2 次。transcribe 路由只入队 + kick，立即返回，前端轮询进度。**此机制依赖单实例部署**，横向扩容前须改造。
```

c) 「已知技术债」删除条目 1、2；条目 4 改为：

```markdown
1. **API 缓存永不过期**：`src/lib/douyin-api.ts` 开启 `DOUYIN_CACHE_MODE` 后 `fetchUserPosts` 分页响应被永久冻结，扫描发现不了博主新作品；且 `writeCache` 无条件落盘，`data/api-cache/` 无限增长。缓存应定位为开发期回放，生产关闭或加 TTL。
2. **API 路由成对复制**：全局/单博主路由重复（管线内部重复已在 2026-07 队列化改造中消除）。
3. **扫描器 N+1**：`scanner-service.ts` 逐条查重 + 逐条插入，应批量 `inArray` 查重 + `onConflictDoNothing` 批量插入（`works` 常用索引已在队列化改造中补齐）。
4. **类型断言绕过 Drizzle 推导**：`as DouyinBlogger[]` 等手写类型与 schema 会漂移，应改用 `$inferSelect` 派生；JSON 文本字段（`statistics` 等）建议在 service 边界加 zod 解析。
5. **evaluator 为空壳**（有意暂缓，等行情数据源就绪）：当前 API 返回看似成功的空结果，建议改为明确的 disabled 标记，避免前端误判。
```

- [ ] **Step 2: 全量验证**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

Expected: 全部通过、构建成功

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md after transcribe queue/runner refactor"
```
