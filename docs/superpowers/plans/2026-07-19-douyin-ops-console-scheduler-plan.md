# 抖音运维台 + JobScheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地完整运维台（扫描交互修复、侧栏单博主操作、勾选批量含评判、工具条、博主停用）与 JobScheduler 四环定时（profile / scan / pipeline kick / eval），独立调度 Tab，删除旧 eval-schedule。

**Architecture:** 进程内 `JobScheduler`（globalThis 单例、60s tick）读取 `schedule.<jobId>.*` settings，到点调用薄 handler；`eval-runner` / `pipeline-runner` 只负责队列消费与 `kick()`。运维页 `/settings/douyin` 做操作；调度页 `/settings/schedule` 做配置。

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + SQLite, vitest, Tailwind v4, shadcn/base-ui Tooltip

## Global Constraints

- 所有 DB 调用写 `await`（即使 better-sqlite3 同步）
- 落盘路径走 `dataPath()`（本计划基本不落盘）
- 新配置进 settings 表（`schedule.*` 键）
- 业务层不感知部署形态
- 表行类型从 schema 派生（`typeof table.$inferSelect`）
- UI/注释中文
- 包管理器 **pnpm**；测试 `pnpm test`
- Spec：`docs/superpowers/specs/2026-07-19-douyin-ops-console-scheduler-design.md`

## File map

| 路径 | 职责 |
|------|------|
| `src/db/schema.ts` + `drizzle/0009_*.sql` | `bloggers.disabled` |
| `src/services/settings-service.ts` | 可选 `deleteSetting` |
| `src/services/douyin/blogger-service.ts` | `listEnabledBloggers` / `setBloggerDisabled` |
| `src/services/douyin/scanner-service.ts` | 全量扫只启用博主 |
| `src/services/scheduler/**` | JobScheduler + jobs + 迁移 |
| `src/services/douyin/eval-runner.ts` | 删除内嵌 cron |
| `src/app/api/settings/schedules/**` | 调度 API |
| 删除 `src/app/api/settings/eval-schedule/**` | 旧 API |
| `src/app/api/douyin/works/batch/route.ts` + works-service | `evaluate` |
| `src/app/api/douyin/bloggers/[slug]/route.ts` | PATCH disabled |
| `src/app/api/douyin/bloggers/route.ts` | 前台过滤 disabled |
| `src/app/settings/douyin/**` | 运维 UI |
| `src/app/settings/schedule/page.tsx` + layout | 调度 Tab |
| `tests/job-scheduler.test.ts` 等 | 单测 |

---

### Task 1: Schema — bloggers.disabled

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0009_blogger_disabled.sql`（若 `pnpm db:generate` 生成不同文件名，以 generate 为准并提交生成物）
- Test: 依赖后续 test-db 迁移自动加载

**Interfaces:**
- Produces: `bloggers.disabled` integer not null default 0；`DouyinBlogger` 经 `$inferSelect` 自动含 `disabled`

- [ ] **Step 1: 改 schema**

在 `bloggers` 表 `updatedAt` 前或后增加：

```typescript
  disabled: integer("disabled").notNull().default(0),
```

- [ ] **Step 2: 生成并核对迁移**

Run: `pnpm db:generate`  
Expected: `drizzle/` 下新 SQL 含 `ALTER TABLE bloggers ADD disabled...`

若 generate 不便，手写：

```sql
ALTER TABLE `bloggers` ADD `disabled` integer DEFAULT 0 NOT NULL;
```

- [ ] **Step 3: 推本地库**

Run: `pnpm db:push`  
Expected: 成功，无报错

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): add bloggers.disabled for ops console"
```

---

### Task 2: settings deleteSetting + blogger 停用服务

**Files:**
- Modify: `src/services/settings-service.ts`
- Modify: `src/services/douyin/blogger-service.ts`
- Test: `tests/blogger-disabled.test.ts`

**Interfaces:**
- Produces:
  - `deleteSetting(key: string): Promise<void>`
  - `listEnabledBloggers(): Promise<DouyinBlogger[]>` — `disabled === 0`
  - `setBloggerDisabled(slug: string, disabled: boolean): Promise<DouyinBlogger>`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/blogger-disabled.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { bloggers } from "@/db/schema";

// 注意：blogger-service 绑全局 db。本测试先直接验证 schema/迁移列存在；
// setBloggerDisabled 的完整测可在 service 注入 dbi 后补，或测 SQL 层。

describe("bloggers.disabled column", () => {
  it("迁移后可插入 disabled=1", () => {
    const db = createTestDb();
    const row = db
      .insert(bloggers)
      .values({
        slug: "abc123abc123",
        douyinUid: "uid-1",
        nickname: "测试",
        disabled: 1,
      })
      .returning()
      .get();
    expect(row.disabled).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认迁移含列**

Run: `pnpm test tests/blogger-disabled.test.ts`  
Expected: PASS（Task 1 迁移已进 drizzle/）

- [ ] **Step 3: settings deleteSetting**

```typescript
// settings-service.ts 追加
export async function deleteSetting(key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key)).run();
}
```

需 `import { settings }` 已有；补 `delete` 用 drizzle。

- [ ] **Step 4: blogger-service 扩展**

```typescript
export async function listEnabledBloggers(): Promise<DouyinBlogger[]> {
  return db
    .select()
    .from(bloggers)
    .where(eq(bloggers.disabled, 0))
    .orderBy(desc(bloggers.followerCount))
    .all();
}

export async function setBloggerDisabled(
  slug: string,
  disabled: boolean
): Promise<DouyinBlogger> {
  const updated = db
    .update(bloggers)
    .set({
      disabled: disabled ? 1 : 0,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(bloggers.slug, slug))
    .returning()
    .get();
  if (!updated) throw new Error(`博主 ${slug} 不存在`);
  return updated;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/services/settings-service.ts src/services/douyin/blogger-service.ts tests/blogger-disabled.test.ts
git commit -m "feat: blogger disable helpers and deleteSetting"
```

---

### Task 3: scanAllBloggers 只扫启用博主

**Files:**
- Modify: `src/services/douyin/scanner-service.ts`

**Interfaces:**
- Consumes: `listEnabledBloggers` 或等价 `where disabled=0`
- Produces: `scanAllBloggers` 不再扫停用博主；单 `scanBlogger` 不变（手动可扫停用）

- [ ] **Step 1: 改 scanAllBloggers**

将：

```typescript
const allBloggers = db.select().from(bloggers).all();
```

改为只取启用（直接 query 或调 `listEnabledBloggers`）：

```typescript
import { listEnabledBloggers } from "@/services/douyin/blogger-service";
// ...
const allBloggers = await listEnabledBloggers();
```

- [ ] **Step 2: Commit**

```bash
git add src/services/douyin/scanner-service.ts
git commit -m "fix(scan): skip disabled bloggers in scanAllBloggers"
```

---

### Task 4: JobScheduler 内核 + 单测

**Files:**
- Create: `src/services/scheduler/types.ts`
- Create: `src/services/scheduler/job-scheduler.ts`
- Create: `src/services/scheduler/job-registry.ts`（可先空 handler 占位，Task 5 填）
- Create: `tests/job-scheduler.test.ts`

**Interfaces:**
- Produces:

```typescript
export type ScheduleJobId = "profile" | "scan" | "pipeline" | "eval";

export interface JobDefinition {
  id: ScheduleJobId;
  label: string;
  description: string;
  defaultEnabled: boolean;
  defaultCron: string;
  handler: () => Promise<void | { summary?: string }>;
}

export interface RunJobResult {
  ok: boolean;
  busy?: boolean;
  error?: string;
  summary?: string;
}

export function createJobScheduler(opts: {
  jobs: JobDefinition[];
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<void>;
  now?: () => number; // unix sec, 测试注入
  tickIntervalMs?: number;
}): {
  start(): void;
  stop(): void;
  tick(): Promise<void>;
  runJob(id: ScheduleJobId, opts?: { force?: boolean }): Promise<RunJobResult>;
  isRunning(id: ScheduleJobId): boolean;
};
```

Settings 键：`schedule.${id}.enabled|cron|last_run_at|last_error`

- [ ] **Step 1: 写失败测试（核心行为）**

```typescript
// tests/job-scheduler.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJobScheduler, type JobDefinition } from "@/services/scheduler/job-scheduler";

function memorySettings() {
  const map = new Map<string, string>();
  return {
    getSetting: async (k: string) => map.get(k) ?? null,
    setSetting: async (k: string, v: string) => {
      map.set(k, v);
    },
    map,
  };
}

describe("createJobScheduler", () => {
  it("force runJob 调用 handler 并写 last_run_at", async () => {
    const settings = memorySettings();
    const handler = vi.fn(async () => ({ summary: "ok" }));
    const jobs: JobDefinition[] = [
      {
        id: "pipeline",
        label: "处理",
        description: "kick",
        defaultEnabled: true,
        defaultCron: "*/15 * * * *",
        handler,
      },
    ];
    let now = 1_700_000_000;
    const sched = createJobScheduler({
      jobs,
      getSetting: settings.getSetting,
      setSetting: settings.setSetting,
      now: () => now,
    });
    const res = await sched.runJob("pipeline", { force: true });
    expect(res.ok).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    expect(await settings.getSetting("schedule.pipeline.last_run_at")).toBe(String(now));
  });

  it("handler 失败仍写 last_run_at 与 last_error", async () => {
    const settings = memorySettings();
    const jobs: JobDefinition[] = [
      {
        id: "scan",
        label: "扫描",
        description: "s",
        defaultEnabled: true,
        defaultCron: "* * * * *",
        handler: async () => {
          throw new Error("boom");
        },
      },
    ];
    const now = 1_700_000_100;
    const sched = createJobScheduler({
      jobs,
      getSetting: settings.getSetting,
      setSetting: settings.setSetting,
      now: () => now,
    });
    const res = await sched.runJob("scan", { force: true });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/boom/);
    expect(await settings.getSetting("schedule.scan.last_run_at")).toBe(String(now));
    expect(await settings.getSetting("schedule.scan.last_error")).toMatch(/boom/);
  });

  it("enabled=false 时 tick 不触发（非 force）", async () => {
    const settings = memorySettings();
    await settings.setSetting("schedule.pipeline.enabled", "false");
    await settings.setSetting("schedule.pipeline.cron", "* * * * *");
    await settings.setSetting("schedule.pipeline.last_run_at", "0");
    const handler = vi.fn(async () => {});
    const jobs: JobDefinition[] = [
      {
        id: "pipeline",
        label: "处理",
        description: "k",
        defaultEnabled: true,
        defaultCron: "* * * * *",
        handler,
      },
    ];
    const now = 1_700_000_200;
    const sched = createJobScheduler({
      jobs,
      getSetting: settings.getSetting,
      setSetting: settings.setSetting,
      now: () => now,
    });
    await sched.tick();
    expect(handler).not.toHaveBeenCalled();
  });

  it("同 job 重入返回 busy", async () => {
    const settings = memorySettings();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const jobs: JobDefinition[] = [
      {
        id: "eval",
        label: "评判",
        description: "e",
        defaultEnabled: true,
        defaultCron: "* * * * *",
        handler: async () => {
          await gate;
        },
      },
    ];
    const sched = createJobScheduler({
      jobs,
      getSetting: settings.getSetting,
      setSetting: settings.setSetting,
      now: () => 1_700_000_300,
    });
    const p1 = sched.runJob("eval", { force: true });
    const p2 = await sched.runJob("eval", { force: true });
    expect(p2.busy).toBe(true);
    release();
    await p1;
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/job-scheduler.test.ts`  
Expected: FAIL module not found

- [ ] **Step 3: 实现 createJobScheduler**

实现要点：

1. `settingKey(id, field)` → `schedule.${id}.${field}`  
2. `isEnabled(id)`：读 enabled，缺省用 `defaultEnabled`（`"true"`/`"false"` 字符串）  
3. `getCron(id)`：读 cron，缺省 `defaultCron`  
4. `shouldFire(id, lastRunAt, now)`：从 `lastRunAt+60` 步进到 `now`，`parseCron` + `cronMatches`（与 eval-runner 相同）  
5. `runJob`：busy 检测 → 调 handler → 成功清 last_error、写 last_run；失败写 last_error + last_run  
6. `tick`：遍历 jobs，enabled 且 shouldFire 则 `runJob`（非 force）  
7. `start`/`stop`：`setInterval(tick, 60_000)`  

将 `JobDefinition` 等类型放在 `job-scheduler.ts` 或 `types.ts` 并导出。

- [ ] **Step 4: 跑测试通过**

Run: `pnpm test tests/job-scheduler.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/scheduler/ tests/job-scheduler.test.ts
git commit -m "feat(scheduler): add injectable JobScheduler core"
```

---

### Task 5: 四 job handlers + 注册表 + 单例 ensureSchedulerStarted

**Files:**
- Create: `src/services/scheduler/jobs/profile.ts`
- Create: `src/services/scheduler/jobs/scan.ts`
- Create: `src/services/scheduler/jobs/pipeline.ts`
- Create: `src/services/scheduler/jobs/eval.ts`
- Create: `src/services/scheduler/migrate-eval-keys.ts`
- Create: `src/services/scheduler/index.ts`（ensureSchedulerStarted + getScheduler）
- Modify: `src/services/scheduler/job-registry.ts`

**Interfaces:**
- Produces: `ensureSchedulerStarted(): void`；`getScheduler()` 暴露 `runJob` / 读 jobs 元数据  
- Handlers 默认值见 spec

- [ ] **Step 1: migrate-eval-keys**

```typescript
// src/services/scheduler/migrate-eval-keys.ts
import { getSetting, setSetting, deleteSetting } from "@/services/settings-service";

const PAIRS: Array<[string, string]> = [
  ["eval_schedule_enabled", "schedule.eval.enabled"],
  ["eval_schedule_cron", "schedule.eval.cron"],
  ["eval_last_run_at", "schedule.eval.last_run_at"],
];

/** 幂等：旧键 → schedule.eval.* 后删除旧键 */
export async function migrateEvalScheduleKeys(): Promise<void> {
  for (const [oldKey, newKey] of PAIRS) {
    const oldVal = await getSetting(oldKey);
    if (oldVal == null) continue;
    const newVal = await getSetting(newKey);
    if (newVal == null) {
      await setSetting(newKey, oldVal);
    }
    await deleteSetting(oldKey);
  }
}
```

- [ ] **Step 2: 四 handler**

```typescript
// jobs/profile.ts
import { listEnabledBloggers, updateBloggerProfile } from "@/services/douyin/blogger-service";

export async function runProfileJob(): Promise<{ summary: string }> {
  const list = await listEnabledBloggers();
  let ok = 0;
  let fail = 0;
  for (const b of list) {
    try {
      await updateBloggerProfile(b.slug);
      ok++;
    } catch {
      fail++;
    }
  }
  return { summary: `资料更新 ${ok} 成功 / ${fail} 失败` };
}

// jobs/scan.ts
import { listEnabledBloggers } from "@/services/douyin/blogger-service";
import { scanBlogger } from "@/services/douyin/scanner-service";

export async function runScanJob(): Promise<{ summary: string }> {
  const list = await listEnabledBloggers();
  let newWorks = 0;
  for (const b of list) {
    const r = await scanBlogger(b);
    newWorks += r.newWorks;
  }
  return { summary: `扫描完成，新增 ${newWorks} 条` };
}

// jobs/pipeline.ts
import { getTranscribeRunner } from "@/services/douyin/pipeline-runner";

export async function runPipelineJob(): Promise<{ summary: string }> {
  getTranscribeRunner().kick();
  return { summary: "已 kick 转写队列" };
}

// jobs/eval.ts
import { enqueueForEvaluation, enqueueReevaluation } from "@/services/douyin/eval-queue";
import { getEvalRunner } from "@/services/douyin/eval-runner";

export async function runEvalJob(): Promise<{ summary: string }> {
  const newCount = enqueueForEvaluation();
  const reEvalCount = enqueueReevaluation();
  getEvalRunner().kick();
  return { summary: `入队新 ${newCount}，重评 ${reEvalCount}` };
}
```

- [ ] **Step 3: job-registry + index 单例**

```typescript
// job-registry.ts
import type { JobDefinition } from "./job-scheduler";
import { runProfileJob } from "./jobs/profile";
import { runScanJob } from "./jobs/scan";
import { runPipelineJob } from "./jobs/pipeline";
import { runEvalJob } from "./jobs/eval";

export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    id: "profile",
    label: "资料更新",
    description: "更新启用中博主的昵称/粉丝/头像",
    defaultEnabled: false,
    defaultCron: "0 8 * * *",
    handler: runProfileJob,
  },
  {
    id: "scan",
    label: "作品扫描",
    description: "扫描启用中博主的新作品",
    defaultEnabled: false,
    defaultCron: "30 8 * * *",
    handler: runScanJob,
  },
  {
    id: "pipeline",
    label: "处理队列",
    description: "kick 转写/图集观点队列（不重试 failed）",
    defaultEnabled: true,
    defaultCron: "*/15 * * * *",
    handler: runPipelineJob,
  },
  {
    id: "eval",
    label: "观点评判",
    description: "新作品入队 + not_yet 重评 + kick",
    defaultEnabled: true,
    defaultCron: "5 17 * * 1-5",
    handler: runEvalJob,
  },
];
```

```typescript
// index.ts
import { getSetting, setSetting } from "@/services/settings-service";
import { createJobScheduler } from "./job-scheduler";
import { JOB_DEFINITIONS } from "./job-registry";
import { migrateEvalScheduleKeys } from "./migrate-eval-keys";
import { getTranscribeRunner } from "@/services/douyin/pipeline-runner";
import { getEvalRunner } from "@/services/douyin/eval-runner";

const g = globalThis as typeof globalThis & {
  __jobScheduler?: ReturnType<typeof createJobScheduler>;
  __jobSchedulerStarted?: boolean;
};

export function getScheduler() {
  g.__jobScheduler ??= createJobScheduler({
    jobs: JOB_DEFINITIONS,
    getSetting,
    setSetting,
  });
  return g.__jobScheduler;
}

export function ensureSchedulerStarted(): void {
  if (g.__jobSchedulerStarted) return;
  g.__jobSchedulerStarted = true;
  void migrateEvalScheduleKeys().catch(() => {});
  // 确保消费端存在
  getTranscribeRunner();
  getEvalRunner();
  const s = getScheduler();
  s.start();
}

export { JOB_DEFINITIONS };
export type { ScheduleJobId } from "./job-scheduler";
```

- [ ] **Step 4: 在会 kick eval 的 API 入口调用 ensureSchedulerStarted**

至少在：

- `src/app/api/douyin/evaluate/route.ts`  
- `src/app/api/douyin/works/[id]/evaluate/route.ts`  
- `src/app/api/douyin/works/[id]/transcribe/route.ts`（或 pipeline-service 内）  
- `src/app/api/settings/schedules`（Task 7）  

顶部调用 `ensureSchedulerStarted()`，避免「只配了 cron 却没人 tick」。也可在 `src/mastra/index.ts` 或 `src/db/index.ts` 旁侧一次启动——**优先选一处服务常加载路径**，避免漏。推荐：`pipeline-service` 的 kick 路径 + schedules API + evaluate 路由都调（幂等）。

- [ ] **Step 5: Commit**

```bash
git add src/services/scheduler/
git commit -m "feat(scheduler): register four jobs and ensureSchedulerStarted"
```

---

### Task 6: 拆除 eval-runner cron + 删除 eval-schedule API

**Files:**
- Modify: `src/services/douyin/eval-runner.ts` — 删除 scheduledTick / setInterval / cron imports / DEFAULT_CRON  
- Delete: `src/app/api/settings/eval-schedule/route.ts`  
- Grep 全库清掉 `eval_schedule_` / `eval-schedule` 引用（迁移文件除外）

**Interfaces:**
- Produces: `getEvalRunner()` 仅 kick/消费；定时只走 JobScheduler

- [ ] **Step 1: 编辑 eval-runner**

删除：

- `parseCron` / `cronMatches` / `getSetting` 用于 cron 的逻辑（若 kick 路径不再需要 getSetting）  
- `scheduledTick` 整函数  
- `tickTimer = setInterval...` 与启动时 `void scheduledTick()`  
- 保留 `createRunner` 的 kick/loop/worker  

- [ ] **Step 2: 删除旧路由文件**

```bash
rm -f src/app/api/settings/eval-schedule/route.ts
# 若目录空则删目录
```

- [ ] **Step 3: grep 清理**

Run: `rg "eval_schedule|eval-schedule|eval_last_run" src tests`  
Expected: 仅 `migrate-eval-keys.ts` 含旧键名

- [ ] **Step 4: 跑相关测试**

Run: `pnpm test tests/eval-queue.test.ts tests/cron-matcher.test.ts tests/job-scheduler.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A src/services/douyin/eval-runner.ts src/app/api/settings/
git commit -m "refactor: move eval cron to JobScheduler; remove eval-schedule API"
```

---

### Task 7: Schedules API

**Files:**
- Create: `src/app/api/settings/schedules/route.ts`
- Create: `src/app/api/settings/schedules/run/route.ts`

**Interfaces:**
- `GET /api/settings/schedules` → jobs 列表含 nextRun  
- `PUT` body `{ id, enabled?, cron? }`  
- `POST /api/settings/schedules/run` body `{ id }`

- [ ] **Step 1: GET/PUT route**

```typescript
// src/app/api/settings/schedules/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSetting, setSetting } from "@/services/settings-service";
import { parseCron, describeCronNext } from "@/lib/cron-matcher";
import {
  ensureSchedulerStarted,
  JOB_DEFINITIONS,
  type ScheduleJobId,
} from "@/services/scheduler";

const IDS = new Set(JOB_DEFINITIONS.map((j) => j.id));

async function readJob(def: (typeof JOB_DEFINITIONS)[number]) {
  const enabledStr =
    (await getSetting(`schedule.${def.id}.enabled`)) ??
    (def.defaultEnabled ? "true" : "false");
  const cron =
    (await getSetting(`schedule.${def.id}.cron`)) ?? def.defaultCron;
  const lastRunRaw = await getSetting(`schedule.${def.id}.last_run_at`);
  const lastError = await getSetting(`schedule.${def.id}.last_error`);
  let nextRun = "";
  try {
    nextRun = describeCronNext(parseCron(cron));
  } catch {
    nextRun = "cron 无效";
  }
  return {
    id: def.id,
    label: def.label,
    description: def.description,
    enabled: enabledStr === "true",
    cron,
    lastRunAt: lastRunRaw ? parseInt(lastRunRaw, 10) : null,
    lastError: lastError || null,
    nextRun,
  };
}

export async function GET() {
  ensureSchedulerStarted();
  try {
    const jobs = await Promise.all(JOB_DEFINITIONS.map(readJob));
    return Response.json({ success: true, jobs });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "获取失败" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  ensureSchedulerStarted();
  try {
    const body = await req.json();
    const id = body.id as ScheduleJobId;
    if (!IDS.has(id)) {
      return Response.json({ success: false, error: "未知 job" }, { status: 400 });
    }
    if (body.cron !== undefined) {
      if (typeof body.cron !== "string" || body.cron.trim().split(/\s+/).length !== 5) {
        return Response.json({ success: false, error: "cron 格式需为 5 字段" }, { status: 400 });
      }
      parseCron(body.cron.trim()); // 抛错则 400
      await setSetting(`schedule.${id}.cron`, body.cron.trim());
    }
    if (body.enabled !== undefined) {
      await setSetting(`schedule.${id}.enabled`, body.enabled ? "true" : "false");
    }
    const def = JOB_DEFINITIONS.find((j) => j.id === id)!;
    const job = await readJob(def);
    return Response.json({ success: true, job });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "保存失败" },
      { status: 400 }
    );
  }
}
```

- [ ] **Step 2: run route**

```typescript
// src/app/api/settings/schedules/run/route.ts
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  ensureSchedulerStarted,
  getScheduler,
  JOB_DEFINITIONS,
  type ScheduleJobId,
} from "@/services/scheduler";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  ensureSchedulerStarted();
  try {
    const { id } = (await req.json()) as { id: ScheduleJobId };
    if (!JOB_DEFINITIONS.some((j) => j.id === id)) {
      return Response.json({ success: false, error: "未知 job" }, { status: 400 });
    }
    const result = await getScheduler().runJob(id, { force: true });
    if (result.busy) {
      return Response.json({ success: false, error: "任务正在运行", busy: true }, { status: 409 });
    }
    if (!result.ok) {
      return Response.json({ success: false, error: result.error }, { status: 500 });
    }
    return Response.json({ success: true, summary: result.summary });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "运行失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/schedules/
git commit -m "feat(api): add schedules GET/PUT and force run"
```

---

### Task 8: batch evaluate + blogger PATCH + 前台过滤

**Files:**
- Modify: `src/services/douyin/works-service.ts` — `batchOperate` action 含 `evaluate`
- Modify: `src/app/api/douyin/works/batch/route.ts`
- Modify: `src/app/api/douyin/bloggers/[slug]/route.ts` — PATCH
- Modify: `src/app/api/douyin/bloggers/route.ts` — `?include=latest_opinion` 时过滤 disabled（或 query `for=public`）；**运维列表要全部**，前台隐藏停用

**Interfaces:**
- `batchOperate(ids, "transcribe"|"summarize"|"evaluate")`
- `PATCH` `{ disabled: boolean }`

- [ ] **Step 1: batchOperate evaluate**

```typescript
import { enqueueForEvaluation } from "@/services/douyin/eval-queue";
import { getEvalRunner } from "@/services/douyin/eval-runner";
import { ensureSchedulerStarted } from "@/services/scheduler";

export async function batchOperate(
  workIds: number[],
  action: "transcribe" | "summarize" | "evaluate"
): Promise<{ total: number; succeeded: number; failed: number; errors: Array<{ workId: number; error: string }> }> {
  ensureSchedulerStarted();
  const errors: Array<{ workId: number; error: string }> = [];
  let succeeded = 0;

  if (action === "evaluate") {
    // 按 id 入队：enqueue 内部已过滤 status；changes=0 的 id 记失败
    for (const workId of workIds) {
      const n = enqueueForEvaluation({ workIds: [workId] });
      if (n > 0) succeeded++;
      else errors.push({ workId, error: "不满足评判条件（需已转写且未评判/失败）" });
    }
    getEvalRunner().kick();
    return { total: workIds.length, succeeded, failed: errors.length, errors };
  }

  for (const workId of workIds) {
    let result: { success: boolean; error?: string };
    if (action === "transcribe") {
      result = startTranscribeWork(workId);
    } else {
      result = await summarizeWork(workId);
    }
    if (result.success) succeeded++;
    else errors.push({ workId, error: result.error ?? "未知错误" });
  }
  return { total: workIds.length, succeeded, failed: errors.length, errors };
}
```

batch route 校验改为：

```typescript
if (action !== "transcribe" && action !== "summarize" && action !== "evaluate") {
```

- [ ] **Step 2: PATCH blogger**

在 `[slug]/route.ts`：

```typescript
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { slug } = await ctx.params;
  try {
    const body = await req.json();
    if (typeof body.disabled !== "boolean") {
      return Response.json({ error: "disabled 必须为 boolean" }, { status: 400 });
    }
    const blogger = await bloggerService.setBloggerDisabled(slug, body.disabled);
    return Response.json({ success: true, blogger });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "更新失败" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: 前台列表过滤**

`GET /api/douyin/bloggers`：当 `include=latest_opinion`（雷达页）时过滤 `disabled===0`；无 include 的管理用途返回全部。

```typescript
let bloggers = await bloggerService.listBloggers();
if (include === "latest_opinion") {
  bloggers = bloggers.filter((b) => b.disabled === 0);
  // ... enrich
}
```

- [ ] **Step 4: Commit**

```bash
git add src/services/douyin/works-service.ts src/app/api/douyin/works/batch/route.ts src/app/api/douyin/bloggers/
git commit -m "feat: batch evaluate, blogger PATCH disabled, hide disabled on radar"
```

---

### Task 9: 运维页 — 工具条 + 消息分流 + 扫描刷新

**Files:**
- Create: `src/app/settings/douyin/OpsToolbar.tsx`
- Create: `src/app/settings/douyin/EvalStatusBar.tsx`
- Modify: `src/app/settings/douyin/page.tsx`
- Modify: `src/app/settings/douyin/WorksTable.tsx` — 暴露 `refresh` / `onRefreshRef` 或 `refreshToken`

**Interfaces:**
- Toolbar：全部**启用**博主的 profile/scan/transcribe/evaluate  
- `showMessage(text, type, { agentLog?: boolean })`  
- 扫描成功带 `newWorks` 并刷新表

- [ ] **Step 1: WorksTable 支持外部刷新**

Props 增加：

```typescript
refreshKey?: number; // page 递增此值触发 fetchWorks(page)
```

`useEffect` 依赖 `refreshKey` 时调用 `fetchWorks(page)`（bloggerSlug 有值时）。

- [ ] **Step 2: OpsToolbar**

按钮：添加博主（回调）| 更新资料 | 扫描作品 | 全部转写 | 立即评判  

逻辑：`bloggers.filter(b => b.disabled === 0)` 逐个 POST：

- `/api/douyin/bloggers/${slug}/update-profile`  
- `/api/douyin/bloggers/${slug}/scan`  
- `/api/douyin/bloggers/${slug}/transcribe`  
- 评判：一次 `POST /api/douyin/evaluate`  

loading 态 + 完成汇总 message。

- [ ] **Step 3: EvalStatusBar**

每 3s `GET /api/douyin/evaluate/progress`，展示 done/pending/processing/failed；链接 `<Link href="/settings/schedule">调度配置</Link>`。

- [ ] **Step 4: page.tsx 组装**

- `showMessage(text, type, opts?: { agentLog?: boolean })`  
  - 仅 `opts.agentLog === true` 时渲染「查看 Agent 日志」链到 `/agents/logs`  
- `handleScan`：解析 `res.json()` 的 `newWorks`（scan 路由返回 `success` + spread 字段）；成功文案 `已扫描「${nickname}」：新增 ${newWorks ?? 0} 条`；`setRefreshKey(k => k+1)`；`agentLog: false`  
- 挂载 `OpsToolbar`、`EvalStatusBar`、`WorksTable refreshKey={refreshKey}`  
- 标题旁可放 `Link` 到 `/settings/schedule`

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/douyin/
git commit -m "feat(ops): toolbar, eval status bar, scan feedback without agent log"
```

---

### Task 10: BloggerSidebar — hover 四操作 + 停用

**Files:**
- Modify: `src/app/settings/douyin/BloggerSidebar.tsx`
- Modify: `src/app/settings/douyin/page.tsx` — 传入 onProfile / onToggleDisabled

**Interfaces:**
- Props 扩展：`onScan`、`onUpdateProfile`、`onToggleDisabled`、`onDelete`、`onAdd`
- 图标：扫描 | 资料 | 停用/启用 | 删除

- [ ] **Step 1: 重写侧栏操作区**

要点：

1. 根包一层 `<TooltipProvider delay={0}>`  
2. 操作容器：`className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"`（**不要** `hidden`）  
3. 每个操作：

```tsx
<Tooltip>
  <TooltipTrigger
    render={
      <button
        type="button"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-accent"
        onClick={(e) => {
          e.stopPropagation();
          onScan(b);
        }}
      />
    }
  >
    <Radio className="h-3 w-3" />
  </TooltipTrigger>
  <TooltipContent>扫描新作品</TooltipContent>
</Tooltip>
```

资料用 `UserRound`/`RefreshCw`，停用用 `Ban`/`Check`，删除用 `Trash2`。

4. 停用行：`opacity-60` + 昵称旁小字「已停用」  
5. `onUpdateProfile(b)` → page 调 `POST .../update-profile`  
6. `onToggleDisabled(b)` → page 调 `PATCH ...` body `{ disabled: b.disabled === 0 }` 成功后 `fetchBloggers`

- [ ] **Step 2: page 接线**

```typescript
const handleUpdateProfile = async (blogger: DouyinBlogger) => {
  try {
    const res = await fetch(`/api/douyin/bloggers/${blogger.slug}/update-profile`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showMessage(`已更新「${blogger.nickname}」资料`, "success", { agentLog: false });
      fetchBloggers();
    } else {
      showMessage(data.error || "更新资料失败", "error");
    }
  } catch {
    showMessage("更新资料请求失败", "error");
  }
};

const handleToggleDisabled = async (blogger: DouyinBlogger) => {
  const next = blogger.disabled === 0;
  try {
    const res = await fetch(`/api/douyin/bloggers/${blogger.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: next }),
    });
    if (res.ok) {
      showMessage(next ? `已停用「${blogger.nickname}」` : `已启用「${blogger.nickname}」`, "success", { agentLog: false });
      fetchBloggers();
    } else {
      showMessage("切换停用状态失败", "error");
    }
  } catch {
    showMessage("切换停用状态失败", "error");
  }
};
```

- [ ] **Step 3: 手工核对清单（写入 PR 描述即可）**

- hover 出现四图标，tooltip 可见  
- 点击扫描：banner 有新增条数，选中时表格刷新，**无** Agent 日志链  
- 停用后行样式变化；工具条全部扫描不再包含该博主  

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/douyin/BloggerSidebar.tsx src/app/settings/douyin/page.tsx
git commit -m "fix(ops): sidebar hover actions and blogger disable toggle"
```

---

### Task 11: WorksTable 勾选 + 批量三动作

**Files:**
- Modify: `src/app/settings/douyin/WorksTable.tsx`
- Modify: `src/app/settings/douyin/WorkRow.tsx` — 首列 checkbox（或在 Table 层渲染）

**Interfaces:**
- 选择：`Set<number>`；切换博主清空；翻页保留  
- 批量条：转写 / 观点 / 评判 → `POST /api/douyin/works/batch`

- [ ] **Step 1: 状态与表头**

```typescript
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

// blogger 变化时清空
useEffect(() => {
  setSelectedIds(new Set());
}, [bloggerSlug]);

const pageIds = data?.works.map((w) => w.id) ?? [];
const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

const toggleOne = (id: number) => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};

const togglePage = () => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (allPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    return next;
  });
};
```

表头第一列：

```tsx
<th className="w-8 pl-2">
  <input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="全选本页" />
</th>
```

- [ ] **Step 2: WorkRow 增加 checkbox 列**

Props：`selected: boolean; onToggleSelect: () => void`  
首列：

```tsx
<td className="py-2 pl-2">
  <input type="checkbox" checked={selected} onChange={onToggleSelect} aria-label="选择作品" />
</td>
```

`colSpan` 空态改为 9。

- [ ] **Step 3: 批量条与 handler**

```tsx
{selectedIds.size > 0 && (
  <div className="flex items-center gap-2 px-4 py-2 border-b text-sm bg-muted/30 shrink-0">
    <span>已选 {selectedIds.size} 项</span>
    <Button size="sm" variant="outline" onClick={() => batch("transcribe")}>批量转写</Button>
    <Button size="sm" variant="outline" onClick={() => batch("summarize")}>批量提取观点</Button>
    <Button size="sm" variant="outline" onClick={() => batch("evaluate")}>批量评判</Button>
  </div>
)}
```

```typescript
const batch = async (action: "transcribe" | "summarize" | "evaluate") => {
  const workIds = Array.from(selectedIds);
  try {
    const res = await fetch("/api/douyin/works/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workIds, action }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      onMessage(
        `批量完成：成功 ${body.succeeded}/${body.total}` +
          (body.failed ? `，失败 ${body.failed}` : ""),
        body.failed ? "error" : "success"
      );
      // 成功类动作可让 page 用 agentLog；此处 onMessage 签名若无 opts，由 page 包装
      setSelectedIds(new Set());
      fetchWorks(page);
    } else {
      onMessage(body.error || "批量失败", "error");
    }
  } catch {
    onMessage("批量请求失败", "error");
  }
};
```

扩展 `onMessage` 为 `(text, type, opts?)` 与 page 一致；批量 transcribe/summarize/evaluate 时 `agentLog: true`。

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/douyin/WorksTable.tsx src/app/settings/douyin/WorkRow.tsx
git commit -m "feat(ops): works table selection and batch transcribe/summarize/evaluate"
```

---

### Task 12: 调度 Tab UI

**Files:**
- Modify: `src/app/settings/layout.tsx` — 增加 Tab  
- Create: `src/app/settings/schedule/page.tsx`

**Interfaces:**
- 读 `GET /api/settings/schedules`  
- 改 `PUT /api/settings/schedules`  
- 立即运行 `POST /api/settings/schedules/run`

- [ ] **Step 1: layout Tab**

```typescript
const TABS = [
  { label: "基础设置", href: "/settings" },
  { label: "抖音雷达", href: "/settings/douyin" },
  { label: "调度", href: "/settings/schedule" },
  { label: "Skills", href: "/settings/skills" },
];
```

注意：`pathname === tab.href` 对嵌套路径；`/settings` 不要误匹配子路径——现有实现已是精确相等，OK。

- [ ] **Step 2: schedule page**

客户端页面结构：

1. 页头说明：单实例进程内调度；多副本勿开。  
2. `useEffect` 拉 jobs  
3. 每 job 一张 `Card`：  
   - 标题 + description  
   - Switch/checkbox enabled → PUT `{ id, enabled }`  
   - cron `<input>` + 预设按钮（按 job 给 2–3 个）  
   - 显示 `nextRun`、`lastRunAt`（格式化为本地时间）、`lastError`（若有，danger 色）  
   - 「保存」PUT `{ id, cron }`（或 onBlur 保存）  
   - 「立即运行」POST run，disabled when loading  

预设示例：

```typescript
const PRESETS: Record<string, Array<{ label: string; cron: string }>> = {
  profile: [
    { label: "每日 08:00", cron: "0 8 * * *" },
    { label: "工作日 08:00", cron: "0 8 * * 1-5" },
  ],
  scan: [
    { label: "每日 08:30", cron: "30 8 * * *" },
    { label: "每 6 小时", cron: "0 */6 * * *" },
  ],
  pipeline: [
    { label: "每 15 分钟", cron: "*/15 * * * *" },
    { label: "每 5 分钟", cron: "*/5 * * * *" },
  ],
  eval: [
    { label: "工作日收盘后", cron: "5 17 * * 1-5" },
    { label: "每日收盘后", cron: "5 17 * * *" },
  ],
};
```

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/layout.tsx src/app/settings/schedule/
git commit -m "feat(settings): schedule tab for four JobScheduler jobs"
```

---

### Task 13: 迁移测试 + 全量回归 + 收尾

**Files:**
- Create: `tests/migrate-eval-keys.test.ts`（若可注入 settings；否则用 memory 测纯函数——可将 migrate 改为接受 get/set/delete 依赖以便测）

**可选改造（推荐，便于测）：**

```typescript
export async function migrateEvalScheduleKeys(deps = {
  getSetting,
  setSetting,
  deleteSetting,
}): Promise<void> { /* 用 deps */ }
```

- [ ] **Step 1: 迁移单测**

```typescript
it("旧键写入新键后删除旧键；新键已存在则只删旧键", async () => {
  const map = new Map<string, string>([
    ["eval_schedule_cron", "5 17 * * 1-5"],
    ["schedule.eval.cron", "0 18 * * 1-5"], // 已有新键
  ]);
  await migrateEvalScheduleKeys({
    getSetting: async (k) => map.get(k) ?? null,
    setSetting: async (k, v) => { map.set(k, v); },
    deleteSetting: async (k) => { map.delete(k); },
  });
  expect(map.get("schedule.eval.cron")).toBe("0 18 * * 1-5");
  expect(map.has("eval_schedule_cron")).toBe(false);
});
```

- [ ] **Step 2: 全量测试**

Run: `pnpm test`  
Expected: 全部 PASS

- [ ] **Step 3: 手工验收清单**

| # | 步骤 | 期望 |
|---|------|------|
| 1 | 侧栏 hover | 四图标 + tooltip |
| 2 | 扫描单博主 | 新增 N 条、表刷新、无 Agent 日志链 |
| 3 | 停用博主 | 样式变化；工具条扫描跳过；`/douyin` 不显示 |
| 4 | 勾选批量评判 | 入队成功、状态变 processing |
| 5 | 调度 Tab 改 cron 保存 | GET 回显；nextRun 更新 |
| 6 | 立即运行 pipeline | 返回 summary；有 pending 则开始转写 |
| 7 | 旧 eval-schedule URL | 404 |
| 8 | 重启 dev 后 | scheduler 仍 tick（ensure 被调用） |

- [ ] **Step 4: 最终 commit（若有测试/文档修补）**

```bash
git add tests/ src/
git commit -m "test: eval key migration and ops console regression coverage"
```

---

## Spec coverage checklist

| Spec 项 | Task |
|---------|------|
| `bloggers.disabled` | 1, 2 |
| listEnabled / 工具条只启用 | 2, 3, 9 |
| scanAll 跳过停用 | 3 |
| JobScheduler 内核 + 失败写 last_run/error | 4 |
| 四 job handlers + 默认 cron | 5 |
| ensureSchedulerStarted | 5, 7 |
| 拆 eval-runner cron | 6 |
| 删 eval-schedule API + 旧键迁移删除 | 5, 6, 13 |
| schedules GET/PUT/run | 7 |
| batch evaluate | 8 |
| PATCH disabled + 前台隐藏 | 8 |
| 运维工具条 / 状态条 / 消息分流 | 9 |
| 侧栏四操作 + 扫描反馈 | 10 |
| 勾选 + 批量三动作 | 11 |
| 调度 Tab | 12 |
| 单实例声明（UI 文案） | 12 |
| 手动仍可操作停用博主 | 10（scan/profile 不拦） |
| 停用作品仍可 eval | 5 eval handler 不过滤 |

## Placeholder scan

无 TBD/TODO；关键签名与代码块已给出。

## Type consistency

- `ScheduleJobId` = `"profile" | "scan" | "pipeline" | "eval"`  
- settings 键：`schedule.${id}.enabled|cron|last_run_at|last_error`  
- batch action：`"transcribe" | "summarize" | "evaluate"`  
- `disabled`：DB integer 0/1；API boolean  

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-19-douyin-ops-console-scheduler-plan.md`.

**Two execution options:**

1. **Subagent-Driven（推荐）** — 每任务新开 subagent，任务间审查，迭代快  
2. **Inline Execution** — 本会话按 executing-plans 批量推进并设检查点  

Which approach?