# 双形态预留：架构纪律落地 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为未来的桌面（Electron）/ SaaS 双形态改造立规矩并完成三件零风险的"不关门"改造：纪律写入 CLAUDE.md、落盘路径收敛到 `dataPath()` 单点、表行类型改为 drizzle `$inferSelect` 派生（消除技术债 #4 的断言部分）。

**Architecture:** 不做任何形态改造本身——只消除"每写一行新代码就加深单形态耦合"的三个源头：散落的 `process.cwd()` 路径、手写行类型 + `as` 断言、无处可查的口头约定。全部改动行为等价，靠现有 vitest 套件 + `tsc --noEmit` 验证。

**Tech Stack:** Next.js 16 / TypeScript 5 / drizzle-orm (better-sqlite3) / vitest 4

## Global Constraints

- Node >= 22.13.0；测试命令 `npm test`（= `vitest run`），测试文件放 `tests/`
- 代码注释使用中文（与现有代码一致）
- 不新增任何依赖
- `src/types/index.ts` 被客户端组件 import，从 `@/db/schema` 取类型**必须用 `import type`**（schema 含运行时代码，值导入会进客户端 bundle）
- 工作区有其他未提交改动（globals.css、layout.tsx 等）——每次 commit 只 `git add` 本任务列出的文件，**禁止 `git add -A`**
- 行为等价改造：`DATA_ROOT` 未设置时所有路径与现状完全一致

---

### Task 1: CLAUDE.md 写入架构纪律

**Files:**
- Modify: `CLAUDE.md`（在 `## 已知技术债` 小节之前插入新小节）

**Interfaces:**
- Consumes: 无
- Produces: 纪律条文；Task 2 产出的 `src/lib/data-root.ts` 与 `dataPath()` 名称在条文中被引用，Task 2 必须使用完全相同的路径与函数名

- [ ] **Step 1: 在 `## 已知技术债（2026-07 架构评审）` 标题行之前插入以下小节**

```markdown
## 架构纪律（桌面/SaaS 双形态预留，2026-07 约定）

以下规矩约束**新增代码**（存量不强制回改），目的是让未来的双形态改造只需要动适配层：

1. **DB 调用一律写 `await`**：即使 better-sqlite3 驱动是同步的，调用处也写 `await db...`（无害），保证将来换异步驱动（libsql / Postgres）时调用面零改动。
2. **落盘路径一律走 `dataPath()`**（`src/lib/data-root.ts`）：禁止新增 `process.cwd()` 拼 `data/` 路径；数据目录整体位置只由 `DATA_ROOT` 环境变量决定（桌面端将指向 userData 目录）。
3. **新外部服务的密钥/配置进 settings 表**（经 settings-service 读写），不新增 env-only 读取；env 只作为部署级默认值。
4. **业务层不感知部署形态**：形态差异（DB 驱动、密钥来源、runner 驱动、数据路径）只允许出现在适配层；业务代码禁止出现 `if (isDesktop)` 之类分支。
5. **表行类型从 schema 派生**：一律 `typeof <table>.$inferSelect`，禁止手写 interface 再用 `as` 断言。

```

- [ ] **Step 2: 检查插入位置与格式**

Run: `grep -n "架构纪律\|已知技术债" CLAUDE.md`
Expected: `架构纪律` 行号小于 `已知技术债` 行号，两小节之间空一行。

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add dual-form architecture disciplines to CLAUDE.md"
```

---

### Task 2: `dataPath()` 数据根目录单点 + 迁移全部 7 个落盘路径调用点

**Files:**
- Create: `src/lib/data-root.ts`
- Test: `tests/data-root.test.ts`
- Modify: `src/db/index.ts:4-6`
- Modify: `src/lib/douyin-api.ts:8`
- Modify: `src/mastra/index.ts:10-11`
- Modify: `src/mastra/agents/evaluator-agent.ts:24`
- Modify: `src/services/douyin/audio-extractor.ts:6`
- Modify: `src/services/douyin/video-downloader.ts:6`
- Modify: `src/services/skills-service.ts:7`

**Interfaces:**
- Consumes: 无
- Produces: `getDataRoot(): string` 与 `dataPath(...segments: string[]): string`，从 `@/lib/data-root` 导出。CLAUDE.md 纪律第 2 条引用此模块，名称不可改。

**注意**：所有调用点都是模块顶层常量（import 时求值），所以 `DATA_ROOT` 必须在进程启动前就位（Next 的 .env 加载满足此时机）——与现状 `process.cwd()` 的求值时机语义一致，无行为变化。

- [ ] **Step 1: Write the failing test**

创建 `tests/data-root.test.ts`：

```typescript
// tests/data-root.test.ts
// dataPath 单点：默认 <cwd>/data，可被 DATA_ROOT 环境变量整体重定向。
import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import { getDataRoot, dataPath } from "@/lib/data-root";

const ORIGINAL = process.env.DATA_ROOT;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DATA_ROOT;
  else process.env.DATA_ROOT = ORIGINAL;
});

describe("data-root", () => {
  it("默认返回 <cwd>/data", () => {
    delete process.env.DATA_ROOT;
    expect(getDataRoot()).toBe(path.join(process.cwd(), "data"));
  });

  it("DATA_ROOT 环境变量可整体重定向（每次调用时读取，非模块加载时冻结）", () => {
    process.env.DATA_ROOT = path.join("D:", "elsewhere");
    expect(getDataRoot()).toBe(path.join("D:", "elsewhere"));
    expect(dataPath("douyin.db")).toBe(path.join("D:", "elsewhere", "douyin.db"));
  });

  it("dataPath 在根目录下拼接多级子路径", () => {
    delete process.env.DATA_ROOT;
    expect(dataPath("api-cache")).toBe(
      path.join(process.cwd(), "data", "api-cache")
    );
    expect(dataPath("workspace", "evaluator")).toBe(
      path.join(process.cwd(), "data", "workspace", "evaluator")
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data-root.test.ts`
Expected: FAIL，报错含 `Cannot find module '@/lib/data-root'`（或等价的解析失败）。

- [ ] **Step 3: Write minimal implementation**

创建 `src/lib/data-root.ts`：

```typescript
// src/lib/data-root.ts
// 数据根目录单点：所有落盘路径（业务库、缓存、音视频、workspace、skills）统一从这里取。
// 桌面端/容器部署只需设置 DATA_ROOT 环境变量即可整体迁移数据目录。
// 注意：每次调用时读 env（而非模块加载时冻结），便于测试与运行时诊断。
import path from "path";

export function getDataRoot(): string {
  return process.env.DATA_ROOT || path.join(process.cwd(), "data");
}

/** 拼出 data 根目录下的子路径，如 dataPath("api-cache")、dataPath("workspace", "evaluator") */
export function dataPath(...segments: string[]): string {
  return path.join(getDataRoot(), ...segments);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/data-root.test.ts`
Expected: PASS（3 个用例全绿）。

- [ ] **Step 5: 迁移 7 个调用点**

`src/db/index.ts` —— 替换 import 与常量（`path` import 不再需要，删除）：

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { dataPath } from "@/lib/data-root";

const DB_PATH = dataPath("douyin.db");
```

`src/lib/douyin-api.ts:8` —— 替换常量（文件顶部补 `import { dataPath } from "@/lib/data-root";`；原 `path` import 若文件内其他处仍在用则保留，若 ESLint 报 unused 则删除）：

```typescript
const CACHE_DIR = dataPath("api-cache");
```

`src/mastra/index.ts:10-11` —— 替换 storageUrl（补 `import { dataPath } from "@/lib/data-root";`，删除不再使用的 `import path from "path";`；保留原注释）：

```typescript
// 绝对路径 + 正斜杠：与业务库 data/douyin.db 分离，
// 避免多进程相对路径解析不一致（Windows 反斜杠在 file: URL 中无效）
const storageUrl = "file:" + dataPath("mastra.db").replace(/\\/g, "/");
```

`src/mastra/agents/evaluator-agent.ts:24` —— 替换（补 import，同上处理 `path`）：

```typescript
const workspaceDir = dataPath("workspace", "evaluator");
```

`src/services/douyin/audio-extractor.ts:6` —— 替换（补 import）：

```typescript
const AUDIO_DIR = dataPath("audio");
```

`src/services/douyin/video-downloader.ts:6` —— 替换（补 import）：

```typescript
const VIDEOS_DIR = dataPath("videos");
```

`src/services/skills-service.ts:7` —— 替换（补 import）：

```typescript
const SKILLS_DIR = dataPath("skills");
```

- [ ] **Step 6: 确认没有漏网的调用点**

Run: `grep -rn "process.cwd()" src/ --include="*.ts" --include="*.tsx"`
Expected: 只剩 `src/lib/data-root.ts` 一处（getDataRoot 内部）。若还有其他行，回到 Step 5 补迁移。

- [ ] **Step 7: 全量验证（行为等价）**

Run: `npm test`
Expected: 全部 PASS（既有 pipeline/eval 队列测试不受影响）。

Run: `npx tsc --noEmit`
Expected: 无错误。

Run: `npm run lint`
Expected: 无新增错误（重点看 unused import）。

- [ ] **Step 8: Commit**

```bash
git add src/lib/data-root.ts tests/data-root.test.ts src/db/index.ts src/lib/douyin-api.ts src/mastra/index.ts src/mastra/agents/evaluator-agent.ts src/services/douyin/audio-extractor.ts src/services/douyin/video-downloader.ts src/services/skills-service.ts
git commit -m "feat: add dataPath() single point for on-disk paths, honor DATA_ROOT"
```

---

### Task 3: 表行类型改为 `$inferSelect` 派生，删除全部 `as` 断言（技术债 #4）

**Files:**
- Modify: `src/types/index.ts:114-184`（抖音博主监控小节）
- Modify: `src/services/douyin/blogger-service.ts`（5 处断言）
- Modify: `src/services/douyin/scanner-service.ts:19`（1 处断言）
- Modify: `src/app/api/douyin/records/route.ts`（3 处断言）
- Modify: `CLAUDE.md`（技术债条目 4 收窄）

**Interfaces:**
- Consumes: `src/db/schema.ts` 的 `bloggers` / `works` / `predictionItems` 表定义（本任务不改 schema）
- Produces: `DouyinBlogger` / `DouyinWork` / `PredictionItem` / `TranscriptStatus` / `JudgmentResult` 类型仍从 `@/types` 导出，**名称与现有一致**——全部前端组件（`app/douyin/[slug]/page.tsx`、`app/settings/douyin/*` 等）的 import 无需改动。派生后 `DouyinWork` 会新增 `claimedAt` / `evalStatus` / `evalClaimedAt` / `evaluatedAt` 字段（超集，消费端只读不构造，安全）。

**说明**：类型重构无法先写失败测试，本任务的"测试"是 `tsc --noEmit` + 现有 vitest 套件——断言删除后如果 drizzle 推导与使用处不匹配，编译器会报。

- [ ] **Step 1: 重写 `src/types/index.ts` 的行类型定义**

在文件**最顶部**（第 1 行之前）加入（ESLint import/first 要求 import 在最前）：

```typescript
import type { bloggers, works, predictionItems } from "@/db/schema";
```

将 `// ==================== 抖音博主监控 ====================` 小节内的 `JudgmentResult`、`TranscriptStatus`、`DouyinBlogger`、`DouyinWork`、`PredictionItem` 五个定义（原 116-137 行的 type/interface 与 145-160、173-184 行）替换为：

```typescript
// 行类型一律从 drizzle schema 派生（$inferSelect），杜绝手写类型与 schema 漂移。
// 注意：上方必须是 import type —— schema 模块含运行时代码，值导入会进客户端 bundle。
export type DouyinBlogger = typeof bloggers.$inferSelect;
export type DouyinWork = typeof works.$inferSelect;
export type PredictionItem = typeof predictionItems.$inferSelect;

export type TranscriptStatus = DouyinWork["transcriptStatus"];
export type JudgmentResult = PredictionItem["judgment"];

export type SortDimension = "followers" | "recent" | "accuracy";
```

保留 `DouyinBloggerWithOpinion`（`interface ... extends DouyinBlogger` 可以 extends 类型别名，不用动）、`WorkJudgment`、`MarketSnapshot` 及其后的所有定义不变。

- [ ] **Step 2: 验证派生类型与原手写类型字段等价**

Run: `npx tsc --noEmit`
Expected: 无错误。若报错，逐条核对——派生类型的字段名/可空性以 schema 为准（schema 才是事实源），使用处随之修正。

- [ ] **Step 3: 删除 `blogger-service.ts` 的 5 处断言**

`src/services/douyin/blogger-service.ts` 对应位置改为：

```typescript
export async function listBloggers(): Promise<DouyinBlogger[]> {
  return db
    .select()
    .from(bloggers)
    .orderBy(desc(bloggers.followerCount))
    .all();
}

export async function getBloggerBySlug(
  slug: string
): Promise<DouyinBlogger | null> {
  const result = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.slug, slug))
    .get();
  return result ?? null;
}
```

`addBlogger` 中（原 55-68 行）：

```typescript
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
    .get();

  return blogger;
```

`updateBloggerProfile` 中（原 78-110 行的两处断言）：

```typescript
  const blogger = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.slug, slug))
    .get();
  if (!blogger) throw new Error(`博主 ${slug} 不存在`);
```

```typescript
  const updated = db
    .update(bloggers)
    .set({
      nickname: profile.nickname || "",
      avatarUrl: avatar,
      signature: profile.signature || "",
      followerCount: profile.follower_count || 0,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(bloggers.slug, slug))
    .returning()
    .get();
  if (!updated) throw new Error(`博主 ${slug} 更新失败`);

  return updated;
```

（若 `tsc` 认为 `.returning().get()` 返回非可空、`if (!updated)` 属多余分支，保留该守卫也无害且合法，不必纠结。）

- [ ] **Step 4: 删除 `scanner-service.ts:19` 断言**

```typescript
  const allBloggers = db.select().from(bloggers).all();
```

（`import type { DouyinBlogger } from "@/types";` 保留——`scanBlogger` 签名仍在用。）

- [ ] **Step 5: 删除 `records/route.ts` 的 3 处断言**

`src/app/api/douyin/records/route.ts` 三处 `.all() as PredictionItem[]` 一律改为 `.all()`；`let items: PredictionItem[];` 声明与 `import type { PredictionItem }` 保留（现在类型天然吻合）。

- [ ] **Step 6: 全量验证**

Run: `grep -rn "as DouyinBlogger\|as DouyinWork\|as PredictionItem" src/`
Expected: 无输出。

Run: `npx tsc --noEmit`
Expected: 无错误。

Run: `npm test`
Expected: 全部 PASS。

Run: `npm run lint`
Expected: 无新增错误。

- [ ] **Step 7: 收窄 CLAUDE.md 技术债条目 4**

将 `CLAUDE.md` 中条目：

```markdown
4. **类型断言绕过 Drizzle 推导**：`as DouyinBlogger[]` 等手写类型与 schema 会漂移，应改用 `$inferSelect` 派生；JSON 文本字段（`statistics` 等）建议在 service 边界加 zod 解析。
```

替换为：

```markdown
4. **JSON 文本字段缺乏解析**：`statistics`、`evidence`、`relatedSymbols` 等 JSON 文本字段建议在 service 边界加 zod 解析（原类型断言问题已于 2026-07 修复：行类型改为 `$inferSelect` 派生）。
```

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/services/douyin/blogger-service.ts src/services/douyin/scanner-service.ts src/app/api/douyin/records/route.ts CLAUDE.md
git commit -m "refactor: derive row types from drizzle schema, drop as-casts (tech debt #4)"
```

---

## Non-Goals（明确不做，防止范围蔓延）

- 不做异步驱动/libsql 迁移、不做 Postgres、不加 tenantId——那是触发器到达后的内核改造
- 不给 JSON 文本字段加 zod 解析（保留为收窄后的技术债条目 4）
- 不回改存量 DB 调用为 `await`（纪律只约束新增代码）
- 不动 Electron / monorepo / 打包相关的任何东西
