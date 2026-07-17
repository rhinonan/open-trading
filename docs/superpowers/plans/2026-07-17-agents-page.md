# Agent 管理页落地 实现计划（子项目 4/4）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/agents` 占位页变成真实管理页：Agent 列表与配置展示、内嵌手动测试运行、transcribe-work workflow 运行历史（分页 + 步骤展开）。

**Architecture:** `agent-meta.ts` 提供注册键→业务元数据映射；3 条 Next API 路由（`/api/agents`、`/api/agents/runs`、`/api/agents/test`）分别包装 `mastra.listAgents()`、`workflow.listWorkflowRuns()`、`agent.generate()`；`/agents` 页面 client 组件消费三条接口，各区块独立 loading/error。

**Tech Stack:** Next.js 16.2.10 App Router、@mastra/core 1.51（已装）、现有 Card/Button 组件与 API 路由风格。

**Spec:** `docs/superpowers/specs/2026-07-17-agents-page-design.md`

## Global Constraints

- **Mastra API 以本地安装版为准**：本计划已对照 `.d.ts` 核实——`mastra.listAgents(): TAgents`（agent 记录）、`agent.getInstructions()` 异步、`WorkflowRunState` 含 `status` 与 `context`（`input` 键之外每键为一步的 `SerializedStepResult`，含 `status`）、`workflow.listWorkflowRuns({ page, perPage })` 返回 `{ runs, total }`。若实现时仍有类型不匹配，以 `node_modules/@mastra/core/dist/**/*.d.ts` 为准做最小调整并在报告中说明。
- 项目**没有测试框架**，不新增。每任务验证 = `npx tsc --noEmit` + `npm run lint` 通过 + 指定冒烟。
- API 错误风格与现有路由一致：try/catch → `Response.json({ error }, { status })`；参数非法 400、未知 agent 404、内部错误 500。
- 模型显示从 settings 表实时解析（`getLlmModel(flow)`），**不得**调用 agent 的模型解析函数。
- 运行历史：page 默认 0，perPage 默认 10、上限 50；snapshot 解析失败该行 `parseError: true` 降级，不影响其余行。
- 测试运行：input 截断 4000 字符；`modelSettings: { maxOutputTokens: 500, temperature: 0.3 }`。
- 无 `AGENT_META` 条目的 agent 也要在列表返回（description/flow/model 置空字符串）。
- 中文 UI 文案与注释，风格同现有代码；面包屑/侧边栏已有 `/agents` 映射不动。

---

### Task 1: agent 元数据 + `/api/agents` + `/api/agents/test`

**Files:**
- Create: `src/mastra/agent-meta.ts`
- Create: `src/app/api/agents/route.ts`
- Create: `src/app/api/agents/test/route.ts`

**Interfaces:**
- Consumes: `mastra`（`@/mastra`）、`getLlmModel` / `type LlmFlow`（`@/services/settings-service`）、`agent.getInstructions()`（异步）、`agent.generate(prompt, { modelSettings })` → `.text`
- Produces（Task 3 依赖的响应契约）:
  - `GET /api/agents` → 200 `{ agents: [{ key: string, name: string, description: string, flow: string, model: string, instructions: string }] }`
  - `POST /api/agents/test` body `{ agentKey: string, input: string }` → 200 `{ text: string }`；400/404/500 `{ error: string }`
  - `AGENT_META: Record<string, AgentMeta>`（`@/mastra/agent-meta`）

- [ ] **Step 1: 创建 agent-meta**

创建 `src/mastra/agent-meta.ts`：

```ts
// src/mastra/agent-meta.ts
import type { LlmFlow } from "@/services/settings-service";

export interface AgentMeta {
  flow: LlmFlow; // 模型选择归属的流程（settings 表维度）
  description: string; // 页面展示用中文描述
}

// agent 注册键 → 页面元数据；新增 agent 时在此补一行
export const AGENT_META: Record<string, AgentMeta> = {
  opinionAgent: { flow: "opinion", description: "抖音博主观点摘要提取" },
};
```

- [ ] **Step 2: 创建 GET /api/agents**

创建 `src/app/api/agents/route.ts`：

```ts
// src/app/api/agents/route.ts
import { mastra } from "@/mastra";
import { AGENT_META } from "@/mastra/agent-meta";
import { getLlmModel } from "@/services/settings-service";

export async function GET() {
  try {
    const agents = mastra.listAgents();
    const list = await Promise.all(
      Object.entries(agents).map(async ([key, agent]) => {
        const meta = AGENT_META[key];
        const instructions = await agent.getInstructions();
        return {
          key,
          name: agent.name,
          description: meta?.description ?? "",
          flow: meta?.flow ?? "",
          model: meta ? await getLlmModel(meta.flow) : "",
          instructions:
            typeof instructions === "string"
              ? instructions
              : JSON.stringify(instructions),
        };
      })
    );
    return Response.json({ agents: list });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: 创建 POST /api/agents/test**

创建 `src/app/api/agents/test/route.ts`：

```ts
// src/app/api/agents/test/route.ts
import { mastra } from "@/mastra";

export async function POST(request: Request) {
  try {
    const body: { agentKey?: unknown; input?: unknown } = await request.json();

    if (typeof body.agentKey !== "string" || !body.agentKey.trim()) {
      return Response.json(
        { error: "agentKey 必须是非空字符串" },
        { status: 400 }
      );
    }
    if (typeof body.input !== "string" || !body.input.trim()) {
      return Response.json(
        { error: "input 必须是非空字符串" },
        { status: 400 }
      );
    }

    const agents = mastra.listAgents();
    const agent = agents[body.agentKey as keyof typeof agents];
    if (!agent) {
      return Response.json(
        { error: `未注册的 agent: ${body.agentKey}` },
        { status: 404 }
      );
    }

    const result = await agent.generate(
      body.input.slice(0, 4000), // 限制输入长度
      { modelSettings: { maxOutputTokens: 500, temperature: 0.3 } }
    );

    return Response.json({ text: result.text });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: 类型检查与 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误（Mastra 类型不匹配时按 Global Constraints 最小调整并记录）。

- [ ] **Step 5: curl 冒烟（dev server 需运行，端口 3000）**

```bash
curl -s http://localhost:3000/api/agents
```
Expected: `{"agents":[{"key":"opinionAgent","name":"opinion-agent","description":"抖音博主观点摘要提取","flow":"opinion","model":"<settings 当前模型>","instructions":"你是一个财经内容分析师...(全文)"}]}`

```bash
curl -s -X POST http://localhost:3000/api/agents/test -H "Content-Type: application/json" -d '{"agentKey":"nope","input":"x"}'
```
Expected: 404 `{"error":"未注册的 agent: nope"}`

```bash
curl -s -X POST http://localhost:3000/api/agents/test -H "Content-Type: application/json" -d '{"agentKey":"opinionAgent","input":""}'
```
Expected: 400 `{"error":"input 必须是非空字符串"}`

```bash
curl -s -X POST http://localhost:3000/api/agents/test -H "Content-Type: application/json" -d '{"agentKey":"opinionAgent","input":"今天上证指数放量突破3500点，我认为下周还要涨，目标3600。"}'
```
Expected: 200 `{"text":"..."}`（真实 LLM 调用，返回一句话摘要）

- [ ] **Step 6: Commit**

```bash
git add src/mastra/agent-meta.ts src/app/api/agents/
git commit -m "feat: agent 列表与手动测试 API"
```

---

### Task 2: `/api/agents/runs` 运行历史查询

**Files:**
- Create: `src/app/api/agents/runs/route.ts`

**Interfaces:**
- Consumes: `mastra.getWorkflow("transcribeWorkWorkflow").listWorkflowRuns({ page, perPage })` → `{ runs: WorkflowRun[], total: number }`，`run.snapshot: WorkflowRunState | string`（state 含 `status`、`context`——`input` 之外每键是一步结果，含 `status` 字段）
- Produces（Task 3 依赖）: `GET /api/agents/runs?page=0&perPage=10` → 200 `{ runs: [{ runId: string, workflowName: string, status: string, createdAt: string, updatedAt: string, steps: [{ id: string, status: string }], parseError?: boolean }], total: number }`

- [ ] **Step 1: 创建路由**

创建 `src/app/api/agents/runs/route.ts`：

```ts
// src/app/api/agents/runs/route.ts
import { NextRequest } from "next/server";
import { mastra } from "@/mastra";

interface RunStep {
  id: string;
  status: string;
}

interface RunSummary {
  runId: string;
  workflowName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  steps: RunStep[];
  parseError?: boolean;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const page = Math.max(0, Number(searchParams.get("page")) || 0);
  const perPage = Math.min(Math.max(1, Number(searchParams.get("perPage")) || 10), 50);

  try {
    const workflow = mastra.getWorkflow("transcribeWorkWorkflow");
    const { runs, total } = await workflow.listWorkflowRuns({ page, perPage });

    const mapped: RunSummary[] = runs.map((run) => {
      const base = {
        runId: run.runId,
        workflowName: run.workflowName,
        createdAt: new Date(run.createdAt).toISOString(),
        updatedAt: new Date(run.updatedAt).toISOString(),
      };
      try {
        const snapshot =
          typeof run.snapshot === "string"
            ? JSON.parse(run.snapshot)
            : run.snapshot;
        const steps: RunStep[] = Object.entries(snapshot?.context ?? {})
          .filter(([key]) => key !== "input")
          .map(([id, value]) => ({
            id,
            status: (value as { status?: string })?.status ?? "unknown",
          }));
        return { ...base, status: snapshot?.status ?? "unknown", steps };
      } catch {
        // 快照解析失败：该行降级，不影响其余行
        return { ...base, status: "unknown", steps: [], parseError: true };
      }
    });

    return Response.json({ runs: mapped, total });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 类型检查与 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误。

- [ ] **Step 3: curl 冒烟**

```bash
curl -s "http://localhost:3000/api/agents/runs?page=0&perPage=10"
```
Expected: 200 `{"runs":[...],"total":<n>}`；库中无 run 时 `{"runs":[],"total":0}`。

```bash
curl -s "http://localhost:3000/api/agents/runs?page=-5&perPage=999"
```
Expected: 200，page 被钳为 0、perPage 钳为 50（不报错）。

- [ ] **Step 4: Commit**

```bash
git add src/app/api/agents/runs/route.ts
git commit -m "feat: workflow 运行历史查询 API"
```

---

### Task 3: `/agents` 页面重写

**Files:**
- Modify: `src/app/agents/page.tsx`（整文件重写，见 Step 1）

**Interfaces:**
- Consumes（契约见 Task 1/2 Produces）: `GET /api/agents`、`POST /api/agents/test`、`GET /api/agents/runs?page&perPage`
- Produces: 无新接口（纯 UI）

- [ ] **Step 1: 重写页面**

`src/app/agents/page.tsx` 整文件改为：

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Play,
  History,
} from "lucide-react";

interface AgentInfo {
  key: string;
  name: string;
  description: string;
  flow: string;
  model: string;
  instructions: string;
}

interface RunStep {
  id: string;
  status: string;
}

interface RunSummary {
  runId: string;
  workflowName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  steps: RunStep[];
  parseError?: boolean;
}

const PER_PAGE = 10;

function statusBadgeClass(status: string): string {
  if (status === "success") return "bg-green-500/15 text-green-600";
  if (status === "failed") return "bg-red-500/15 text-red-500";
  return "bg-muted text-muted-foreground";
}

function formatDuration(createdAt: string, updatedAt: string): string {
  const ms = new Date(updatedAt).getTime() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AgentsPage() {
  // --- Agent 列表状态 ---
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState("");
  const [expandedInstructions, setExpandedInstructions] = useState<Record<string, boolean>>({});

  // --- 测试运行状态（按 agent key 分开） ---
  const [testInput, setTestInput] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [testError, setTestError] = useState<Record<string, string>>({});
  const [testRunning, setTestRunning] = useState<Record<string, boolean>>({});

  // --- 运行历史状态 ---
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState("");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/agents");
        const data = await res.json();
        if (res.ok) {
          setAgents(data.agents ?? []);
        } else {
          setAgentsError(`加载失败: ${data.error}`);
        }
      } catch {
        setAgentsError("加载失败，请检查网络");
      } finally {
        setAgentsLoading(false);
      }
    })();
  }, []);

  const fetchRuns = useCallback(async (targetPage: number) => {
    setRunsLoading(true);
    setRunsError("");
    try {
      const res = await fetch(`/api/agents/runs?page=${targetPage}&perPage=${PER_PAGE}`);
      const data = await res.json();
      if (res.ok) {
        setRuns(data.runs ?? []);
        setTotal(data.total ?? 0);
        setPage(targetPage);
      } else {
        setRunsError(`加载失败: ${data.error}`);
      }
    } catch {
      setRunsError("加载失败，请检查网络");
    }
    setRunsLoading(false);
  }, []);

  useEffect(() => { fetchRuns(0); }, [fetchRuns]);

  const handleTest = async (agentKey: string) => {
    const input = (testInput[agentKey] ?? "").trim();
    if (!input) return;
    setTestRunning((s) => ({ ...s, [agentKey]: true }));
    setTestResult((s) => ({ ...s, [agentKey]: "" }));
    setTestError((s) => ({ ...s, [agentKey]: "" }));
    try {
      const res = await fetch("/api/agents/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentKey, input }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult((s) => ({ ...s, [agentKey]: data.text }));
      } else {
        setTestError((s) => ({ ...s, [agentKey]: `运行失败: ${data.error}` }));
      }
    } catch {
      setTestError((s) => ({ ...s, [agentKey]: "运行失败，请检查网络" }));
    }
    setTestRunning((s) => ({ ...s, [agentKey]: false }));
  };

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent 管理</h1>
        <p className="text-muted-foreground mt-1">
          已注册 Agent 的配置、手动测试与 Workflow 运行历史
        </p>
      </div>

      {/* Agent 列表 */}
      {agentsLoading ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
            </p>
          </CardContent>
        </Card>
      ) : agentsError ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-red-500">{agentsError}</p>
          </CardContent>
        </Card>
      ) : (
        agents.map((agent) => (
          <Card key={agent.key}>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Bot className="h-4 w-4" />
                {agent.name}
                {agent.flow && (
                  <span className="text-xs font-normal rounded bg-muted px-2 py-0.5 text-muted-foreground">
                    {agent.flow}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {agent.description && (
                <p className="text-sm text-muted-foreground">{agent.description}</p>
              )}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">当前模型:</span>
                <span className="font-mono">{agent.model || "-"}</span>
              </div>

              {/* instructions 折叠 */}
              <div>
                <button
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setExpandedInstructions((s) => ({ ...s, [agent.key]: !s[agent.key] }))
                  }
                >
                  {expandedInstructions[agent.key] ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  Instructions
                </button>
                {expandedInstructions[agent.key] && (
                  <pre className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-3 whitespace-pre-wrap">
                    {agent.instructions}
                  </pre>
                )}
              </div>

              {/* 测试运行 */}
              <div className="space-y-2 border-t pt-4">
                <h3 className="text-sm font-medium text-muted-foreground">测试运行</h3>
                <textarea
                  value={testInput[agent.key] ?? ""}
                  onChange={(e) =>
                    setTestInput((s) => ({ ...s, [agent.key]: e.target.value }))
                  }
                  placeholder="输入测试文本..."
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button
                  size="sm"
                  onClick={() => handleTest(agent.key)}
                  disabled={testRunning[agent.key] || !(testInput[agent.key] ?? "").trim()}
                >
                  {testRunning[agent.key] ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  运行
                </Button>
                {testResult[agent.key] && (
                  <p className="text-sm bg-muted/50 rounded-md p-3">{testResult[agent.key]}</p>
                )}
                {testError[agent.key] && (
                  <p className="text-sm text-red-500 bg-muted/50 rounded-md p-3">
                    {testError[agent.key]}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* 运行历史 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <History className="h-4 w-4" />
            Workflow 运行历史
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {runsLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
            </p>
          ) : runsError ? (
            <p className="text-sm text-red-500">{runsError}</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无运行记录</p>
          ) : (
            <>
              <div className="space-y-2">
                {runs.map((run) => (
                  <div key={run.runId} className="rounded-md border">
                    <button
                      className="flex w-full items-center gap-3 p-3 text-left text-sm"
                      onClick={() =>
                        setExpandedRun(expandedRun === run.runId ? null : run.runId)
                      }
                    >
                      {expandedRun === run.runId ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="font-mono text-xs">{run.runId.slice(0, 8)}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${statusBadgeClass(run.status)}`}
                      >
                        {run.status}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(run.createdAt).toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground w-16 text-right">
                        {formatDuration(run.createdAt, run.updatedAt)}
                      </span>
                    </button>
                    {expandedRun === run.runId && (
                      <div className="border-t px-3 py-2 space-y-1">
                        {run.parseError ? (
                          <p className="text-xs text-red-500">快照解析失败</p>
                        ) : run.steps.length === 0 ? (
                          <p className="text-xs text-muted-foreground">无步骤记录</p>
                        ) : (
                          run.steps.map((step) => (
                            <div key={step.id} className="flex items-center gap-2 text-xs">
                              <span className="font-mono">{step.id}</span>
                              <span
                                className={`rounded px-1.5 py-0.5 ${statusBadgeClass(step.status)}`}
                              >
                                {step.status}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 分页 */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  共 {total} 条 · 第 {page + 1}/{totalPages} 页
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 0 || runsLoading}
                    onClick={() => fetchRuns(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> 上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page + 1 >= totalPages || runsLoading}
                    onClick={() => fetchRuns(page + 1)}
                  >
                    下一页 <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查与 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误。

- [ ] **Step 3: 页面冒烟**

```bash
curl -s http://localhost:3000/agents -o /dev/null -w "%{http_code}\n"
curl -s http://localhost:3000/agents | grep -o "Agent 管理\|Workflow 运行历史" | sort -u
```
Expected: 200；两个标题字符串都出现。

- [ ] **Step 4: Commit**

```bash
git add src/app/agents/page.tsx
git commit -m "feat: Agent 管理页 — 配置展示、测试运行与运行历史"
```

---

### Task 4: 端到端验证

**Files:** 无新增/修改（纯验证；dev server 需运行）

- [ ] **Step 1: 构建**

Run: `npm run build`
Expected: 通过；路由表含 `/agents`（○）、`/api/agents`、`/api/agents/runs`、`/api/agents/test`（ƒ）。

- [ ] **Step 2: 浏览器路径手动冒烟（或 curl 等价）**

1. `GET /api/agents` — opinionAgent 出现，model 与设置页一致
2. `POST /api/agents/test`（真实文本）— 返回一句话摘要，页面测试框往返正常
3. `GET /api/agents/runs` — 有 run 数据则行可展开看步骤；无数据显示"暂无运行记录"
4. 设置页切换观点提取模型 → `GET /api/agents` 的 model 跟随变化（无需重启）

- [ ] **Step 3: 收尾**

`git status` 干净，所有任务勾选。
