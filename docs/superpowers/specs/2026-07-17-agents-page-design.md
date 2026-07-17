# Agent 管理页落地 — 设计文档（子项目 4/4）

日期：2026-07-17
状态：待用户审阅

## 背景

Mastra 迁移子项目 1（基座 + opinion agent）与子项目 2（transcribe-work workflow + LibSQL 运行持久化）已完成。`/agents` 页面目前是纯前端占位。本子项目把它变成真实的 Agent 管理页。子项目 3（收盘评判）因行情数据源未就绪暂缓，本页面不包含评判相关内容，但结构上为将来新增 agent 留好扩展位（新 agent 只需注册 + 补一行元数据）。

## 已确认的决策

| 决策点 | 结论 |
|---|---|
| 页面内容 | ①Agent 列表与配置展示 ②Workflow 运行历史 ③Agent 手动测试运行；**不含**运行记录清理 |
| 后端形态 | **方案 A：自建 3 条 Next API 路由**，不挂 Mastra 内置 server |
| 模型显示 | 从 settings 表实时解析（`getLlmModel(flow)`），不调用 agent 的模型解析函数（避免副作用） |

## 架构

### 1. Agent 元数据

新增 `src/mastra/agent-meta.ts`：

```ts
export interface AgentMeta {
  flow: LlmFlow;        // 模型选择归属的流程（settings 表的 key 维度）
  description: string;  // 页面展示用中文描述
}
export const AGENT_META: Record<string, AgentMeta> = {
  opinionAgent: { flow: "opinion", description: "抖音博主观点摘要提取" },
};
```

将来新增 agent：注册进 Mastra 实例 + 在此表补一行即可上页面。

### 2. API 路由（3 条新路由）

- `GET /api/agents`
  - `mastra.listAgents()` 遍历，合 `AGENT_META`，返回 `[{ key, name, description, flow, model, instructions }]`
  - `model` 来自 `getLlmModel(meta.flow)`；`instructions` 从 agent 实例读取（读取方法以安装版 `.d.ts` 为准，我们的 instructions 是静态字符串）
  - 无元数据的 agent 也要返回（description/flow 置空），避免注册了却"隐身"
- `GET /api/agents/runs?page=0&perPage=10`
  - `mastra.getWorkflow("transcribeWorkWorkflow").listWorkflowRuns({ page, perPage })`
  - snapshot 为 string 时 `JSON.parse`；防御式提取每步状态；解析失败时该 run 标记 `parseError: true`，不影响其余行
  - 返回 `{ runs: [{ runId, workflowName, status, createdAt, updatedAt, steps: [{ id, status }] }], total }`
  - page 默认 0，perPage 默认 10（上限 50）
- `POST /api/agents/test`
  - body `{ agentKey: string, input: string }`；校验：agentKey 必须在 `listAgents()` 中，input 非空字符串，超 4000 字符截断
  - `agent.generate(input, { modelSettings: { maxOutputTokens: 500, temperature: 0.3 } })` → 返回 `{ text }`
  - 失败 → 500 `{ error }`；未知 agentKey → 404；参数非法 → 400

### 3. UI（重写 `src/app/agents/page.tsx`，client 组件）

- **Agent 卡片区**：每个 agent 一张卡
  - 名称、描述、所属流程标签、当前模型（font-mono）
  - instructions 默认折叠（展开/收起）
  - 内嵌测试框：textarea + 「测试运行」按钮 + 结果区（成功显示返回文本 / 失败红字），运行中 loading 并禁用按钮
- **运行历史卡片**：
  - 表格行：runId 缩略（前 8 位）、状态 badge（success 绿 / failed 红 / 其他灰）、创建时间、耗时（updatedAt - createdAt）
  - 行点击展开：每步 `id + status` 列表；`parseError` 行显示"快照解析失败"
  - 分页：上一页/下一页 + 当前页码，`total` 为 0 时显示"暂无运行记录"占位
- 页面标题区保留现有文案风格；面包屑/侧边栏已有 `/agents` 映射不动

### 4. 错误处理

- 三条 API 全部 try/catch → 非 2xx `{ error }`，风格同现有路由
- 前端每个区块独立 loading/error 态，任一接口失败不影响其他区块
- snapshot 解析失败行内降级，不炸页面

## 测试与验证

1. `npx tsc --noEmit` + `npm run lint` + `npm run build` 通过
2. curl 冒烟：`GET /api/agents`（含 opinionAgent 与当前模型）、`GET /api/agents/runs`（结构正确，空历史 `total: 0`）、`POST /api/agents/test`（真实调一次 LLM 返回文本；坏 agentKey 404；空 input 400）
3. 页面手动冒烟：卡片渲染、instructions 折叠、测试运行往返、运行历史分页/展开/空态

## 明确不做（YAGNI）

- 运行记录清理/TTL（用户未选；mastra.db 增长问题另行处理）
- 实时日志、任务队列、workflow 手动重跑/恢复
- 评判 agent 及其展示（子项目 3 暂缓）
- Mastra 内置 server / Studio 集成
