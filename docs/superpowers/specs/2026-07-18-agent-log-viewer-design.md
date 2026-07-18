# Agent 日志查看器 — 设计文档

> 日期: 2026-07-18 | 状态: 待实施

## 背景

当前所有 Mastra Agent 调用（chat / workflow / test）无持久化日志，调用后无法回溯查看。Mastra v1.51 内置了可观测性系统（Observability + MastraStorageExporter），`mastra_ai_spans` 表结构已就绪，只需开启即可自动记录所有 agent 调用的 trace/span 数据。

## 目标

为所有 Mastra Agent 调用提供**只读日志查看**功能，无需二次对话能力。日志自动记录，前端以列表 + 对话回放形式展示。

## 用户故事

1. 开发者在侧边栏点击"Agent 日志"，看到所有历史 agent 调用列表（时间、agent 名、类型、状态、耗时）
2. 点击某条日志，展开详情面板，以聊天对话形式回放当次调用的输入/输出
3. 可按 Agent 名称、调用类型、日期范围筛选日志

## 架构

```
Agent 调用（chat / workflow / test）
       │
       ▼
MastraStorageExporter  ← 新增依赖 @mastra/observability
       │
       ▼
mastra_ai_spans (SQLite)  ← 表已存在，当前为空
       │
       ▼
GET /api/agents/logs       ← 新增 API route，查询 LibSQLStore
       │
       ▼
/app/agents/logs/page.tsx  ← 新增前端页面
```

### 为什么直接查 LibSQLStore 而非走 Mastra 内置 API？

- 项目已有直接操作 DB 的前例（`/api/agents/runs` 查 `mastra_workflow_snapshot`）
- 无需启动 Mastra server
- 查询字段更灵活

## 实施要点

### 1. 开启可观测性

**文件**: `src/mastra/index.ts`
**依赖**: `npm install @mastra/observability`

```ts
import { Observability, MastraStorageExporter } from "@mastra/observability";

export const mastra = new Mastra({
  // ... 现有配置不变
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

添加后所有 agent 调用自动落库，无需改动业务代码。

### 2. API route — 查询日志列表

**文件**: `src/app/api/agents/logs/route.ts`

查询 `mastra_ai_spans` 表，过滤 `spanType = 'AGENT_RUN'` 的记录（一次 agent 调用一条）：

- **入参**: `agentName`, `spanType`, `startedAt.from`, `startedAt.to`, `page`, `perPage`
- **返回**: 分页的日志列表，每条包含 `traceId`, `spanId`, `entityName`, `spanType`, `name`, `startedAt`, `endedAt`, `error`, `input`(摘要), `output`(摘要)

### 3. API route — 查询日志详情（trace 明细）

**文件**: `src/app/api/agents/logs/[traceId]/route.ts`

查询一条 trace 下的所有 span（包括子 span：LLM 调用、tool 调用等），返回完整 `input`/`output` 用于详情展示。

### 4. 前端页面

**路由**: `/agents/logs`

#### 列表页

- 表格列：时间、Agent 名称、类型（chat/workflow/test）、状态（成功/失败）、耗时
- 筛选栏：Agent 下拉选择、类型下拉、日期范围选择器
- 分页：复用现有分页组件模式

#### 详情面板（点击行展开）

- 使用 `Conversation` + `Message` + `MessageContent` + `MessageResponse`（ai-elements）
- 渲染为只读对话：
  - `input` → 用户气泡（`from="user"`）
  - `output` → 助手气泡（`from="assistant"`，Streamdown 渲染 Markdown）
- 无输入框——纯只读回放
- 元信息条：Agent 名称、模型、耗时、时间戳
- 如有 `error`，在 assistant 气泡中展示错误信息

### 5. 导航入口

在 `src/components/layout/sidebar.tsx` 的 `NAV_ITEMS` 新增：

```ts
{ label: "Agent 日志", href: "/agents/logs", icon: ScrollText },
```

排在 "Agent 管理" 下方。

## 数据模型（mastra_ai_spans 关键字段）

| 字段 | 用途 |
|------|------|
| `traceId` | 一次完整调用的 trace 标识 |
| `spanId` | 单个 span 标识 |
| `spanType` | 区分 AGENT_RUN / WORKFLOW_RUN / LLM 调用等 |
| `entityName` | Agent 名称（opinionAgent / evaluatorAgent / skillReviewerAgent） |
| `name` | span 可读名称 |
| `input` | 调用输入（JSON） |
| `output` | 调用输出（JSON） |
| `error` | 错误信息 |
| `startedAt` / `endedAt` | 时间与耗时 |
| `threadId` | 关联的对话线程（chat 场景） |
| `runId` | 关联的 workflow 运行 ID |

## 注意事项

- `@mastra/observability` 需安装，确认与 `@mastra/core@^1.51.0` 兼容
- `MastraStorageExporter` 写 `mastra_ai_spans`，存储落在已有的 `mastra.db`（LibSQLStore），不新增数据库
- 列表 API 只查 root span（`parentSpanId` 为空的 `AGENT_RUN`），避免内部 LLM 调用污染列表
- 详情 API 按 `traceId` 拉取该 trace 下所有 span，前端按 `parentSpanId` 构建层级后渲染对话
- 页面无输入框、无 `sendMessage` 能力——纯只读

## 范围外

- 不提供对话继续/分支/编辑能力
- 不修改现有 `/api/chat` 和 `/api/agents/test` 行为
- 不改变现有 Agents 页面的 Chat 面板
