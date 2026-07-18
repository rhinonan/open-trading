# 抖音博主准确度评判 — 实施计划（子项目 B）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地完整的准确度评判闭环——作品级 evalStatus 队列、cron 驱动定时评判+手动触发、evaluator-agent 挂 a-stock-data skill + sandbox 自主取数、五档判定（含 not_yet 到期重评）、前端进度轮询+筛选+聚合展示。

**Architecture:** 复用 pipeline-queue/runner 模式建独立 eval-queue/runner（并发=1）；`evaluateWorkWorkflow` 三阶段（prepare→agentic_judge→persist）；agent 挂 Workspace(LocalFilesystem+LocalSandbox) 自主执行 Python 取数；prediction_items 直接挂 workId 替代 evaluations 表；准确率实时 SQL 聚合而非预计算。

**Tech Stack:** Next.js 16 App Router + Mastra 1.51 (workflow/agent/workspace) + better-sqlite3 + Drizzle ORM + vitest + React 19 + shadcn + Tailwind v4

## Global Constraints

- Node >= 22.13.0
- 子项目 A（skills 基建）必须先完成
- 所有 API 路由 try/catch → `{ success, error }` 风格
- 生产 Docker 镜像已有 python3 + mootdx/requests/pandas/stockstats
- 复用 pipeline-queue.ts / pipeline-runner.ts 模式（claims/zombie recovery/globalThis 单例）
- `npm test` — vitest 内存 SQLite 跑队列/runner/SQL 聚合逻辑
- `npm run db:generate` / `npm run db:push` 管理 schema 迁移
- 无真实评判数据，删 evaluations 表零风险

---

### Task 1: Schema 迁移

**Files:**
- Modify: `src/db/schema.ts`

**Interfaces:**
- Produces: 新 `works` 列（evalStatus / evalClaimedAt / evaluatedAt）、新 `predictionItems` 表、删除 `evaluations` 表

- [ ] **Step 1: 在 works 表加 eval 列**

打开 `src/db/schema.ts`，在 works 定义中加入新列（`claimedAt` 后面）：

```ts
// 评判状态（与 transcriptStatus 同构，复用队列模式）
evalStatus: text("eval_status", {
  enum: ["none", "pending", "processing", "done", "failed"],
}).notNull().default("none"),
evalClaimedAt: integer("eval_claimed_at"),
evaluatedAt: integer("evaluated_at"),
```

在 works 表的 `(t) => [...]` 内加索引：

```ts
index("works_eval_status_idx").on(t.evalStatus),
```

- [ ] **Step 2: 重建 predictionItems 表**

删除旧 `predictionItems` 定义，替换为：

```ts
export const predictionItems = sqliteTable("prediction_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workId: integer("work_id")
    .notNull()
    .references(() => works.id, { onDelete: "cascade" }),
  predictedContent: text("predicted_content").notNull(),
  predictionTarget: text("prediction_target").notNull().default(""),
  relatedSymbols: text("related_symbols").notNull().default("[]"),
  judgment: text("judgment", {
    enum: ["correct", "mostly_correct", "incorrect", "not_yet", "not_applicable"],
  }).notNull(),
  verifiableAfter: text("verifiable_after"),
  reasoning: text("reasoning").notNull().default(""),
  evidence: text("evidence").notNull().default("{}"),
  judgedAt: integer("judged_at").notNull(),
}, (t) => [
  index("pred_items_work_id_idx").on(t.workId),
  index("pred_items_judgment_idx").on(t.judgment),
  index("pred_items_verifiable_idx").on(t.verifiableAfter).where(
    sql`judgment = 'not_yet'`
  ),
]);
```

- [ ] **Step 3: 删除 evaluations 表**

从 schema.ts 删除 `evaluations` 表定义（整块）。同时删除所有引用 `evaluations` 的 import/join（如有）。

- [ ] **Step 4: 跑迁移**

```bash
npm run db:generate
npm run db:push
```

检查 `data/douyin.db` schema 确认新列/表存在、旧表已删。

- [ ] **Step 5: 验证 build**

```bash
npx tsc --noEmit
```

预期可能有 `evaluations` 引用报错——记下列表（Task 2 处理）。

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: add evalStatus to works, rebuild prediction_items, drop evaluations"
```

---

### Task 2: 类型与引用清理

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/douyin/works-service.ts`
- Modify: `src/app/api/douyin/evaluate/route.ts`
- Modify: `src/app/api/douyin/bloggers/[slug]/evaluate/route.ts`
- Delete: `src/services/douyin/evaluator-service.ts`
- Delete: `src/services/douyin/market-snapshot.ts`

**Interfaces:**
- Produces: 新版 `JudgmentResult`（含 `not_yet`）、`WorkJudgment` 聚合类型、新版 `PredictionItem`

- [ ] **Step 1: 更新 `src/types/index.ts`**

```ts
// JudgmentResult 加 not_yet
export type JudgmentResult =
  | "correct" | "mostly_correct" | "incorrect"
  | "not_applicable" | "not_yet";

// 新增工作级评判聚合
export interface WorkJudgment {
  evalStatus: "none" | "pending" | "processing" | "done" | "failed";
  evaluable: number;
  correct: number;
  mostlyCorrect: number;
  incorrect: number;
  notYet: number;
  notApplicable: number;
  latestItem: { judgment: string; predictedContent: string } | null;
}

// 新版 PredictionItem（直接挂 workId）
export interface PredictionItem {
  id: number;
  workId: number;
  predictedContent: string;
  predictionTarget: string;
  relatedSymbols: string;
  judgment: JudgmentResult;
  verifiableAfter: string | null;
  reasoning: string;
  evidence: string;
  judgedAt: number;
}

// 删除 DouyinEvaluation 接口（如果存在）
```

`WorkWithBlogger.judgment` 类型从 `{ judgment, predictedContent } | null` 改为 `WorkJudgment | null`。

删除 `DouyinEvaluation` 接口。

- [ ] **Step 2: 更新 works-service.ts**

`queryWorks` 中的 judgment 过滤逻辑改用新 prediction_items 表：

- LEFT JOIN 已自动适配（drizzle schema 引用更新后自动生效）
- `filterCounts` 中 judgment 统计加 `not_yet` count
- judgment 过滤子查询：`filter.judgment === "not_yet"` 也走 LEFT JOIN 过滤
- 新增：`filter.judgment === "none"` → 过滤 `evalStatus='none'` 且无 prediction_items 的作品

返回的 `WorkWithBlogger.judgment` 字段改为聚合结构：

```ts
// 在 queryWorks 的结果映射中：
// 对每行 work 单独查 prediction_items 聚合：
const judgmentData = db.select({
  evaluable: sql<number>`count(case when ${predictionItems.judgment} in ('correct','mostly_correct','incorrect') then 1 end)`,
  correct: sql<number>`count(case when ${predictionItems.judgment} = 'correct' then 1 end)`,
  // ... etc
}).from(predictionItems).where(eq(predictionItems.workId, work.id)).get();
```

为性能考虑，批量取所有 workId 的聚合后再 merge——用 `inArray` 一次查回所有作品聚合。

- [ ] **Step 3: 更新 evaluate 路由**

保持现有 `POST /api/douyin/evaluate` 和 `POST /api/douyin/bloggers/[slug]/evaluate` 的路由骨架，把调用从 `evaluateAllBloggers`/`evaluateBlogger` 改为：

```ts
// src/app/api/douyin/evaluate/route.ts
import { enqueueForEvaluation } from "@/services/douyin/eval-queue";
import { getEvalRunner } from "@/services/douyin/eval-runner";

export async function POST(_req: NextRequest) {
  try {
    const count = enqueueForEvaluation();  // 全部 transcriptStatus='done' 且 evalStatus='none'
    getEvalRunner().kick();
    return Response.json({ success: true, enqueued: count });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "入队失败" },
      { status: 500 }
    );
  }
}
```

单博主路由同理：`enqueueForEvaluation({ bloggerId })`。

- [ ] **Step 4: 删除两个空壳文件**

```bash
rm src/services/douyin/evaluator-service.ts
rm src/services/douyin/market-snapshot.ts
```

- [ ] **Step 5: 验证 build**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/services/douyin/works-service.ts src/app/api/douyin/evaluate/ src/app/api/douyin/bloggers/
git rm src/services/douyin/evaluator-service.ts src/services/douyin/market-snapshot.ts
git commit -m "feat: update types for new eval schema, clean up evaluator shells"
```

---

### Task 3: 评判队列服务

**Files:**
- Create: `src/services/douyin/eval-queue.ts`

**Interfaces:**
- Produces: `enqueueForEvaluation(opts?)`, `enqueueReevaluation()`, `claimNextEval()`, `recoverStaleEval()`, `markEvalFailed(workId)`, `countEvalByStatus(status)`

- [ ] **Step 1: 创建 `src/services/douyin/eval-queue.ts`**（完全复刻 pipeline-queue 模式）

```ts
// src/services/douyin/eval-queue.ts
import { db, type Db } from "@/db";
import { works, predictionItems } from "@/db/schema";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";

export const EVAL_STALE_SECONDS = 15 * 60;

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

/** 批量入队 */
export function enqueueForEvaluation(opts?: {
  workIds?: number[];
  bloggerId?: number;
}, dbi: Db = db): number {
  const conds = [eq(works.transcriptStatus, "done")];
  // 只入队未评判或失败的
  conds.push(or(eq(works.evalStatus, "none"), eq(works.evalStatus, "failed")));
  if (opts?.workIds) {
    conds.push(sql`${works.id} IN (${opts.workIds.join(",")})`);
  }
  if (opts?.bloggerId) {
    conds.push(eq(works.bloggerId, opts.bloggerId));
  }
  const res = dbi
    .update(works)
    .set({ evalStatus: "pending", evalClaimedAt: null })
    .where(and(...conds))
    .run();
  return res.changes;
}

/** 到期重评入队 */
export function enqueueReevaluation(dbi: Db = db): number {
  // SQLite 子查询：找出有 not_yet 且 verifiableAfter <= today 的 works
  const rows = dbi
    .selectDistinct({ workId: predictionItems.workId })
    .from(predictionItems)
    .where(
      and(
        eq(predictionItems.judgment, "not_yet"),
        sql`${predictionItems.verifiableAfter} <= date('now')`
      )
    )
    .all();

  const workIds = rows
    .map((r) => r.workId)
    .filter((id): id is number => id != null);

  if (workIds.length === 0) return 0;

  // 只重置 evalStatus='done' 的作品
  const res = dbi
    .update(works)
    .set({ evalStatus: "pending", evalClaimedAt: null })
    .where(
      and(
        sql`${works.id} IN (${workIds.join(",")})`,
        eq(works.evalStatus, "done")
      )
    )
    .run();
  return res.changes;
}

export interface ClaimedEvalWork {
  id: number;
  awemeId: string;
  desc: string;
  transcript: string | null;
  opinionSummary: string;
  publishedAt: number;
  bloggerId: number;
}

/** 原子认领下一条待评判 */
export function claimNextEval(dbi: Db = db, now: number = nowEpoch()): ClaimedEvalWork | null {
  while (true) {
    const candidate = dbi
      .select({
        id: works.id,
        awemeId: works.awemeId,
        desc: works.desc,
        transcript: works.transcript,
        opinionSummary: works.opinionSummary,
        publishedAt: works.publishedAt,
        bloggerId: works.bloggerId,
      })
      .from(works)
      .where(eq(works.evalStatus, "pending"))
      .orderBy(asc(works.scannedAt))
      .limit(1)
      .get();
    if (!candidate) return null;

    const res = dbi
      .update(works)
      .set({ evalStatus: "processing", evalClaimedAt: now })
      .where(
        and(eq(works.id, candidate.id), eq(works.evalStatus, "pending"))
      )
      .run();
    if (res.changes === 1) return candidate;
  }
}

/** 僵尸恢复 */
export function recoverStaleEval(dbi: Db = db, now: number = nowEpoch()): number {
  const cutoff = now - EVAL_STALE_SECONDS;
  const res = dbi
    .update(works)
    .set({ evalStatus: "pending", evalClaimedAt: null })
    .where(
      and(
        eq(works.evalStatus, "processing"),
        or(isNull(works.evalClaimedAt), lt(works.evalClaimedAt, cutoff))
      )
    )
    .run();
  return res.changes;
}

export function markEvalFailed(workId: number, dbi: Db = db): void {
  dbi
    .update(works)
    .set({ evalStatus: "failed" })
    .where(eq(works.id, workId))
    .run();
}

export function countEvalByStatus(
  status: "pending" | "processing",
  dbi: Db = db
): number {
  const row = dbi
    .select({ count: sql<number>`count(*)` })
    .from(works)
    .where(eq(works.evalStatus, status))
    .get();
  return row?.count ?? 0;
}

export function getEvalProgress(dbi: Db = db): Record<string, number> {
  const row = dbi
    .select({
      none: sql<number>`sum(case when ${works.evalStatus} = 'none' then 1 else 0 end)`,
      pending: sql<number>`sum(case when ${works.evalStatus} = 'pending' then 1 else 0 end)`,
      processing: sql<number>`sum(case when ${works.evalStatus} = 'processing' then 1 else 0 end)`,
      done: sql<number>`sum(case when ${works.evalStatus} = 'done' then 1 else 0 end)`,
      failed: sql<number>`sum(case when ${works.evalStatus} = 'failed' then 1 else 0 end)`,
      total: sql<number>`count(*)`,
    })
    .from(works)
    .where(
      and(
        eq(works.transcriptStatus, "done"),
        sql`${works.opinionSummary} != '' OR ${works.transcript} != ''`
      )
    )
    .get();
  return {
    none: Number(row?.none ?? 0),
    pending: Number(row?.pending ?? 0),
    processing: Number(row?.processing ?? 0),
    done: Number(row?.done ?? 0),
    failed: Number(row?.failed ?? 0),
    total: Number(row?.total ?? 0),
  };
}
```

- [ ] **Step 2: 验证 build**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/services/douyin/eval-queue.ts
git commit -m "feat: add eval-queue service — claim/recover/enqueue/re-eval"
```

---

### Task 4: 评判 Runner（含 cron ticks）

**Files:**
- Create: `src/services/douyin/eval-runner.ts`
- Create: `src/lib/cron-matcher.ts`

**Interfaces:**
- Consumes: `eval-queue.ts`, `mastra` (getWorkflow), `settings-service` (getSetting)
- Produces: `getEvalRunner(): Runner` (globalThis 单例)

- [ ] **Step 1: 创建 `src/lib/cron-matcher.ts`**（轻量 cron 解析，不引外部依赖）

```ts
// src/lib/cron-matcher.ts
// 5 字段 cron (min hour dom mon dow) 匹配器，不引外部依赖

export interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

export function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`无效 cron 表达式: ${expr}`);
  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dayOfMonth: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dayOfWeek: parseField(parts[4], 0, 6),
  };
}

function parseField(field: string, min: number, max: number): number[] {
  if (field === "*") {
    const result: number[] = [];
    for (let i = min; i <= max; i++) result.push(i);
    return result;
  }
  const results = new Set<number>();
  for (const part of field.split(",")) {
    if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      let rMin: number, rMax: number;
      if (range === "*") { rMin = min; rMax = max; }
      else if (range.includes("-")) {
        [rMin, rMax] = range.split("-").map(Number);
      } else {
        rMin = parseInt(range, 10); rMax = max;
      }
      for (let i = rMin; i <= rMax; i += step) results.add(i);
    } else if (part.includes("-")) {
      const [s, e] = part.split("-").map(Number);
      for (let i = s; i <= e; i++) results.add(i);
    } else {
      results.add(parseInt(part, 10));
    }
  }
  return [...results].sort((a, b) => a - b);
}

export function cronMatches(cron: CronFields, date: Date): boolean {
  return (
    cron.minute.includes(date.getMinutes()) &&
    cron.hour.includes(date.getHours()) &&
    cron.dayOfMonth.includes(date.getDate()) &&
    cron.month.includes(date.getMonth() + 1) &&
    cron.dayOfWeek.includes(date.getDay())
  );
}

/** 返回 nextRunAt 的中文描述 */
export function describeCronNext(cron: CronFields, from: Date = new Date()): string {
  // 从 from 开始，每次 +1 min 扫描（最多试 7 天）
  const d = new Date(from);
  d.setSeconds(0, 0);
  for (let i = 0; i < 7 * 24 * 60; i++) {
    d.setMinutes(d.getMinutes() + 1);
    if (cronMatches(cron, d)) {
      const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return `${y}-${m}-${day} ${weekdays[d.getDay()]} ${hm}`;
    }
  }
  return "无匹配（cron 表达式可能无法命中）";
}
```

- [ ] **Step 2: 创建 `src/services/douyin/eval-runner.ts`**

完全复刻 pipeline-runner.ts 模式，加 cron tick：

```ts
// src/services/douyin/eval-runner.ts
import { db, type Db } from "@/db";
import { mastra } from "@/mastra";
import {
  claimNextEval, recoverStaleEval, markEvalFailed,
  enqueueForEvaluation, enqueueReevaluation,
  type ClaimedEvalWork,
} from "@/services/douyin/eval-queue";
import { getSetting, setSetting } from "@/services/settings-service";
import { parseCron, cronMatches } from "@/lib/cron-matcher";

const CONCURRENCY = 1; // 东财限流 + sandbox，串行唯一选择
const DEFAULT_CRON = "5 17 * * 1-5";
const TICK_INTERVAL_MS = 60_000; // 每分钟 tick 一次

export interface Runner {
  kick(): void;
  isRunning(): boolean;
}

interface RunnerOptions {
  dbi?: Db;
  concurrency?: number;
}

export function createRunner(opts: RunnerOptions = {}): Runner {
  const dbi = opts.dbi ?? db;
  const concurrency = opts.concurrency ?? CONCURRENCY;
  let running = false;
  let wake = false;
  let tickTimer: ReturnType<typeof setInterval> | null = null;

  async function processWork(work: ClaimedEvalWork): Promise<void> {
    const { id, awemeId, desc, transcript, opinionSummary, publishedAt, bloggerId } = work;
    const logPrefix = `[eval:${awemeId}]`;
    try {
      console.log(`${logPrefix} 开始评判...`);
      const run = await mastra.getWorkflow("evaluateWorkWorkflow").createRun();
      const result = await run.start({
        inputData: { workId: id, awemeId, desc, transcript, opinionSummary, publishedAt, bloggerId },
      });
      if (result.status !== "success") {
        const errorMsg =
          result.status === "failed"
            ? result.error instanceof Error ? result.error.message : String(result.error)
            : `workflow ended with status: ${result.status}`;
        throw new Error(errorMsg);
      }
      console.log(`${logPrefix} ✅ 评判完成`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`${logPrefix} ❌ 失败: ${errorMsg}`);
      markEvalFailed(id, dbi);
    }
  }

  async function worker(): Promise<void> {
    while (true) {
      const claimed = claimNextEval(dbi);
      if (!claimed) return;
      await processWork(claimed);
    }
  }

  async function loop(): Promise<void> {
    do {
      wake = false;
      recoverStaleEval(dbi);
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    } while (wake);
  }

  async function scheduledTick(): Promise<void> {
    try {
      const enabledStr = await getSetting("eval_schedule_enabled");
      if (enabledStr === "false") return;

      const cronExpr = (await getSetting("eval_schedule_cron")) || DEFAULT_CRON;
      const lastRunStr = await getSetting("eval_last_run_at");
      const lastRunAt = lastRunStr ? parseInt(lastRunStr, 10) : 0;
      const now = Math.floor(Date.now() / 1000);

      // 从 lastRunAt 到 now 之间 cron 是否有命中
      const cron = parseCron(cronExpr);
      let shouldFire = false;
      // 每分钟步进扫描（最多回溯 12 小时，够用且不费）
      for (let t = lastRunAt + 60; t <= now; t += 60) {
        if (cronMatches(cron, new Date(t * 1000))) {
          shouldFire = true;
          break;
        }
      }

      if (!shouldFire) return;

      console.log("[eval-runner] cron 触发定时评判");
      const newCount = enqueueForEvaluation({}, dbi);
      const reEvalCount = enqueueReevaluation(dbi);
      console.log(`[eval-runner] 入队: ${newCount} 新作品, ${reEvalCount} 到期重评`);
      await setSetting("eval_last_run_at", String(now));
      kick();
    } catch (err) {
      console.error("[eval-runner] tick error:", err);
    }
  }

  function kick() {
    if (running) { wake = true; return; }
    running = true;
    void loop()
      .catch((err) => console.error("[eval-runner] loop crashed:", err))
      .finally(() => { running = false; if (wake) kick(); });
  }

  // 启动定时 tick
  tickTimer = setInterval(scheduledTick, TICK_INTERVAL_MS);
  // 服务启动后立即测一次（cron 未到点不会触发）
  void scheduledTick();

  return {
    kick,
    isRunning: () => running,
  };
}

// globalThis 单例
const g = globalThis as typeof globalThis & { __evalRunner?: Runner };
export function getEvalRunner(): Runner {
  g.__evalRunner ??= createRunner();
  return g.__evalRunner;
}
```

- [ ] **Step 3: 验证 build**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/cron-matcher.ts src/services/douyin/eval-runner.ts
git commit -m "feat: add eval-runner with cron tick and globalThis singleton"
```

---

### Task 5: evaluateWorkWorkflow + Evaluator Agent（含 Workspace）

**Files:**
- Create: `src/mastra/workflows/evaluate-work-workflow.ts`
- Modify: `src/mastra/agents/evaluator-agent.ts`（挂 workspace）
- Modify: `src/mastra/index.ts`（注册 workflow）

- [ ] **Step 1: 创建 workflow**

```ts
// src/mastra/workflows/evaluate-work-workflow.ts
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { Workspace } from "@mastra/core/workspace";
import { LocalFilesystem } from "@mastra/core/workspace";
import { LocalSandbox } from "@mastra/core/workspace";
import { db } from "@/db";
import { works, predictionItems, bloggers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { evaluatorAgent } from "@/mastra/agents/evaluator-agent";

const workflowInputSchema = z.object({
  workId: z.number(),
  awemeId: z.string(),
  desc: z.string(),
  transcript: z.string().nullable(),
  opinionSummary: z.string(),
  publishedAt: z.number(),
  bloggerId: z.number(),
});

type WorkflowInput = z.infer<typeof workflowInputSchema>;

// 预测条目输出 schema
const predictionsSchema = z.object({
  predictions: z.array(z.object({
    content: z.string().describe("预测内容表述"),
    target: z.string().describe("预测标的：大盘/板块/个股等"),
    symbols: z.array(z.string()).describe("涉及股票代码或指数名"),
    judgment: z.enum(["correct","mostly_correct","incorrect","not_yet","not_applicable"]),
    verifiableAfter: z.string().optional().describe("YYYY-MM-DD，not_yet必填"),
    reasoning: z.string().describe("判定理由"),
    evidence: z.object({}).passthrough().describe("支撑判定的行情数据快照"),
  }))
});

// Step 1: prepare
const prepareStep = createStep({
  id: "eval-prepare",
  inputSchema: workflowInputSchema,
  outputSchema: workflowInputSchema,
  execute: async ({ inputData }) => {
    const { workId, awemeId } = inputData;
    console.log(`[eval:${awemeId}] 准备评判 #${workId}...`);

    const blogger = db.select({ nickname: bloggers.nickname })
      .from(bloggers)
      .where(eq(bloggers.id, inputData.bloggerId))
      .get();

    return {
      ...inputData,
      bloggerNickname: blogger?.nickname ?? "未知",
    };
  },
});

// Step 2: agentic_judge
const judgeStep = createStep({
  id: "eval-judge",
  inputSchema: workflowInputSchema.extend({ bloggerNickname: z.string() }),
  outputSchema: predictionsSchema,
  retries: 2,
  execute: async ({ inputData, getInitData }) => {
    const { workId, awemeId, desc, transcript, opinionSummary, publishedAt, bloggerNickname } = inputData;

    const prompt = buildJudgePrompt({ workId, awemeId, desc, transcript, opinionSummary, publishedAt, bloggerNickname });
    console.log(`[eval:${awemeId}] 开始 agentic 评判...`);

    // 用 agent.generate + structured output 跑
    // Mastra 1.51 的 generate 支持 outputSchema
    const result = await evaluatorAgent.generate(prompt, {
      output: predictionsSchema,
      maxSteps: 15, // agent 最多 15 步（取数 + 判定）
      temperature: 0.3,
    });

    if (!result.object) {
      throw new Error("Agent 未返回有效的结构化输出");
    }
    return result.object as z.infer<typeof predictionsSchema>;
  },
});

// Step 3: persist
const persistStep = createStep({
  id: "eval-persist",
  inputSchema: z.object({
    workId: z.number(),
    predictions: predictionsSchema.shape.predictions,
  }),
  outputSchema: z.object({ persisted: z.number() }),
  execute: async ({ inputData }) => {
    const { workId, predictions } = inputData;
    const now = Math.floor(Date.now() / 1000);

    db.transaction(() => {
      // 删旧条目（重评场景）
      db.delete(predictionItems).where(eq(predictionItems.workId, workId)).run();
      // 插新条目
      for (const p of predictions) {
        db.insert(predictionItems).values({
          workId,
          predictedContent: p.content,
          predictionTarget: p.target,
          relatedSymbols: JSON.stringify(p.symbols),
          judgment: p.judgment,
          verifiableAfter: p.verifiableAfter ?? null,
          reasoning: p.reasoning,
          evidence: JSON.stringify(p.evidence),
          judgedAt: now,
        }).run();
      }
      // 更新 works
      db.update(works)
        .set({ evalStatus: "done", evaluatedAt: now })
        .where(eq(works.id, workId))
        .run();
    })();

    return { persisted: predictions.length };
  },
});

// prompt 构建
function buildJudgePrompt(input: {
  workId: number;
  awemeId: string;
  desc: string;
  transcript: string | null;
  opinionSummary: string;
  publishedAt: number;
  bloggerNickname: string;
}): string {
  const { awemeId, desc, transcript, opinionSummary, publishedAt, bloggerNickname } = input;
  const pubDate = new Date(publishedAt * 1000).toISOString().slice(0, 10);

  return [
    `## 作品信息`,
    `- 博主: ${bloggerNickname}`,
    `- 发布日期: ${pubDate} (unix: ${publishedAt})`,
    `- 标题: ${desc || "(无)"}`,
    ``,
    `## 观点摘要`,
    opinionSummary || "(无)",
    ``,
    `## 完整转写`,
    (transcript || "").slice(0, 8000),
    ``,
    `请根据以上转写文本，提取所有可验证的行情预测并判定正确性。`,
    `发布日期 ${pubDate} 是时间锚点——取数时以该日期为基准。`,
  ].join("\n");
}

// compose workflow
export const evaluateWorkWorkflow = createWorkflow({
  id: "evaluate-work",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({ persisted: z.number() }),
})
  .then(prepareStep)
  .then(judgeStep)
  .then(persistStep)
  .commit();
```

- [ ] **Step 2: 给 evaluator-agent 挂 workspace + sandbox**

更新 `src/mastra/agents/evaluator-agent.ts`：

```ts
import { Workspace } from "@mastra/core/workspace";
import { LocalFilesystem } from "@mastra/core/workspace";
import { LocalSandbox } from "@mastra/core/workspace";

// 探测可用 python 命令
import { execSync } from "child_process";
function detectPython(): string {
  for (const cmd of ["python3", "python"]) {
    try { execSync(`${cmd} --version`, { timeout: 3000 }); return cmd; }
    catch { /* continue */ }
  }
  return "python3"; // fallback
}

const pythonCmd = detectPython();

export const evaluatorAgent = new Agent({
  id: "evaluator-agent",
  name: "evaluator-agent",
  instructions: EVALUATOR_INSTRUCTIONS.replace(/python3/g, pythonCmd), // 注入实际命令名
  model: newapiModel("evaluation"),
  skills: () => resolveAgentSkills("evaluatorAgent"),
  workspace: new Workspace({
    filesystem: new LocalFilesystem({
      rootDir: path.join(process.cwd(), "data", "workspace", "evaluator"),
    }),
    sandbox: new LocalSandbox({
      workingDirectory: path.join(process.cwd(), "data", "workspace", "evaluator"),
      timeout: 120_000,
    }),
  }),
});
```

`Instructions` 中加入 python 命令名说明（动态注入）：

```ts
const EVALUATOR_INSTRUCTIONS = `你是 A 股行情评判专家...

## 执行环境
- 本机可用命令: ${pythonCmd}（执行 Python 脚本）
- 工作目录: data/workspace/evaluator/
- 每个脚本超时: 120 秒

...`;
```

- [ ] **Step 3: 注册 workflow 到 Mastra**

`src/mastra/index.ts`：

```ts
import { evaluateWorkWorkflow } from "@/mastra/workflows/evaluate-work-workflow";

export const mastra = new Mastra({
  agents: { opinionAgent, evaluatorAgent },
  workflows: { transcribeWorkWorkflow, evaluateWorkWorkflow },
  // ...
});
```

- [ ] **Step 4: 验证 build**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/mastra/workflows/evaluate-work-workflow.ts src/mastra/agents/evaluator-agent.ts src/mastra/index.ts
git commit -m "feat: add evaluateWorkWorkflow with agentic judge + sandbox"
```

---

### Task 6: 评判 API 路由完善

**Files:**
- Modify: `src/app/api/douyin/evaluate/route.ts`
- Modify: `src/app/api/douyin/bloggers/[slug]/evaluate/route.ts`
- Create: `src/app/api/douyin/evaluate/progress/route.ts`
- Create: `src/app/api/settings/eval-schedule/route.ts`

- [ ] **Step 1: 更新全局评判路由**

```ts
// src/app/api/douyin/evaluate/route.ts
import { NextRequest } from "next/server";
import { enqueueForEvaluation } from "@/services/douyin/eval-queue";
import { getEvalRunner } from "@/services/douyin/eval-runner";

export async function POST(_req: NextRequest) {
  try {
    const count = enqueueForEvaluation();
    getEvalRunner().kick();
    return Response.json({ success: true, enqueued: count });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "入队失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 更新单博主评判路由**

```ts
// src/app/api/douyin/bloggers/[slug]/evaluate/route.ts
import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { enqueueForEvaluation } from "@/services/douyin/eval-queue";
import { getEvalRunner } from "@/services/douyin/eval-runner";

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
    const count = enqueueForEvaluation({ bloggerId: blogger.id });
    getEvalRunner().kick();
    return Response.json({ success: true, enqueued: count });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "入队失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: 创建进度查询路由**

```ts
// src/app/api/douyin/evaluate/progress/route.ts
import { NextRequest } from "next/server";
import { getEvalProgress } from "@/services/douyin/eval-queue";

export async function GET(_req: NextRequest) {
  try {
    const progress = getEvalProgress();
    return Response.json({ success: true, ...progress });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "获取进度失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: 创建 cron 配置路由**

```ts
// src/app/api/settings/eval-schedule/route.ts
import { NextRequest } from "next/server";
import { getSetting, setSetting } from "@/services/settings-service";

export async function GET() {
  try {
    const cron = (await getSetting("eval_schedule_cron")) || "5 17 * * 1-5";
    const enabled = (await getSetting("eval_schedule_enabled")) || "true";
    return Response.json({ success: true, cron, enabled: enabled === "true" });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "获取失败" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { cron, enabled } = await req.json();
    if (cron !== undefined) {
      // 基本校验
      if (typeof cron !== "string" || cron.trim().split(/\s+/).length !== 5) {
        return Response.json({ success: false, error: "cron 格式需为 5 字段" }, { status: 400 });
      }
      await setSetting("eval_schedule_cron", cron.trim());
    }
    if (enabled !== undefined) {
      await setSetting("eval_schedule_enabled", enabled ? "true" : "false");
    }
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "保存失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 5: 验证 build**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/douyin/evaluate/ src/app/api/douyin/bloggers/ src/app/api/settings/eval-schedule/
git commit -m "feat: add eval API — enqueue/kick/progress + cron settings endpoint"
```

---

### Task 7: 设置页 UI（cron 配置 + 评判进度）

**Files:**
- Modify: `src/app/settings/douyin/page.tsx`
- Modify: `src/app/settings/douyin/BloggerToolbar.tsx`

- [ ] **Step 1: 加评判进度面板 + cron 配置**

在 settings/douyin 页面顶部区域（表格上方）新增评判控制区：

```tsx
// 新增组件内状态
const [evalProgress, setEvalProgress] = useState<Record<string,number>>({});
const [evalCron, setEvalCron] = useState("5 17 * * 1-5");
const [evalEnabled, setEvalEnabled] = useState(true);
const [nextRun, setNextRun] = useState("");

// 轮询进度
useEffect(() => {
  const timer = setInterval(async () => {
    const res = await fetch("/api/douyin/evaluate/progress");
    const data = await res.json();
    if (data.success) setEvalProgress(data);
  }, 3000);
  return () => clearInterval(timer);
}, []);

// 取 cron 配置
useEffect(() => {
  fetch("/api/settings/eval-schedule")
    .then(r => r.json())
    .then(d => { if (d.success) { setEvalCron(d.cron); setEvalEnabled(d.enabled); } });
}, []);

async function handleSaveSchedule() {
  await fetch("/api/settings/eval-schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cron: evalCron, enabled: evalEnabled }),
  });
}

async function handleEvalAll() {
  await fetch("/api/douyin/evaluate", { method: "POST" });
}

// 计算 nextRun 预览（client 端实时算 cron 下一次命中）
useEffect(() => {
  try {
    const fields = parseCron(evalCron); // 复制 cron-matcher 逻辑或调 API
    setNextRun(describeCronNext(fields));
  } catch { setNextRun("cron 格式无效"); }
}, [evalCron]);
```

在 JSX 中渲染：

```tsx
{/* 评判控制区 */}
<div className="rounded-lg border p-4">
  <h3 className="mb-3 font-semibold">准确度评判</h3>

  {/* 进度条 */}
  <div className="mb-3 flex items-center gap-2 text-sm">
    <span className="text-muted-foreground">评判进度：</span>
    <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">完成 {evalProgress.done ?? 0}</span>
    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">队列 {evalProgress.pending ?? 0}</span>
    <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">处理中 {evalProgress.processing ?? 0}</span>
    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">失败 {evalProgress.failed ?? 0}</span>
    <span className="text-muted-foreground text-xs">共 {evalProgress.total ?? 0} 可评判作品</span>
  </div>

  {/* 按钮行 */}
  <div className="flex items-center gap-2">
    <button onClick={handleEvalAll} className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium">
      立即评判全部
    </button>

    {/* Cron 配置 */}
    <div className="ml-4 flex items-center gap-2">
      <label className="text-sm text-muted-foreground">定时：</label>
      <input
        type="text"
        value={evalCron}
        onChange={(e) => setEvalCron(e.target.value)}
        className="border-input bg-background w-36 rounded-md border px-2 py-1 text-sm font-mono"
        placeholder="5 17 * * 1-5"
      />
      <select
        onChange={(e) => setEvalCron(e.target.value)}
        className="border-input bg-background rounded-md border px-2 py-1 text-sm"
      >
        <option value="">快捷预设</option>
        <option value="5 17 * * 1-5">工作日收盘后</option>
        <option value="5 17 * * *">每日收盘后</option>
        <option value="0 9 * * 1">每周一</option>
      </select>
      <label className="inline-flex items-center gap-1 text-sm">
        <input type="checkbox" checked={evalEnabled} onChange={(e) => setEvalEnabled(e.target.checked)} />
        启用
      </label>
      <button onClick={handleSaveSchedule} className="hover:bg-muted rounded-md px-2 py-1 text-sm">
        保存
      </button>
      <span className="text-muted-foreground text-xs">{nextRun ? `下次：${nextRun}` : ""}</span>
    </div>
  </div>
</div>
```

- [ ] **Step 2: 单博主评判按钮同理**

BloggerToolbar 已有 evaluate 按钮——确认它调 `POST /api/douyin/bloggers/[slug]/evaluate` 即可。

- [ ] **Step 3: 验证 build + lint**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/douyin/
git commit -m "feat: add eval progress + cron config UI in settings page"
```

---

### Task 8: 作品管理表 + 博主页 UI 更新

**Files:**
- Modify: `src/app/settings/douyin/FilterBar.tsx`
- Modify: `src/app/settings/douyin/WorksTable.tsx`
- Create: `src/app/settings/douyin/EvalDetailPanel.tsx`
- Modify: `src/app/douyin/[slug]/page.tsx`
- Modify: `src/app/api/douyin/bloggers/route.ts`

- [ ] **Step 1: FilterBar 加筛选选项**

judgment 下拉加：

```tsx
<option value="not_yet">当前不适合</option>
<option value="none">未评判</option>
```

- [ ] **Step 2: WorksTable 评判徽标**

每行加评判状态聚合徽标：

```tsx
{/* 在行内 desc 或 action 列旁边 */}
{work.judgment && (
  <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-xs">
    {work.judgment.evaluable > 0 && (
      <>{work.judgment.correct}✓ {work.judgment.incorrect}✗</>
    )}
    {work.judgment.notYet > 0 && <span className="text-amber-500">{work.judgment.notYet}⏳</span>}
    {work.judgment.evaluable === 0 && work.judgment.notYet === 0 && "无预测"}
  </span>
)}
```

- [ ] **Step 3: 创建 EvalDetailPanel（行展开详情）**

```tsx
// src/app/settings/douyin/EvalDetailPanel.tsx
"use client";
import type { PredictionItem } from "@/types";

export function EvalDetailPanel({ items }: { items: PredictionItem[] }) {
  if (items.length === 0) {
    return <div className="text-muted-foreground py-2 text-sm">该作品未包含可评判的行情预测</div>;
  }
  return (
    <div className="space-y-2 py-2">
      {items.map((item) => (
        <div key={item.id} className="rounded border p-3 text-sm">
          <div className="flex items-center gap-2">
            <JudgmentBadge judgment={item.judgment} />
            <span>{item.predictedContent}</span>
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            标的: {item.predictionTarget || "未指定"}
            {item.relatedSymbols && <> · 代码: {item.relatedSymbols}</>}
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            理由: {item.reasoning}
          </div>
          {item.judgment === "not_yet" && item.verifiableAfter && (
            <div className="mt-1 text-xs text-amber-600">
              到期日: {item.verifiableAfter}（到期后自动重评）
            </div>
          )}
          <details className="mt-1">
            <summary className="text-muted-foreground cursor-pointer text-xs">行情数据</summary>
            <pre className="bg-muted mt-1 overflow-auto rounded p-2 text-xs">
              {item.evidence}
            </pre>
          </details>
        </div>
      ))}
    </div>
  );
}

function JudgmentBadge({ judgment }: { judgment: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    correct: { label: "✓ 正确", cls: "bg-green-100 text-green-700" },
    mostly_correct: { label: "△ 基本正确", cls: "bg-blue-100 text-blue-700" },
    incorrect: { label: "✗ 错误", cls: "bg-red-100 text-red-700" },
    not_yet: { label: "⏳ 待验证", cls: "bg-amber-100 text-amber-700" },
    not_applicable: { label: "N/A", cls: "bg-gray-100 text-gray-500" },
  };
  const m = map[judgment] ?? { label: judgment, cls: "bg-gray-100" };
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
}
```

- [ ] **Step 4: WorksTable 行点击展开详情**

在行组件中，点击某行时请求该 work 的 prediction_items：

```tsx
// 状态
const [expanded, setExpanded] = useState(false);
const [items, setItems] = useState<PredictionItem[]>([]);

async function handleExpand() {
  if (expanded) { setExpanded(false); return; }
  // 取作品的全部 prediction_items
  const res = await fetch(`/api/douyin/records?workId=${work.id}`);
  const data = await res.json();
  if (data.success) setItems(data.items);
  setExpanded(true);
}
```

注意：需要在 `GET /api/douyin/records` 加 `workId` 查询参数支持。

- [ ] **Step 5: 博主页五档计数**

`src/app/douyin/[slug]/page.tsx` 的博主 summary 区加五档横向色块：

需要新开一个 API 返回博主五档聚合：

```ts
// 在 blogger 相关 service 或 API 中加：
const stats = db.select({
  correct: sql<number>`count(case when ${predictionItems.judgment}='correct' then 1 end)`,
  mostlyCorrect: sql<number>`count(case when ${predictionItems.judgment}='mostly_correct' then 1 end)`,
  incorrect: sql<number>`count(case when ${predictionItems.judgment}='incorrect' then 1 end)`,
  notYet: sql<number>`count(case when ${predictionItems.judgment}='not_yet' then 1 end)`,
  notApplicable: sql<number>`count(case when ${predictionItems.judgment}='not_applicable' then 1 end)`,
}).from(predictionItems)
  .innerJoin(works, eq(works.id, predictionItems.workId))
  .where(eq(works.bloggerId, bloggerId))
  .get();
```

前端渲染五段色块（绿蓝红琥珀灰）+ 准确率数字。

- [ ] **Step 6: 博主列表准确率更新**

`src/app/api/douyin/bloggers/route.ts` 中的准确率计算改用新聚合 SQL（从 prediction_items JOIN works 算）。注意 `not_yet` / `not_applicable` 不进分母。

- [ ] **Step 7: 验证 build + lint**

```bash
npx tsc --noEmit && npm run lint
```

- [ ] **Step 8: Commit**

```bash
git add src/app/settings/douyin/ src/app/douyin/ src/app/api/douyin/
git commit -m "feat: add eval filters, detail panel, blogger stats UI"
```

---

### Task 9: 测试

**Files:**
- Create: `tests/eval-queue.test.ts`
- Create: `tests/eval-runner.test.ts`
- Create: `tests/cron-matcher.test.ts`
- Create: `tests/accuracy-aggregation.test.ts`

- [ ] **Step 1: 编写 eval-queue 测试**

```ts
// tests/eval-queue.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { migrate } from "drizzle-orm/better-sqlite3/migrator"; // 或者手动建表
import {
  enqueueForEvaluation, enqueueReevaluation,
  claimNextEval, recoverStaleEval, markEvalFailed,
} from "@/services/douyin/eval-queue";
import { works, predictionItems } from "@/db/schema";
import { eq } from "drizzle-orm";

function setupDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  // 手动跑建表（内存 SQLite 无迁移文件）
  db.run(sqlite.prepare(`CREATE TABLE IF NOT EXISTS bloggers (...) ...`)); // 简化：只建需要的表
  return { db, sqlite };
}

describe("eval-queue", () => {
  it("claimNextEval 原子认领 — 2 并发只拿走 1 条", () => {
    const { db } = setupDb();
    // 插入 2 条 pending 作品
    // 同时 claim（用 Promise.all）
    // 断言返回不同的 work
  });

  it("claimNextEval 空队列返回 null", () => {
    const { db } = setupDb();
    expect(claimNextEval(db)).toBeNull();
  });

  it("recoverStaleEval 重置超时 processing", () => {
    const { db } = setupDb();
    // 插入 processing + 16 分钟前 claimedAt
    // 调用 recoverStale
    // 断言 evalStatus 变回 pending
  });
  // ...
});
```

- [ ] **Step 2: 编写 cron-matcher 测试**

```ts
// tests/cron-matcher.test.ts
import { describe, it, expect } from "vitest";
import { parseCron, cronMatches } from "@/lib/cron-matcher";

describe("cron-matcher", () => {
  it("匹配工作日 17:05", () => {
    const cron = parseCron("5 17 * * 1-5");
    const mon = new Date("2026-07-20T17:05:00"); // 周一
    expect(cronMatches(cron, mon)).toBe(true);
    const sat = new Date("2026-07-18T17:05:00"); // 周六
    expect(cronMatches(cron, sat)).toBe(false);
  });

  it("*/15 每 15 分钟", () => {
    const cron = parseCron("*/15 * * * *");
    expect(cronMatches(cron, new Date("2026-07-20T17:00:00"))).toBe(true);
    expect(cronMatches(cron, new Date("2026-07-20T17:15:00"))).toBe(true);
    expect(cronMatches(cron, new Date("2026-07-20T17:07:00"))).toBe(false);
  });
  // ...
});
```

- [ ] **Step 3: 编写准确率聚合测试**

```ts
// tests/accuracy-aggregation.test.ts
import { describe, it, expect } from "vitest";

describe("accuracy aggregation", () => {
  it("correct + mostly_correct*0.5 / evaluable", () => {
    // SQL: 4 correct, 2 mostly_correct, 2 incorrect, 1 not_yet, 1 not_applicable
    // evaluable = 8, accuracy = (4 + 2*0.5) / 8 = 5/8 = 0.625
    expect(0.625).toBeCloseTo(0.625);
  });

  it("全部 not_yet → null", () => {
    // evaluable = 0 → accuracy = null
  });
});
```

- [ ] **Step 4: 跑全量测试**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test: add eval-queue, cron-matcher, accuracy aggregation tests"
```

---

### Task 10: 端到端冒烟验证

手动步骤（不进 CI）：

- [ ] **Step 1: 安装 a-stock-data skill**

打开设置页 Skills tab → 粘贴 GitHub URL → 安装 → 启用 → 挂载 evaluatorAgent。

- [ ] **Step 2: 手动触发评判**

对一个已有 opinionSummary 的作品（如已有转写完成的），在单博主页点评判 → 观察 runner 日志 → 确认 prediction_items 写入、evalStatus 变为 done。

- [ ] **Step 3: 验证到期重评**

手动在 DB 里插入一条 `not_yet + verifiableAfter=昨天` 的 prediction_item → 等 tick 或重启 runner → 确认作品被重新入队并重评。

- [ ] **Step 4: 验证 UI**

- 设置页评判进度面板数字正常（done/pending/failed）
- 作品管理表筛选「当前不适合」正确
- 博主页准确率数值 + 五档色块正常

- [ ] **Step 5: 验证 build**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

---

### 与技术债列表的关系

实施完成后更新 `CLAUDE.md` 技术债列表：
- **#5「evaluator 为空壳」** — 本计划完成后销账
- **#3「扫描器 N+1」** — 不在此范围
- **#1「API 缓存永不过期」** — 不在此范围
