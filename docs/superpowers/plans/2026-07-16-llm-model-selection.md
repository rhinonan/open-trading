# LLM 模型动态选择 + 设置页拆分 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 设置页可从 newapi 实时拉取模型列表，按流程（观点提取/收盘评判）分别选择 LLM 模型并持久化到 SQLite；同时把设置 UI 拆分为「基础设置」和「抖音雷达」两个页签页面。

**Architecture:** 新增通用 `settings` key-value 表（drizzle + better-sqlite3），`settings-service` 提供读写与 `getLlmModel(flow)` 兜底；两条 API 路由分别代理 newapi `/v1/models` 和读写模型设置；设置页通过 `layout.tsx` 页签导航拆为 `/settings`（主题 + LLM 模型）与 `/settings/douyin`（博主管理）。

**Tech Stack:** Next.js 16.2.10 App Router、drizzle-orm/better-sqlite3、@anthropic-ai/sdk（经 newapi 协议转换，不更换）、Tailwind 4 + shadcn 风格组件。

**Spec:** `docs/superpowers/specs/2026-07-16-llm-model-selection-design.md`

## Global Constraints

- **本项目 Next.js 为 16.2.10，有 breaking changes**：写任何 Next.js 相关代码前先读 `node_modules/next/dist/docs/01-app/01-getting-started/` 下对应指南（route handlers 见 `15-route-handlers.md`，layout 见 `03-layouts-and-pages.md`）。本计划中的代码已按该版本文档核对。
- 项目**没有测试框架**，不新增。每个任务的验证方式为：`npx tsc --noEmit` 通过 + `npm run lint` 通过 + 指定的手动/curl 冒烟步骤。
- 默认模型常量值必须是 `claude-sonnet-4-20250514`（与现有硬编码一致）。
- settings 表的 key：`llm_model_opinion`、`llm_model_evaluation`。
- 保留 `@anthropic-ai/sdk`，不换协议，不改 `callClaude` 签名。
- 中文 UI 文案、代码注释风格与现有文件保持一致。
- 数据库 schema 变更用 `npm run db:push` 应用（项目使用 drizzle-kit push 流程，数据库文件在 `data/douyin.db`）。

---

### Task 1: settings 表 + 服务层 + DEFAULT_LLM_MODEL 常量

**Files:**
- Modify: `src/db/schema.ts`（文件末尾追加表定义）
- Modify: `src/lib/llm.ts:33`（抽常量）
- Create: `src/services/settings-service.ts`

**Interfaces:**
- Consumes: `db`（`@/db`）、drizzle `eq`
- Produces（后续任务依赖，签名必须一致）:
  - `DEFAULT_LLM_MODEL: string`（从 `@/lib/llm` 导出，值 `"claude-sonnet-4-20250514"`）
  - `getSetting(key: string): Promise<string | null>`
  - `setSetting(key: string, value: string): Promise<void>`
  - `type LlmFlow = "opinion" | "evaluation"`
  - `LLM_MODEL_KEYS: Record<LlmFlow, string>`
  - `getLlmModel(flow: LlmFlow): Promise<string>`

- [ ] **Step 1: schema.ts 追加 settings 表**

在 `src/db/schema.ts` 文件末尾追加：

```ts
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});
```

- [ ] **Step 2: 应用 schema 变更**

Run: `npm run db:push`
Expected: 输出包含创建 `settings` 表，无报错。（drizzle-kit 如询问确认，选择创建新表。）

- [ ] **Step 3: llm.ts 抽出默认模型常量**

修改 `src/lib/llm.ts`：在 `import` 之后加常量导出，并替换第 33 行的硬编码。

```ts
export const DEFAULT_LLM_MODEL = "claude-sonnet-4-20250514";
```

第 33 行改为：

```ts
    model: options.model || DEFAULT_LLM_MODEL,
```

- [ ] **Step 4: 创建 settings-service**

创建 `src/services/settings-service.ts`：

```ts
// src/services/settings-service.ts
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_LLM_MODEL } from "@/lib/llm";

export async function getSetting(key: string): Promise<string | null> {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  db.insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: now },
    })
    .run();
}

export type LlmFlow = "opinion" | "evaluation";

export const LLM_MODEL_KEYS: Record<LlmFlow, string> = {
  opinion: "llm_model_opinion",
  evaluation: "llm_model_evaluation",
};

/** 读取某流程配置的 LLM 模型，未设置时返回默认模型 */
export async function getLlmModel(flow: LlmFlow): Promise<string> {
  const value = await getSetting(LLM_MODEL_KEYS[flow]);
  return value || DEFAULT_LLM_MODEL;
}
```

- [ ] **Step 5: 类型检查与 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误。

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/lib/llm.ts src/services/settings-service.ts
git commit -m "feat: settings key-value 表与 LLM 模型设置服务"
```

---

### Task 2: API 路由 — 模型列表代理 + 模型设置读写

**Files:**
- Create: `src/app/api/llm/models/route.ts`
- Create: `src/app/api/settings/llm/route.ts`

**Interfaces:**
- Consumes: `getLlmModel`、`setSetting`、`LLM_MODEL_KEYS`（来自 `@/services/settings-service`，签名见 Task 1）；env `NEWAPI_API_KEY` / `NEWAPI_BASE_URL`
- Produces（前端 Task 5 依赖的响应契约）:
  - `GET /api/llm/models` → 200 `{ models: string[] }`（已排序）；失败 → 502 `{ error: string }`；未配 key → 500 `{ error: string }`
  - `GET /api/settings/llm` → 200 `{ opinionModel: string, evaluationModel: string }`（含默认值兜底）
  - `PUT /api/settings/llm` body `{ opinionModel?: string, evaluationModel?: string }` → 200 返回更新后完整 `{ opinionModel, evaluationModel }`；字段非法 → 400 `{ error: string }`

- [ ] **Step 1: 创建模型列表代理路由**

创建 `src/app/api/llm/models/route.ts`：

```ts
// src/app/api/llm/models/route.ts

export async function GET() {
  const apiKey = process.env.NEWAPI_API_KEY;
  const baseUrl = process.env.NEWAPI_BASE_URL || "https://newapi.tdance.cc/v1";

  if (!apiKey) {
    return Response.json(
      { error: "NEWAPI_API_KEY 未配置" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    if (!res.ok) {
      return Response.json(
        { error: `newapi 返回 ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const models = (Array.isArray(data?.data) ? data.data : [])
      .map((m: { id?: unknown }) => m?.id)
      .filter((id: unknown): id is string => typeof id === "string")
      .sort((a: string, b: string) => a.localeCompare(b));

    return Response.json({ models });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "获取模型列表失败" },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 2: 创建模型设置读写路由**

创建 `src/app/api/settings/llm/route.ts`：

```ts
// src/app/api/settings/llm/route.ts
import {
  getLlmModel,
  setSetting,
  LLM_MODEL_KEYS,
} from "@/services/settings-service";

async function currentSettings() {
  const [opinionModel, evaluationModel] = await Promise.all([
    getLlmModel("opinion"),
    getLlmModel("evaluation"),
  ]);
  return { opinionModel, evaluationModel };
}

export async function GET() {
  try {
    return Response.json(await currentSettings());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body: { opinionModel?: unknown; evaluationModel?: unknown } =
      await request.json();

    for (const [field, value] of [
      ["opinionModel", body.opinionModel],
      ["evaluationModel", body.evaluationModel],
    ] as const) {
      if (
        value !== undefined &&
        (typeof value !== "string" || !value.trim())
      ) {
        return Response.json(
          { error: `${field} 必须是非空字符串` },
          { status: 400 }
        );
      }
    }

    if (typeof body.opinionModel === "string") {
      await setSetting(LLM_MODEL_KEYS.opinion, body.opinionModel.trim());
    }
    if (typeof body.evaluationModel === "string") {
      await setSetting(LLM_MODEL_KEYS.evaluation, body.evaluationModel.trim());
    }

    return Response.json(await currentSettings());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: 类型检查与 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误。

- [ ] **Step 4: curl 冒烟**

启动 dev server（若未启动）：`npm run dev`（后台），然后：

```bash
curl -s http://localhost:3000/api/settings/llm
```
Expected: `{"opinionModel":"claude-sonnet-4-20250514","evaluationModel":"claude-sonnet-4-20250514"}`（未设置时兜底默认值）

```bash
curl -s -X PUT http://localhost:3000/api/settings/llm -H "Content-Type: application/json" -d '{"opinionModel":"deepseek-v3"}'
```
Expected: `{"opinionModel":"deepseek-v3","evaluationModel":"claude-sonnet-4-20250514"}`

```bash
curl -s -X PUT http://localhost:3000/api/settings/llm -H "Content-Type: application/json" -d '{"opinionModel":""}'
```
Expected: 400，`{"error":"opinionModel 必须是非空字符串"}`

```bash
curl -s http://localhost:3000/api/llm/models
```
Expected: `{"models":[...]}`（需要 `.env` 里 `NEWAPI_API_KEY` 有效；列表按字母排序）

冒烟后把 opinionModel 改回默认值：

```bash
curl -s -X PUT http://localhost:3000/api/settings/llm -H "Content-Type: application/json" -d '{"opinionModel":"claude-sonnet-4-20250514"}'
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/llm/models/route.ts src/app/api/settings/llm/route.ts
git commit -m "feat: 模型列表代理与 LLM 模型设置 API"
```

---

### Task 3: 观点提取接线动态模型

**Files:**
- Modify: `src/services/douyin/opinion-service.ts:19-23`

**Interfaces:**
- Consumes: `getLlmModel("opinion")`（Task 1）
- Produces: 无新接口；`extractOpinion` 对外行为不变（失败仍返回空串）

- [ ] **Step 1: extractOpinion 传入动态模型**

修改 `src/services/douyin/opinion-service.ts`：顶部 import 增加一行：

```ts
import { getLlmModel } from "@/services/settings-service";
```

`try` 块内的调用改为：

```ts
    const model = await getLlmModel("opinion");
    const result = await callClaude(
      transcript.slice(0, 4000), // 限制输入长度
      SYSTEM_PROMPT,
      { model, maxTokens: 200, temperature: 0.3 }
    );
```

- [ ] **Step 2: 类型检查与 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误。

- [ ] **Step 3: Commit**

```bash
git add src/services/douyin/opinion-service.ts
git commit -m "feat: 观点提取使用设置中的 LLM 模型"
```

---

### Task 4: 设置页拆分为「基础设置」与「抖音雷达」

**Files:**
- Create: `src/app/settings/layout.tsx`
- Create: `src/app/settings/douyin/page.tsx`
- Modify: `src/app/settings/page.tsx`（整文件重写，见 Step 3）
- Modify: `src/components/layout/header.tsx:7-16`（面包屑映射）

**Interfaces:**
- Consumes: 现有 `/api/douyin/*` 路由、`Card/Button` 组件、`cn`（`@/lib/utils`）、`DouyinBlogger` 类型（`@/types`）
- Produces: 路由 `/settings`（基础设置）与 `/settings/douyin`（抖音雷达）；Task 5 将在 `/settings` 页里加 LLM 卡片

- [ ] **Step 1: 创建设置布局（页签导航）**

创建 `src/app/settings/layout.tsx`：

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "基础设置", href: "/settings" },
  { label: "抖音雷达", href: "/settings/douyin" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">设置</h1>
        <p className="text-muted-foreground mt-1">
          管理主题偏好、LLM 模型与抖音雷达配置
        </p>
      </div>

      {/* 页签导航 */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2 text-sm -mb-px border-b-2 transition-colors",
              pathname === tab.href
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
```

- [ ] **Step 2: 创建抖音雷达设置页**

创建 `src/app/settings/douyin/page.tsx`：内容为现有 `src/app/settings/page.tsx` 中抖音雷达部分的整体迁移（状态、handlers、卡片 JSX 原样搬运，删除页面标题和主题/占位卡片）。完整文件：

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Radio,
  RefreshCw,
  Mic,
  Loader2,
  Trash2,
  UserPlus,
  BarChart3,
} from "lucide-react";
import type { DouyinBlogger } from "@/types";

export default function DouyinSettingsPage() {
  const [bloggers, setBloggers] = useState<DouyinBlogger[]>([]);
  const [loading, setLoading] = useState(true);
  const [uidInput, setUidInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
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
        body: JSON.stringify({ douyinUid: uidInput.trim() }),
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

  const handleDelete = async (slug: string, nickname: string) => {
    if (!confirm(`确定要删除博主「${nickname}」吗？相关作品和评判记录将一并删除。`)) return;
    try {
      const res = await fetch(`/api/douyin/bloggers/${slug}`, { method: "DELETE" });
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
      if (res.ok) {
        setMessage(`扫描完成：检查了 ${data.total} 个博主，发现 ${data.totalNewWorks} 条新作品`);
      } else {
        setMessage(`扫描失败: ${data.error}`);
      }
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

  const handleEvaluate = async () => {
    setEvaluating(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/evaluate", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`评判完成：${data.totalBloggers} 个博主，共 ${data.totalPredictions} 条预测`);
      } else {
        setMessage(`评判失败: ${data.error}`);
      }
    } catch {
      setMessage("评判请求失败，请检查网络");
    }
    setEvaluating(false);
  };

  return (
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
                        {(blogger.followerCount ?? 0).toLocaleString()} 粉丝
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0"
                      onClick={() => handleDelete(blogger.slug, blogger.nickname)}
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
            <Button variant="outline" onClick={handleEvaluate} disabled={evaluating}>
              {evaluating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />}
              收盘评判
            </Button>
          </div>
        </div>

        {/* 反馈消息 */}
        {message && (
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">{message}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: 精简基础设置页**

重写 `src/app/settings/page.tsx`（移除抖音相关全部代码与页面标题，仅留主题卡片和占位卡片；Task 5 会在这里加 LLM 卡片）：

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Settings, Sun, Moon, Monitor } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
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

- [ ] **Step 4: 面包屑补充映射**

修改 `src/components/layout/header.tsx` 的 `BREADCRUMB_MAP`，在 `"/settings": "设置",` 之后加一行：

```ts
  "/settings/douyin": "抖音雷达",
```

- [ ] **Step 5: 类型检查、lint 与手动验证**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误。

手动（dev server）：
- 打开 `http://localhost:3000/settings` — 显示页签「基础设置/抖音雷达」，主题卡片正常，面包屑 `首页 / 设置`
- 点「抖音雷达」页签 → `/settings/douyin`，博主列表加载，面包屑 `首页 / 设置 / 抖音雷达`
- 抖音页上点「扫描全部博主」按钮，确认请求正常发出（响应可为已有行为）

- [ ] **Step 6: Commit**

```bash
git add src/app/settings/layout.tsx src/app/settings/douyin/page.tsx src/app/settings/page.tsx src/components/layout/header.tsx
git commit -m "feat: 设置页拆分为基础设置与抖音雷达两个页签"
```

---

### Task 5: 基础设置页 LLM 模型卡片

**Files:**
- Modify: `src/app/settings/page.tsx`（Task 4 Step 3 的版本上追加 LLM 卡片）

**Interfaces:**
- Consumes: `GET /api/llm/models` → `{ models: string[] }` / 非 2xx `{ error }`；`GET /api/settings/llm`、`PUT /api/settings/llm` → `{ opinionModel, evaluationModel }`（契约见 Task 2）
- Produces: 无新接口（纯 UI）

- [ ] **Step 1: 追加 LLM 模型卡片**

重写 `src/app/settings/page.tsx` 为以下完整内容（在主题卡片与占位卡片之间插入 LLM 卡片，含状态逻辑）：

```tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Settings, Sun, Moon, Monitor, Cpu, Loader2 } from "lucide-react";

interface LlmSettings {
  opinionModel: string;
  evaluationModel: string;
}

const MODEL_FIELDS: { field: keyof LlmSettings; label: string; hint: string }[] = [
  { field: "opinionModel", label: "观点提取模型", hint: "转写文本 → 一句话观点摘要" },
  { field: "evaluationModel", label: "收盘评判模型", hint: "预测 vs 实际行情评判（功能待启用）" },
];

export default function SettingsPage() {
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState("");
  const [llmSettings, setLlmSettings] = useState<LlmSettings | null>(null);
  const [llmLoading, setLlmLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [llmMessage, setLlmMessage] = useState("");

  useEffect(() => {
    (async () => {
      const [modelsResult, settingsResult] = await Promise.allSettled([
        fetch("/api/llm/models"),
        fetch("/api/settings/llm"),
      ]);

      if (modelsResult.status === "fulfilled" && modelsResult.value.ok) {
        const data = await modelsResult.value.json();
        setModels(data.models ?? []);
      } else {
        let msg = "无法获取模型列表";
        if (modelsResult.status === "fulfilled") {
          try {
            const data = await modelsResult.value.json();
            if (data.error) msg = `无法获取模型列表: ${data.error}`;
          } catch { /* 保留默认提示 */ }
        }
        setModelsError(msg);
      }

      if (settingsResult.status === "fulfilled" && settingsResult.value.ok) {
        setLlmSettings(await settingsResult.value.json());
      }
      setLlmLoading(false);
    })();
  }, []);

  const handleModelChange = async (field: keyof LlmSettings, value: string) => {
    if (!llmSettings || value === llmSettings[field]) return;
    setSaving(true);
    setLlmMessage("");
    try {
      const res = await fetch("/api/settings/llm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (res.ok) {
        setLlmSettings(data);
        setLlmMessage(`已保存：${value}`);
      } else {
        setLlmMessage(`保存失败: ${data.error}`);
      }
    } catch {
      setLlmMessage("保存失败，请检查网络");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
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

      {/* LLM 模型设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            LLM 模型
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {llmLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
            </p>
          ) : (
            <>
              {MODEL_FIELDS.map(({ field, label, hint }) => (
                <div key={field} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                  {modelsError || models.length === 0 ? (
                    <span className="text-sm text-muted-foreground font-mono">
                      {llmSettings?.[field] ?? "-"}
                    </span>
                  ) : (
                    <select
                      value={llmSettings?.[field] ?? ""}
                      disabled={saving}
                      onChange={(e) => handleModelChange(field, e.target.value)}
                      className="max-w-[280px] rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {/* 已保存模型不在列表中时也要可见 */}
                      {llmSettings && !models.includes(llmSettings[field]) && (
                        <option value={llmSettings[field]}>{llmSettings[field]}</option>
                      )}
                      {models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
              {modelsError && (
                <p className="text-sm text-red-500 bg-muted/50 rounded-md p-3">{modelsError}</p>
              )}
              {llmMessage && (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">{llmMessage}</p>
              )}
            </>
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

- [ ] **Step 2: 类型检查、lint 与手动验证**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误。

手动（dev server）：
- 打开 `/settings`：LLM 卡片显示两个下拉框，列表来自 newapi
- 切换「观点提取模型」为另一个模型 → 显示「已保存：<模型名>」；刷新页面后选择保留
- 临时把 `.env` 里 `NEWAPI_BASE_URL` 改成无效地址并重启 dev server → 下拉降级为文本显示已保存模型 + 红色错误提示；改回后恢复

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: 基础设置页 LLM 模型选择卡片"
```

---

### Task 6: 整体验证

**Files:** 无新增/修改（纯验证）

- [ ] **Step 1: 构建验证**

Run: `npm run build`
Expected: 构建成功，无类型/lint 错误。

- [ ] **Step 2: 端到端冒烟**

dev 或 start 模式下：

1. `/settings` 切换观点提取模型为一个非默认模型（如 `deepseek-v3`，以实际列表为准）
2. `/settings/douyin` 点「开始转写」（需存在待转写作品；没有可先「扫描全部博主」）
3. 在 newapi 后台日志确认本次 `/v1/messages` 调用使用的是第 1 步选的模型
4. 把模型切回原值

Expected: 转写产生的观点摘要正常写入，newapi 日志显示的模型与设置一致。

- [ ] **Step 3: 收尾**

确认 `git status` 干净（全部已提交）、任务列表全部勾选。
