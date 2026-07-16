# LLM 模型动态选择 + 设置页拆分 — 设计文档

日期：2026-07-16
状态：已确认

## 背景与目标

当前 LLM 模型名硬编码在 `src/lib/llm.ts:33`（`claude-sonnet-4-20250514`），无法在不改代码的情况下切换模型。newapi 聚合网关（`NEWAPI_BASE_URL`）提供 `GET /v1/models` 接口可列出全部可用模型，且对 `/v1/messages`（Anthropic 协议）做协议转换，非 Claude 模型（deepseek、kimi 等）同样可通过 `@anthropic-ai/sdk` 调通。

目标：

1. 设置页可从 newapi 实时拉取模型列表，按流程（观点提取 / 收盘评判）分别选择模型并持久化
2. 设置 UI 拆分为「基础设置」和「抖音雷达」两个页面

## 已确认的需求决策

| 决策点 | 结论 |
|---|---|
| 作用范围 | 按流程分别选择：观点提取、收盘评判各一个模型 |
| 列表拉取时机 | 设置页打开时实时拉取，不落库缓存 |
| 列表过滤 | 显示 newapi 返回的全部模型，不过滤 |
| 调用协议 | 保留 `@anthropic-ai/sdk`（newapi 做协议转换，任意模型可用） |
| 选择存储 | 新增通用 `settings` key-value 表（SQLite + drizzle） |
| 页面结构 | `/settings` 基础设置（主题 + LLM 模型），`/settings/douyin` 抖音雷达 |
| 导航方式 | 侧边栏保留单一「设置」入口，设置内部顶部页签切换 |

## 架构

### 1. 数据层

`src/db/schema.ts` 新增通用设置表：

```ts
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});
```

使用的 key：

- `llm_model_opinion` — 观点提取模型
- `llm_model_evaluation` — 收盘评判模型

表中查不到时兜底默认值 `claude-sonnet-4-20250514`（从 `llm.ts` 的硬编码抽成导出常量 `DEFAULT_LLM_MODEL`）。

### 2. 服务层

新增 `src/services/settings-service.ts`：

- `getSetting(key: string): Promise<string | null>`
- `setSetting(key: string, value: string): Promise<void>`（upsert）
- `getLlmModel(flow: "opinion" | "evaluation"): Promise<string>` — 查表，空/缺失时返回 `DEFAULT_LLM_MODEL`

### 3. API 路由

- `GET /api/llm/models` — 服务端用 `NEWAPI_BASE_URL` + `NEWAPI_API_KEY` 请求 newapi `GET /v1/models`，返回排序后的模型 id 列表（不过滤、不落库）。newapi 不可达或返回非 2xx 时返回 502 及错误信息
- `GET /api/settings/llm` — 返回 `{ opinionModel, evaluationModel }`（已含默认值兜底）
- `PUT /api/settings/llm` — body `{ opinionModel?, evaluationModel? }`，逐字段校验为非空字符串后 upsert 写库；返回更新后的完整值

### 4. 调用方接线

- `src/services/douyin/opinion-service.ts` 的 `extractOpinion`：调用 `callClaude` 时传 `model: await getLlmModel("opinion")`
- evaluator（`evaluator-service.ts`）目前是 stub：本次仅保证「收盘评判模型」可存可读，将来重写 evaluator 时直接调 `getLlmModel("evaluation")`
- `src/lib/llm.ts` 的 `callClaude` 签名与默认值兜底逻辑不变，仅将硬编码模型名替换为 `DEFAULT_LLM_MODEL` 常量

### 5. UI

**路由结构：**

- `/settings` — 基础设置：主题偏好卡片（现有）+ 新增「LLM 模型」卡片 + 「更多设置即将上线」占位卡片（保留）
- `/settings/douyin` — 抖音雷达：现有博主管理整体迁移（添加博主、博主列表、扫描/转写/评判操作、消息反馈区）

**导航：**

- 侧边栏保持单一「设置」入口（`/settings`）
- 新增 `src/app/settings/layout.tsx`：顶部渲染「基础设置 / 抖音雷达」页签（按当前路由高亮），下方渲染子页面
- `src/components/layout/header.tsx` 面包屑映射补充 `"/settings/douyin": "抖音雷达"`

**LLM 模型卡片行为：**

- 页面打开时并行请求 `GET /api/llm/models` 和 `GET /api/settings/llm`
- 两个下拉框：观点提取模型、收盘评判模型；选中即 `PUT` 保存，成功/失败通过卡片内消息区反馈
- 模型列表拉取失败时：下拉降级为文本显示当前已保存模型 + 错误提示；已保存的选择不受影响

## 错误处理

- 设置读取失败或无记录 → 返回 `DEFAULT_LLM_MODEL`，LLM 调用永不因设置缺失而失败
- 观点提取失败非致命（返回空串）的现有行为不变
- `GET /api/llm/models` 上游失败 → 502 + 错误信息，前端降级显示
- `PUT /api/settings/llm` 校验失败 → 400

## 测试与验证

项目无测试框架，沿用现状：

1. `tsc` typecheck + lint 通过
2. 手动冒烟：打开基础设置页确认列表拉取 → 切换观点提取模型 → 触发一次转写 → 通过 newapi 后台日志核对实际调用的模型
3. 页面拆分回归：`/settings` 与 `/settings/douyin` 页签切换、面包屑、抖音雷达各按钮功能正常

## 明确不做（YAGNI）

- 模型列表落库缓存 / 手动刷新按钮
- 模型列表过滤或分组
- temperature / maxTokens 等其他 LLM 参数的 UI 配置
- evaluator 的实际 LLM 评判实现（另行立项）
