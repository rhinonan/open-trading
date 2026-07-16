# Mastra 基座 + LLM 场景 Agent 化 — 设计文档（子项目 1/4）

日期：2026-07-16
状态：已确认

## 背景与总体规划

项目决定将 AI 底层从直连 `@anthropic-ai/sdk` 迁移到 Mastra 框架（1.0，2026-01 发布），分 4 个子项目落地：

1. **Mastra 基座 + LLM 场景 Agent 化**（本文档）
2. Workflow 编排转写流水线（下载→ffmpeg→ASR→观点提取）
3. 收盘评判落地（评判 agent + 行情快照 tool + 结构化输出）
4. Agent 管理页落地（`/agents` 页面真实化）

本子项目只做基座：引入 Mastra、接通 newapi 网关、把唯一在用的 LLM 场景（观点提取）Agent 化、移除 Anthropic SDK。**对外行为完全不变。**

## 已确认的决策

| 决策点 | 结论 |
|---|---|
| newapi 接入方式 | **内联动态模型配置**（方案 A）：`model` 传异步函数，运行时返回 `{ url, id, apiKey }`。不做自定义 MastraModelGateway |
| settings 存储格式 | 不变——继续存裸模型名（如 `claude-sonnet-4-20250514`），零数据迁移 |
| 调用协议 | 从 Anthropic `/v1/messages` 换为 OpenAI 兼容 `/v1/chat/completions`（newapi 对所有模型原生支持） |
| Mastra storage/memory/Studio | 本期不引入（子项目 2 做 workflow 时再评估 storage） |
| 本期范围外 | evaluator stub、转写流水线结构、settings 表/API/设置页 UI 均不动 |

## 架构

### 1. 依赖与构建配置

- 新增依赖：`@mastra/core`、`zod`
- 移除依赖：`@anthropic-ai/sdk`
- `next.config.ts`：增加 `serverExternalPackages: ["@mastra/*"]`（Mastra 含 Node-only 模块，必须排除出打包）

### 2. 目录结构

```
src/mastra/
├── index.ts             # Mastra 实例：new Mastra({ agents: { opinionAgent } })
├── model.ts             # newapiModel(flow) 动态模型工厂
└── agents/
    └── opinion-agent.ts # 观点提取 agent
```

**`src/mastra/model.ts`** — 全项目唯一的模型解析入口，后续子项目的 agent 一律复用：

- 导出 `newapiModel(flow: LlmFlow)`，返回 Mastra Agent 可接受的异步 model 函数
- 函数体：`getLlmModel(flow)` 读 settings 表（缺省回落 `DEFAULT_LLM_MODEL`）→ 返回 `{ url: process.env.NEWAPI_BASE_URL || DEFAULT_NEWAPI_BASE_URL, id: <模型名>, apiKey: process.env.NEWAPI_API_KEY }`
- `NEWAPI_API_KEY` 缺失时抛错（与现有 `getAnthropicClient` 行为一致），由调用方 catch

**`src/mastra/agents/opinion-agent.ts`**：

- `instructions`：现有 `opinion-service.ts` 中的 SYSTEM_PROMPT 一字不改地迁移
- `model: newapiModel("opinion")`

### 3. 调用方改造

`src/services/douyin/opinion-service.ts` 的 `extractOpinion(transcript)`：

- 改为通过 Mastra 实例调用 opinion agent 的 `generate`
- 采样参数保持一致：maxTokens 200、temperature 0.3、输入截断 `slice(0, 4000)`
- **行为合同不变**：空/空白转写返回 `""`；任何失败（含模型解析失败、API 失败）`console.error` + 返回 `""`，绝不抛出

### 4. 旧代码清理

- 删除 `src/lib/llm.ts`（`getAnthropicClient` / `callClaude` / `parseClaudeJson`——最后者本就无调用方）
- `src/lib/llm-constants.ts` 保留不动，`src/services/settings-service.ts` 的 `DEFAULT_LLM_MODEL` 导入改为直接来自 `@/lib/llm-constants`
- `npm uninstall @anthropic-ai/sdk`

### 5. 明确不变的部分

- `settings` 表、`settings-service` 接口（`getLlmModel` 等）、`/api/settings/llm`、`/api/llm/models`、设置页 UI
- 环境变量：仍只用 `NEWAPI_API_KEY`、`NEWAPI_BASE_URL`
- evaluator stub（`evaluator-service.ts`）
- 转写流水线（`pipeline-service.ts`）除 `extractOpinion` 内部实现外的一切

## 错误处理

- settings 读取失败/无记录 → `DEFAULT_LLM_MODEL` 兜底（现有 `getLlmModel` 逻辑，不变）
- `NEWAPI_API_KEY` 未配置 → model 函数抛错 → `extractOpinion` catch → 返回 `""`
- newapi 不可达 / 模型不存在 → generate 抛错 → 同上非致命兜底

## 测试与验证

项目无测试框架，沿用现状：

1. `npx tsc --noEmit` + `npm run lint` + `npm run build` 通过
2. 手动冒烟：触发一次转写 → newapi 后台确认请求走 `/v1/chat/completions` 且模型与设置页所选一致 → `works.opinionSummary` 正常写入
3. 动态模型验证：设置页切换观点提取模型 → 再触发转写 → newapi 日志确认模型已切换（无需重启服务）
4. 回归：设置页模型下拉、保存、降级显示全部正常（本期未改动这些代码，冒烟确认即可）

## 明确不做（YAGNI）

- 自定义 MastraModelGateway、模型 ID 前缀迁移
- Mastra storage / memory / Studio / `@mastra/ai-sdk` 流式集成
- 评判 agent、workflow 编排、Agent 管理页（后续子项目）
- 重试/超时策略调整（保持与现状一致的单次调用）
