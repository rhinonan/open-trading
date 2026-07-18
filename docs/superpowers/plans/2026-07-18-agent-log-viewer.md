# Agent 日志查看器 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为所有 Mastra Agent 调用提供只读日志查看页面——列表 + 对话回放详情

**Architecture:** 开启 Mastra 内置 `@mastra/observability` + `MastraStorageExporter`，agent 调用自动落库 `mastra_ai_spans`；新增 API route 查询 LibSQLStore 的 observability domain；前端新增 `/agents/logs` 页面，列表用精简表格，详情用 ai-elements 对话组件渲染

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, @mastra/observability@^1.16, ai-elements (Conversation/Message/MessageContent/MessageResponse), Streamdown

## Global Constraints

- 所有 DB 调用写 `await`（即使 better-sqlite3 是同步的）
- 落盘路径走 `dataPath()`（`src/lib/data-root.ts`）
- 不新增 env-only 读取，配置走 settings 表
- 表行类型从 schema 派生（`typeof table.$inferSelect`）
- Node >= 22.13.0
- `@mastra/observability` 版本需与 `@mastra/core@^1.51.0` 兼容（目标 1.16.x）

---

## 文件结构

```
Create:
  src/app/api/agents/logs/route.ts        — GET 日志列表（分页 + 筛选）
  src/app/api/agents/logs/[traceId]/route.ts — GET 单条 trace 详情
  src/app/agents/logs/page.tsx             — 日志页面（列表 + 详情面板）
  src/components/agents/agent-log-list.tsx — 日志列表表格组件
  src/components/agents/agent-log-detail.tsx — 日志详情对话回放组件
  src/hooks/use-agent-logs.ts             — 日志数据获取 hook

Modify:
  src/mastra/index.ts                      — 添加 observability 配置
  src/components/layout/sidebar.tsx        — 添加 "Agent 日志" 导航项
```

---

### Task 1: 安装 @mastra/observability 并开启可观测性

**Files:**
- Modify: `src/mastra/index.ts:1-24`
- Modify: `package.json`（npm install）

**Interfaces:**
- Produces: `mastra` 实例配置 observability，agent 调用自动写入 `mastra_ai_spans` 表

- [ ] **Step 1: 安装依赖**

```bash
npm install @mastra/observability@^1.16.1
```

Expected: 安装成功，`package.json` 新增 `@mastra/observability` 依赖

- [ ] **Step 2: 修改 src/mastra/index.ts 开启 observability**

在文件顶部导入：

```ts
import { Observability, MastraStorageExporter } from "@mastra/observability";
```

在 Mastra 构造函数的配置对象中添加 `observability` 字段。当前 `src/mastra/index.ts` 内容：

```ts
// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { Observability, MastraStorageExporter } from "@mastra/observability";
import { opinionAgent } from "@/mastra/agents/opinion-agent";
import { evaluatorAgent } from "@/mastra/agents/evaluator-agent";
import { skillReviewerAgent } from "@/mastra/agents/skill-reviewer-agent";
import { transcribeWorkWorkflow } from "@/mastra/workflows/transcribe-work-workflow";
import { evaluateWorkWorkflow } from "@/mastra/workflows/evaluate-work-workflow";
import { skillReviewWorkflow } from "@/mastra/workflows/skill-review-workflow";
import { dataPath } from "@/lib/data-root";

const storageUrl =
  "file:" + dataPath("mastra.db").replace(/\\/g, "/");

export const mastra = new Mastra({
  agents: { opinionAgent, evaluatorAgent, skillReviewerAgent },
  workflows: { transcribeWorkWorkflow, evaluateWorkWorkflow, skillReviewWorkflow },
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: storageUrl,
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "open-trading",
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
});
```

- [ ] **Step 3: 验证 dev server 正常启动**

```bash
npm run dev
```

打开 `http://localhost:3000`，确认无报错，页面正常渲染。

Expected: dev server 启动无错误，现有功能不受影响。

- [ ] **Step 4: 验证 agent 调用产生 span 数据**

通过 Agents 页面发送一条测试消息（chat），或调用 test API：

```bash
curl -X POST http://localhost:3000/api/agents/test \
  -H "Content-Type: application/json" \
  -d '{"agentKey":"opinionAgent","input":"测试"}'
```

然后查询 mastra_ai_spans 是否有数据：

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('data/mastra.db');
const count = db.prepare('SELECT COUNT(*) as cnt FROM mastra_ai_spans').all();
console.log(JSON.stringify(count));
const spans = db.prepare('SELECT traceId, spanId, name, spanType, entityName, startedAt FROM mastra_ai_spans ORDER BY startedAt DESC LIMIT 5').all();
console.log(JSON.stringify(spans, null, 2));
db.close();
"
```

Expected: `cnt > 0`，能看到 `AGENT_RUN` 类型的 span。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/mastra/index.ts
git commit -m "feat: enable Mastra observability with StorageExporter"
```

---

### Task 2: API route — GET 日志列表

**Files:**
- Create: `src/app/api/agents/logs/route.ts`

**Interfaces:**
- Consumes: `mastra` 实例（已配置 observability），`mastra.getStorage()?.getStore('observability')` 返回 `ObservabilityLibSQL`
- Produces:
  ```ts
  // GET /api/agents/logs?agentName=opinionAgent&page=0&perPage=20
  // Response:
  {
    logs: Array<{
      traceId: string;
      spanId: string;
      entityName: string;
      spanType: string;
      name: string;
      startedAt: string;   // ISO-8601
      endedAt: string | null;
      error: unknown | null;
      inputPreview: string;  // 前 100 字符
      outputPreview: string; // 前 100 字符
      callSource: "chat" | "workflow" | "test"; // 推断的调用来源
    }>;
    pagination: { total: number; page: number; perPage: number; hasMore: boolean };
  }
  ```

- [ ] **Step 1: 创建 API route 文件**

写入 `src/app/api/agents/logs/route.ts`：

```ts
// src/app/api/agents/logs/route.ts
import { NextRequest } from "next/server";
import { mastra } from "@/mastra";

interface LogItem {
  traceId: string;
  spanId: string;
  entityName: string;
  spanType: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  error: unknown | null;
  inputPreview: string;
  outputPreview: string;
  callSource: "chat" | "workflow" | "test";
}

function truncatePreview(value: unknown, maxLen = 100): string {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

function inferCallSource(span: Record<string, unknown>): "chat" | "workflow" | "test" {
  if (span.threadId) return "chat";
  if (span.runId) return "workflow";
  return "test";
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const agentName = searchParams.get("agentName") || undefined;
  const page = Math.max(0, Number(searchParams.get("page")) || 0);
  const perPage = Math.min(Math.max(1, Number(searchParams.get("perPage")) || 20), 100);

  try {
    const storage = mastra.getStorage();
    const obsStore = await storage?.getStore("observability");
    if (!obsStore) {
      return Response.json(
        { error: "Observability store not available" },
        { status: 500 }
      );
    }

    const filters: Record<string, unknown> = {
      entityType: "agent",
      spanType: "agent_run",
    };
    if (agentName) {
      filters.entityName = agentName;
    }

    const result = await obsStore.listTraces({
      mode: "page",
      filters: filters as never,
      pagination: { page, perPage },
      orderBy: {
        field: "startedAt" as const,
        direction: "DESC" as const,
      },
    });

    const logs: LogItem[] = (result.spans ?? []).map((span) => ({
      traceId: span.traceId,
      spanId: span.spanId,
      entityName: (span as Record<string, unknown>).entityName as string ?? "",
      spanType: span.spanType,
      name: span.name,
      startedAt: (span as Record<string, unknown>).startedAt as string,
      endedAt: (span as Record<string, unknown>).endedAt as string | null ?? null,
      error: (span as Record<string, unknown>).error ?? null,
      inputPreview: truncatePreview((span as Record<string, unknown>).input),
      outputPreview: truncatePreview((span as Record<string, unknown>).output),
      callSource: inferCallSource(span as Record<string, unknown>),
    }));

    return Response.json({
      logs,
      pagination: result.pagination ?? { total: logs.length, page, perPage, hasMore: false },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 验证 API 返回数据**

```bash
curl "http://localhost:3000/api/agents/logs?page=0&perPage=5" | node -e "
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    console.log('logs count:', data.logs?.length ?? 0);
    console.log('pagination:', JSON.stringify(data.pagination));
    if (data.logs?.length > 0) {
      console.log('first log:', JSON.stringify(data.logs[0], null, 2));
    }
  });
"
```

Expected: 返回 `logs` 数组和分页信息。此时若尚未有 agent 调用，logs 可能为空数组（正常）。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agents/logs/route.ts
git commit -m "feat: add GET /api/agents/logs for paginated agent call logs"
```

---

### Task 3: API route — GET 单条 trace 详情

**Files:**
- Create: `src/app/api/agents/logs/[traceId]/route.ts`

**Interfaces:**
- Consumes: `mastra` 实例，observability store
- Produces:
  ```ts
  // GET /api/agents/logs/:traceId
  // Response:
  {
    traceId: string;
    spans: Array<{
      spanId: string;
      parentSpanId: string | null;
      name: string;
      spanType: string;
      entityName: string;
      startedAt: string;
      endedAt: string | null;
      error: unknown | null;
      input: unknown;
      output: unknown;
      attributes: Record<string, unknown> | null;
    }>;
  }
  ```

- [ ] **Step 1: 创建 API route 文件**

写入 `src/app/api/agents/logs/[traceId]/route.ts`：

```ts
// src/app/api/agents/logs/[traceId]/route.ts
import { NextRequest } from "next/server";
import { mastra } from "@/mastra";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  const { traceId } = await params;

  try {
    const storage = mastra.getStorage();
    const obsStore = await storage?.getStore("observability");
    if (!obsStore) {
      return Response.json(
        { error: "Observability store not available" },
        { status: 500 }
      );
    }

    const trace = await obsStore.getTrace({ traceId });
    if (!trace) {
      return Response.json(
        { error: "Trace not found" },
        { status: 404 }
      );
    }

    const spans = (trace.spans ?? []).map((span) => ({
      spanId: span.spanId,
      parentSpanId: (span as Record<string, unknown>).parentSpanId as string | null ?? null,
      name: span.name,
      spanType: span.spanType,
      entityName: (span as Record<string, unknown>).entityName as string ?? "",
      startedAt: (span as Record<string, unknown>).startedAt as string,
      endedAt: (span as Record<string, unknown>).endedAt as string | null ?? null,
      error: (span as Record<string, unknown>).error ?? null,
      input: (span as Record<string, unknown>).input ?? null,
      output: (span as Record<string, unknown>).output ?? null,
      attributes: (span as Record<string, unknown>).attributes as Record<string, unknown> | null ?? null,
    }));

    return Response.json({ traceId, spans });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
```

注意：Next.js 16 App Router 中 `params` 是 `Promise`，需 `await`。

- [ ] **Step 2: 验证 API 返回 trace 详情**

先用 Task 2 的列表 API 获取一个 traceId，然后查询：

```bash
# 先取一个 traceId
TRACE_ID=$(node -e "
const Database = require('better-sqlite3');
const db = new Database('data/mastra.db');
const row = db.prepare(\"SELECT traceId FROM mastra_ai_spans WHERE spanType='agent_run' ORDER BY startedAt DESC LIMIT 1\").all();
console.log(row[0]?.traceId ?? '');
db.close();
")
echo "traceId: $TRACE_ID"

# 查询详情
curl "http://localhost:3000/api/agents/logs/$TRACE_ID" | node -e "
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    console.log('traceId:', data.traceId);
    console.log('spans count:', data.spans?.length ?? 0);
  });
"
```

Expected: 返回 `traceId` 和 `spans` 数组（至少 1 条）。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agents/logs/\[traceId\]/route.ts
git commit -m "feat: add GET /api/agents/logs/:traceId for trace detail"
```

---

### Task 4: 前端数据获取 hook

**Files:**
- Create: `src/hooks/use-agent-logs.ts`

**Interfaces:**
- Produces:
  ```ts
  useAgentLogs(filters?: { agentName?: string; page?: number; perPage?: number })
    → { logs: LogItem[]; pagination: Pagination; loading: boolean; error: string }

  useAgentLogDetail(traceId: string | null)
    → { spans: SpanDetail[]; loading: boolean; error: string }
  ```

- [ ] **Step 1: 创建 hook 文件**

写入 `src/hooks/use-agent-logs.ts`：

```ts
"use client";

import { useState, useEffect, useCallback } from "react";

export interface LogItem {
  traceId: string;
  spanId: string;
  entityName: string;
  spanType: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  error: unknown | null;
  inputPreview: string;
  outputPreview: string;
  callSource: "chat" | "workflow" | "test";
}

interface Pagination {
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

interface UseAgentLogsFilters {
  agentName?: string;
  page?: number;
  perPage?: number;
}

export function useAgentLogs(filters?: UseAgentLogsFilters) {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 0,
    perPage: 20,
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters?.agentName) params.set("agentName", filters.agentName);
      params.set("page", String(filters?.page ?? 0));
      params.set("perPage", String(filters?.perPage ?? 20));

      const res = await fetch(`/api/agents/logs?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs ?? []);
        setPagination(data.pagination ?? { total: 0, page: 0, perPage: 20, hasMore: false });
      } else {
        setError(data.error ?? "加载失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [filters?.agentName, filters?.page, filters?.perPage]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { logs, pagination, loading, error, refetch: fetchLogs };
}

export interface SpanDetail {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  spanType: string;
  entityName: string;
  startedAt: string;
  endedAt: string | null;
  error: unknown | null;
  input: unknown;
  output: unknown;
  attributes: Record<string, unknown> | null;
}

export function useAgentLogDetail(traceId: string | null) {
  const [spans, setSpans] = useState<SpanDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!traceId) {
      setSpans([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/agents/logs/${traceId}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setSpans(data.spans ?? []);
        } else {
          setError(data.error ?? "加载失败");
        }
      } catch {
        if (!cancelled) setError("网络错误");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  return { spans, loading, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-agent-logs.ts
git commit -m "feat: add useAgentLogs and useAgentLogDetail hooks"
```

---

### Task 5: 日志列表组件

**Files:**
- Create: `src/components/agents/agent-log-list.tsx`

**Interfaces:**
- Consumes: `LogItem[]`, `Pagination`（来自 `use-agent-logs`）
- Produces: `<AgentLogList>` 表格组件，支持行点击选中

- [ ] **Step 1: 创建列表组件**

写入 `src/components/agents/agent-log-list.tsx`：

```tsx
"use client";

import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { LogItem } from "@/hooks/use-agent-logs";

interface Pagination {
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

interface AgentLogListProps {
  logs: LogItem[];
  pagination: Pagination;
  loading: boolean;
  error: string;
  selectedTraceId: string | null;
  onSelect: (traceId: string) => void;
  onPageChange: (page: number) => void;
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "—";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const CALL_SOURCE_LABEL: Record<string, string> = {
  chat: "聊天",
  workflow: "工作流",
  test: "测试",
};

export function AgentLogList({
  logs,
  pagination,
  loading,
  error,
  selectedTraceId,
  onSelect,
  onPageChange,
}: AgentLogListProps) {
  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-red-500 text-sm">
        {error}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        暂无日志记录
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium w-36">时间</th>
              <th className="py-2 pr-3 font-medium">Agent</th>
              <th className="py-2 pr-3 font-medium w-16">类型</th>
              <th className="py-2 pr-3 font-medium w-16">状态</th>
              <th className="py-2 pr-3 font-medium w-20 text-right">耗时</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const isSelected = log.traceId === selectedTraceId;
              const hasError = log.error != null;
              const isRunning = log.endedAt == null && !hasError;
              return (
                <tr
                  key={log.traceId}
                  onClick={() => onSelect(log.traceId)}
                  className={`border-b cursor-pointer transition-colors hover:bg-muted/50 ${
                    isSelected ? "bg-muted" : ""
                  }`}
                >
                  <td className="py-2 pr-3 text-xs whitespace-nowrap">
                    {formatTime(log.startedAt)}
                  </td>
                  <td className="py-2 pr-3 font-medium">{log.entityName}</td>
                  <td className="py-2 pr-3">
                    <span className="text-xs bg-secondary px-1.5 py-0.5 rounded">
                      {CALL_SOURCE_LABEL[log.callSource] ?? log.callSource}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {hasError ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : isRunning ? (
                      <Clock className="h-4 w-4 text-yellow-500" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right text-xs text-muted-foreground">
                    {formatDuration(log.startedAt, log.endedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.total > 0 && (
        <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
          <span>
            共 {pagination.total} 条，第 {pagination.page + 1} /{" "}
            {Math.ceil(pagination.total / pagination.perPage)} 页
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 0}
              className="px-2 py-1 rounded border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={!pagination.hasMore}
              className="px-2 py-1 rounded border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              下一页
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
git add src/components/agents/agent-log-list.tsx
git commit -m "feat: add AgentLogList component with status indicators and pagination"
```

---

### Task 6: 日志详情对话回放组件

**Files:**
- Create: `src/components/agents/agent-log-detail.tsx`

**Interfaces:**
- Consumes: `SpanDetail[]`（来自 `useAgentLogDetail`）
- Produces: `<AgentLogDetail>` 组件，以 ai-elements 对话形式回放 input/output

- [ ] **Step 1: 创建详情组件**

写入 `src/components/agents/agent-log-detail.tsx`：

```tsx
"use client";

import { Loader2, Bot, User, AlertTriangle } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import type { SpanDetail } from "@/hooks/use-agent-logs";

interface AgentLogDetailProps {
  spans: SpanDetail[];
  loading: boolean;
  error: string;
}

/**
 * 从 span 的 input/output 中提取人类可读的文本。
 * Mastra observability 记录的 input/output 可能是：
 * - 直接的字符串
 * - { messages: [...] } 对象（AI SDK 格式）
 * - 其他 JSON 结构
 */
function extractText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    // 尝试解析 JSON 字符串
    try {
      const parsed = JSON.parse(value);
      return extractText(parsed);
    } catch {
      return value;
    }
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // AI SDK message 格式: { messages: [{ role, content }] }
    if (Array.isArray(obj.messages)) {
      return (obj.messages as Array<Record<string, unknown>>)
        .map((m) => {
          const role = m.role === "user" ? "用户" : "助手";
          const content =
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content);
          return `**${role}:** ${content}`;
        })
        .join("\n\n");
    }
    // 取第一个有意义的字符串字段
    for (const key of ["text", "content", "prompt", "query", "input"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/** 找到 AGENT_RUN 类型的根 span，从中提取用户输入和 agent 输出 */
function findConversationSpans(spans: SpanDetail[]) {
  const rootSpan = spans.find(
    (s) => s.spanType === "agent_run" && !s.parentSpanId
  );
  if (!rootSpan) return null;

  const userInput = extractText(rootSpan.input);
  const assistantOutput = extractText(rootSpan.output);

  return {
    userInput,
    assistantOutput,
    error: rootSpan.error,
    entityName: rootSpan.entityName,
    startedAt: rootSpan.startedAt,
    endedAt: rootSpan.endedAt,
  };
}

export function AgentLogDetail({
  spans,
  loading,
  error,
}: AgentLogDetailProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full py-16 text-red-500 text-sm">
        {error}
      </div>
    );
  }

  const conv = findConversationSpans(spans);

  if (!conv || (!conv.userInput && !conv.assistantOutput)) {
    return (
      <ConversationEmptyState
        icon={<Bot className="size-12" />}
        title="选择一条日志"
        description="从左侧列表选择一条日志查看对话回放"
      />
    );
  }

  return (
    <div className="flex flex-col h-full rounded-lg border bg-card">
      {/* 元信息条 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b text-xs text-muted-foreground bg-muted/30">
        <span className="font-medium text-foreground">{conv.entityName}</span>
        <span>
          {new Date(conv.startedAt).toLocaleString("zh-CN")}
        </span>
        {conv.endedAt && (
          <span>
            耗时{" "}
            {(
              (new Date(conv.endedAt).getTime() -
                new Date(conv.startedAt).getTime()) /
              1000
            ).toFixed(1)}
            s
          </span>
        )}
      </div>

      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="px-4 py-4">
          {conv.userInput && (
            <Message from="user">
              <MessageContent>
                <MessageResponse>{conv.userInput}</MessageResponse>
              </MessageContent>
            </Message>
          )}

          {conv.error ? (
            <Message from="assistant">
              <MessageContent>
                <div className="flex items-start gap-2 text-red-500">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">调用出错</p>
                    <p className="text-xs mt-1">
                      {typeof conv.error === "string"
                        ? conv.error
                        : JSON.stringify(conv.error, null, 2)}
                    </p>
                  </div>
                </div>
              </MessageContent>
            </Message>
          ) : conv.assistantOutput ? (
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>{conv.assistantOutput}</MessageResponse>
              </MessageContent>
            </Message>
          ) : (
            <Message from="assistant">
              <MessageContent>
                <span className="text-muted-foreground italic text-sm">
                  运行中…
                </span>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
      </Conversation>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/agents/agent-log-detail.tsx
git commit -m "feat: add AgentLogDetail component with chat replay using ai-elements"
```

---

### Task 7: 日志页面

**Files:**
- Create: `src/app/agents/logs/page.tsx`

**Interfaces:**
- Consumes: `useAgentLogs`, `useAgentLogDetail`, `AgentLogList`, `AgentLogDetail`
- Produces: `/agents/logs` 页面

- [ ] **Step 1: 创建页面**

写入 `src/app/agents/logs/page.tsx`：

```tsx
"use client";

import { useState } from "react";
import { useAgentLogs, useAgentLogDetail } from "@/hooks/use-agent-logs";
import { AgentLogList } from "@/components/agents/agent-log-list";
import { AgentLogDetail } from "@/components/agents/agent-log-detail";
import { ScrollText, Loader2 } from "lucide-react";

export default function AgentLogsPage() {
  const [page, setPage] = useState(0);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const { logs, pagination, loading, error } = useAgentLogs({ page, perPage: 20 });
  const {
    spans,
    loading: detailLoading,
    error: detailError,
  } = useAgentLogDetail(selectedTraceId);

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* 左侧列表 */}
      <div className="w-96 shrink-0 rounded-lg border bg-card overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Agent 调用日志
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          <AgentLogList
            logs={logs}
            pagination={pagination}
            loading={loading}
            error={error}
            selectedTraceId={selectedTraceId}
            onSelect={setSelectedTraceId}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* 右侧详情 */}
      <div className="flex-1 min-w-0">
        <AgentLogDetail
          spans={spans}
          loading={detailLoading}
          error={detailError}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证页面渲染**

启动 dev server 后访问 `http://localhost:3000/agents/logs`，确认：
- 左侧列表加载正常（如无日志则显示空状态）
- 点击某行后右侧加载对话回放
- 分页按钮可用

- [ ] **Step 3: Commit**

```bash
git add src/app/agents/logs/page.tsx
git commit -m "feat: add /agents/logs page with list + detail chat replay"
```

---

### Task 8: 侧边栏导航入口

**Files:**
- Modify: `src/components/layout/sidebar.tsx:31-38`

**Interfaces:**
- Consumes: `NAV_ITEMS` 数组
- Produces: 侧边栏新增 "Agent 日志" 链接

- [ ] **Step 1: 添加导航项**

在 `src/components/layout/sidebar.tsx` 的 `NAV_ITEMS` 数组中，在 `{ label: "Agent 管理", ... }` 之后添加：

```tsx
{ label: "Agent 日志", href: "/agents/logs", icon: ScrollText },
```

需要在现有 import 中添加 `ScrollText`：

```tsx
import {
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
  ScrollText,   // ← 新增
} from "lucide-react";
```

完整修改后的 `NAV_ITEMS`：

```tsx
const NAV_ITEMS = [
  { label: "抖音雷达", href: "/douyin", icon: Radio },
  { label: "个股分析", href: "/stocks", icon: TrendingUp },
  { label: "行业分析", href: "/industry", icon: Building2 },
  { label: "舆情分析", href: "/sentiment", icon: MessageCircle },
  { label: "财报 & 研报", href: "/financials", icon: FileText },
  { label: "Agent 管理", href: "/agents", icon: Bot },
  { label: "Agent 日志", href: "/agents/logs", icon: ScrollText },
  { label: "设置", href: "/settings", icon: Settings },
];
```

- [ ] **Step 2: 验证导航**

启动 dev server，确认侧边栏出现 "Agent 日志" 菜单项，点击跳转到 `/agents/logs`。

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: add Agent Logs nav entry to sidebar"
```

---

### Task 9: 端到端验证

- [ ] **Step 1: 确保有测试数据**

通过 Agents 页面发送一条聊天消息：

1. 访问 `http://localhost:3000/agents`
2. 选择 `opinionAgent`
3. 在右侧输入框输入 "测试日志功能"
4. 等待回复

或者调用 test API：

```bash
curl -X POST http://localhost:3000/api/agents/test \
  -H "Content-Type: application/json" \
  -d '{"agentKey":"opinionAgent","input":"测试agent日志"}'
```

- [ ] **Step 2: 访问日志页面**

打开 `http://localhost:3000/agents/logs`，确认：
- 列表中出现刚才的调用记录（时间、Agent 名、类型、✓ 状态、耗时）
- 点击该行，右侧显示对话回放（用户输入 + Agent 输出）

- [ ] **Step 3: 验证分页**

多次调用 test API 产生超过 20 条记录后，验证分页按钮正常工作。

- [ ] **Step 4: 验证错误展示**

若存在失败记录（`error` 不为 null），确认列表显示 ✗ 图标，详情面板展示错误信息。

- [ ] **Step 5: Commit（如有微调）**

```bash
git add -A
git commit -m "chore: final adjustments after e2e verification"
```
