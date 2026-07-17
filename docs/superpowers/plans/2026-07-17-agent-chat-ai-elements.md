# Agent 管理页 AI 对话化改造 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/agents` 页面从 CRUD 表单风格改造为左侧 Agent 列表 + 右侧 AI 对话区的双栏布局，引入 ai-elements 组件和 Mastra AI SDK 桥接。

**Architecture:** 前端用 `@ai-sdk/react` 的 `useChat` hook 驱动 ai-elements 的 Conversation/Message/PromptInput 组件；后端新增 `/api/chat` route，通过 `@mastra/ai-sdk` 将 Mastra agent 适配为 AI SDK 兼容的 model，实现 streaming 对话。

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, ai-elements, @ai-sdk/react, @mastra/ai-sdk, Mastra

## Global Constraints

- 只改 `/agents` 页面，不影响其他路由
- 不动布局框架（LayoutShell / Sidebar / Header）
- 主题微调只在 `globals.css` 增量添加，不动现有 CSS 变量
- 现有 `/api/agents`、`/api/agents/test` 端点保持不变

---

### Task 1: 安装依赖 & 拉取 ai-elements 组件

**Files:**
- Modify: `package.json`
- Create: `src/components/ai-elements/conversation.tsx` (CLI 生成)
- Create: `src/components/ai-elements/message.tsx` (CLI 生成)
- Create: `src/components/ai-elements/prompt-input.tsx` (CLI 生成)

**Produces:**
- npm 依赖就绪：`@mastra/ai-sdk`, `@ai-sdk/react`, `ai`
- ai-elements 组件就绪于 `@/components/ai-elements/`

- [ ] **Step 1: 安装 npm 依赖**

```bash
npm install @mastra/ai-sdk@latest @ai-sdk/react ai
```

- [ ] **Step 2: 拉取 ai-elements 组件**

```bash
npx ai-elements@latest add conversation message prompt-input
```

- [ ] **Step 3: 验证 — 确认文件存在**

```bash
ls src/components/ai-elements/conversation.tsx src/components/ai-elements/message.tsx src/components/ai-elements/prompt-input.tsx
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/ai-elements/
git commit -m "chore: 安装 ai-elements 组件和 AI SDK 依赖"
```

---

### Task 2: 新增 `/api/chat` route

**Files:**
- Create: `src/app/api/chat/route.ts`

**Interfaces:**
- Consumes: `mastra` from `@/mastra` (已有 export)
- Produces: `POST /api/chat` — 接收 `{ messages: UIMessage[] }` + query `agentKey`，返回 AI SDK stream response

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/chat/route.ts
import { mastra } from "@/mastra";
import { streamText, convertToModelMessages } from "ai";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentKey = searchParams.get("agentKey");

    if (!agentKey) {
      return Response.json(
        { error: "agentKey 不能为空" },
        { status: 400 }
      );
    }

    const agents = mastra.listAgents();
    const agent = agents[agentKey as keyof typeof agents];

    if (!agent) {
      return Response.json(
        { error: `未注册的 agent: ${agentKey}` },
        { status: 404 }
      );
    }

    const { messages } = await request.json();

    const result = streamText({
      model: agent,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 验证 — 用 curl 发请求测试**

在一个终端启动 dev server (`npm run dev`)，另一个终端：

```bash
curl -X POST "http://localhost:3000/api/chat?agentKey=opinionAgent" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"你好"}]}]}'
```

预期：返回 streaming 文本响应（或 JSON 报错说明配置问题，只要不是 404/500 即可）

- [ ] **Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: 新增 /api/chat streaming 端点（Mastra + AI SDK 桥接）"
```

---

### Task 3: 提取 `useAgents` hook

**Files:**
- Create: `src/hooks/use-agents.ts`

**Interfaces:**
- Produces: `useAgents()` → `{ agents: AgentInfo[], loading: boolean, error: string }`

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/use-agents.ts
"use client";

import { useState, useEffect } from "react";

export interface AgentInfo {
  key: string;
  name: string;
  description: string;
  flow: string;
  model: string;
  instructions: string;
}

export function useAgents() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agents");
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setAgents(data.agents ?? []);
        } else {
          setError(`加载失败: ${data.error}`);
        }
      } catch {
        if (!cancelled) setError("加载失败，请检查网络");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { agents, loading, error };
}
```

- [ ] **Step 2: 验证 — TypeScript 编译检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-agents.ts
git commit -m "refactor: 从 AgentsPage 提取 useAgents hook"
```

---

### Task 4: 创建 `AgentList` 组件

**Files:**
- Create: `src/components/agents/agent-list.tsx`

**Interfaces:**
- Consumes: `AgentInfo` from `@/hooks/use-agents`
- Produces: `<AgentList agents={AgentInfo[]} selectedKey={string | null} onSelect={(key: string) => void} />`

- [ ] **Step 1: Write the component**

```typescript
// src/components/agents/agent-list.tsx
"use client";

import { Bot } from "lucide-react";
import type { AgentInfo } from "@/hooks/use-agents";

interface AgentListProps {
  agents: AgentInfo[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function AgentList({ agents, selectedKey, onSelect }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground px-3 py-8 text-center">
        暂无已注册的 Agent
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {agents.map((agent) => {
        const isSelected = agent.key === selectedKey;
        return (
          <button
            key={agent.key}
            onClick={() => onSelect(agent.key)}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isSelected
                ? "bg-primary/10 text-primary border border-primary/20"
                : "hover:bg-muted border border-transparent"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <Bot className="h-4 w-4 shrink-0" />
              <span className="truncate">{agent.name}</span>
            </div>
            {agent.description && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {agent.description}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 验证 — TypeScript 编译检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/agents/agent-list.tsx
git commit -m "feat: 添加 AgentList 选择列表组件"
```

---

### Task 5: 创建 `AgentDetail` 组件

**Files:**
- Create: `src/components/agents/agent-detail.tsx`

**Interfaces:**
- Consumes: `AgentInfo` from `@/hooks/use-agents`
- Produces: `<AgentDetail agent={AgentInfo} />`

- [ ] **Step 1: Write the component**

```typescript
// src/components/agents/agent-detail.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AgentInfo } from "@/hooks/use-agents";

interface AgentDetailProps {
  agent: AgentInfo;
}

export function AgentDetail({ agent }: AgentDetailProps) {
  const [showInstructions, setShowInstructions] = useState(false);

  return (
    <div className="space-y-3 text-sm">
      {agent.flow && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">流程:</span>
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
            {agent.flow}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">模型:</span>
        <span className="font-mono text-xs">{agent.model || "-"}</span>
      </div>

      <div>
        <button
          onClick={() => setShowInstructions((v) => !v)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          {showInstructions ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Instructions
        </button>
        {showInstructions && (
          <pre className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {agent.instructions}
          </pre>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证 — TypeScript 编译检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/agents/agent-detail.tsx
git commit -m "feat: 添加 AgentDetail 配置信息组件"
```

---

### Task 6: 创建 `AgentChat` 对话组件

**Files:**
- Create: `src/components/agents/agent-chat.tsx`

**Interfaces:**
- Consumes: `ai-elements` components from `@/components/ai-elements/`
- Produces: `<AgentChat agentKey={string} />` — 核心对话区

- [ ] **Step 1: Write the component**

```typescript
// src/components/agents/agent-chat.tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { MessageSquare } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";

interface AgentChatProps {
  agentKey: string;
}

export function AgentChat({ agentKey }: AgentChatProps) {
  const { messages, sendMessage, status } = useChat({
    api: `/api/chat?agentKey=${agentKey}`,
  });

  const handleSubmit = (message: { text: string }) => {
    if (message.text.trim()) {
      sendMessage({ text: message.text });
    }
  };

  return (
    <div className="flex flex-col h-full rounded-lg border card-elevated bg-card">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="px-4 py-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageSquare className="size-12" />}
              title="开始对话"
              description={`向 ${agentKey} 发送消息进行测试`}
            />
          ) : (
            messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <MessageResponse key={`${message.id}-${i}`}>
                          {part.text}
                        </MessageResponse>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t px-4 py-3">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="输入测试消息..."
              className="min-h-[60px] max-h-[160px]"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <div className="flex-1" />
            <PromptInputSubmit
              status={status === "streaming" ? "streaming" : status === "submitted" ? "submitted" : "ready"}
              disabled={status === "streaming" || status === "submitted"}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证 — TypeScript 编译检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/agents/agent-chat.tsx
git commit -m "feat: 添加 AgentChat 对话组件（ai-elements + useChat）"
```

---

### Task 7: 重构 `page.tsx` 为双栏布局

**Files:**
- Modify: `src/app/agents/page.tsx` (重写)

**Interfaces:**
- Consumes: `useAgents`, `AgentList`, `AgentDetail`, `AgentChat`
- Produces: 双栏布局的 `/agents` 页面

- [ ] **Step 1: Rewrite page.tsx**

```typescript
// src/app/agents/page.tsx
"use client";

import { useState } from "react";
import { useAgents } from "@/hooks/use-agents";
import { AgentList } from "@/components/agents/agent-list";
import { AgentDetail } from "@/components/agents/agent-detail";
import { AgentChat } from "@/components/agents/agent-chat";
import { Loader2, Bot } from "lucide-react";

export default function AgentsPage() {
  const { agents, loading, error } = useAgents();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedAgent = agents.find((a) => a.key === selectedKey) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent 管理</h1>
        <p className="text-muted-foreground mt-1">
          选择一个 Agent，在右侧对话区进行测试
        </p>
      </div>

      <div className="flex gap-4 h-[calc(100vh-12rem)]">
        {/* 左侧面板 */}
        <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Agent 列表
            </h2>
            {loading ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
              </p>
            ) : error ? (
              <p className="text-sm text-red-500">{error}</p>
            ) : (
              <AgentList
                agents={agents}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
              />
            )}
          </div>

          {selectedAgent && (
            <div className="rounded-lg border bg-card p-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Agent 配置
              </h2>
              <AgentDetail agent={selectedAgent} />
            </div>
          )}
        </div>

        {/* 右侧对话区 */}
        <div className="flex-1 min-w-0">
          {selectedAgent ? (
            <AgentChat key={selectedAgent.key} agentKey={selectedAgent.key} />
          ) : (
            <div className="flex items-center justify-center h-full rounded-lg border bg-card text-muted-foreground">
              <div className="text-center space-y-2">
                <Bot className="h-12 w-12 mx-auto opacity-30" />
                <p className="text-sm">选择一个 Agent 开始对话</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证 — TypeScript 编译检查 + 构建**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/agents/page.tsx
git commit -m "feat: 重构 /agents 为双栏对话布局"
```

---

### Task 8: 全局 CSS 主题微调

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: 添加 CSS 工具类**

在 `globals.css` 末尾的 `@layer base` 之后添加：

```css
/* src/app/globals.css — 在文件末尾追加 */

@layer utilities {
  /* 卡片柔和阴影 — 用于对话区和面板卡片 */
  .card-elevated {
    box-shadow: var(--card-glow);
    border-color: var(--card-ring);
  }

  /* PromptInput 聚焦光晕 */
  .prompt-focus-ring:focus-within {
    box-shadow: 0 0 0 3px oklch(0.546 0.245 262.881 / 20%);
  }
}

.dark .prompt-focus-ring:focus-within {
  box-shadow: 0 0 0 3px oklch(0.623 0.214 259.815 / 30%);
}
```

- [ ] **Step 2: 验证 — 构建检查**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: 添加 card-elevated 和 prompt-focus-ring 工具类"
```

---

### Task 9: 端到端验证

**Files:** 无新建

- [ ] **Step 1: 启动 dev server 并手动验证**

```bash
npm run dev
```

验证清单：
1. 打开 `http://localhost:3000/agents`，确认双栏布局正常
2. 左侧 Agent 列表显示 opinionAgent，点击选中
3. 左侧下方显示 Agent 配置（flow、model、可折叠 instructions）
4. 右侧对话区显示空状态 "开始对话"
5. 输入消息发送，确认 streaming 回复正常
6. 切换 dark/light 模式，确认主题正常
7. 其他页面（dashboard、stocks 等）不受影响

- [ ] **Step 2: 如有问题，修复后重新验证**

- [ ] **Step 3: Commit 最终修复（如有）**

```bash
git add -A
git commit -m "fix: 端到端验证修复"
```
