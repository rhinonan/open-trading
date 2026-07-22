# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## 常用命令

包管理器固定为 **pnpm**（见 `packageManager` 字段；勿再用 npm/yarn 装依赖）。

- `pnpm setup` — **新 clone 一键准备**：检查 Node、无 `.env` 时从 example 复制、创建 `data/`（或 `DATA_ROOT`）、`drizzle-kit push`
- `pnpm dev` — 启动开发服务器（http://localhost:3002）
- `pnpm build` / `pnpm start` — 生产构建 / 启动（:3002，start 监听 0.0.0.0）
- `pnpm lint` — ESLint
- `pnpm test` — vitest 单测（内存 SQLite 上跑队列/runner 逻辑）
- `pnpm db:push` — **开发期改 schema 首选**：直接对比 schema.ts 与实库，自动 ALTER TABLE，无需手写迁移 SQL
- `pnpm db:generate` — 功能稳定后生成迁移文件到 `drizzle/`（用于生产回滚与审查）
- `pnpm db:studio` — Drizzle Studio

### 数据库变更工作流（SQLite + Drizzle，无需 MongoDB）

项目已在用 Drizzle ORM + SQLite，**功能频繁变更时不需要换数据库**。正确工作流：

1. **开发迭代**：直接改 `src/db/schema.ts` → `pnpm db:push`（秒级完成，跳过迁移文件）
2. **功能稳定后**：`pnpm db:generate` 自动从 schema diff 生成迁移 SQL，提交到 `drizzle/`
3. **Docker 部署**：入口脚本自动执行 `drizzle-kit push --force`，无需手动迁移

> `push` 对 SQLite 多数 ALTER 安全（增列/增表/增索引），但**重命名列/删列可能丢数据**——此类操作应走 `generate` + 手动编辑迁移 SQL。
- `pnpm exec tsx scripts/<name>.ts` — 运行一次性维护/调试脚本（cleanup、reset-works、migrate-slug 等）
- Docker 部署：`docker compose up -d --build`（端口 **3002**，挂载 `./data`；入口脚本会 `drizzle-kit push --force`）。步骤见 [DEPLOY.md](./DEPLOY.md)

Node >= 22.13.0。新环境推荐：`corepack enable` → `pnpm install` → `pnpm setup` → 编辑 `.env` 填密钥（TikHub、newapi、百炼 ASR）→ `pnpm dev`。  
运行时 `ensureDataRoot()` 会自动创建数据目录；空库表结构仍需 `setup` / `db:push` 写入。

## 架构总览

技术栈：Next.js 16 App Router + React 19 + Tailwind v4 + shadcn（base-nova 风格，底层是 @base-ui/react 而非 Radix）+ Drizzle ORM（SQLite / better-sqlite3）+ Mastra（agent / workflow 框架）。代码注释与 UI 文案使用中文。

**项目定位**：A 股交易辅助面板。目前唯一实质功能是「抖音雷达」——监控抖音财经博主，转写其视频、用 LLM 提取观点并评估预测准确度。`stocks`、`financials`、`industry`、`sentiment` 页面是占位 UI。

### 分层

页面 (`src/app/**`) → API 路由 (`src/app/api/**`) → 服务层 (`src/services/**`) → `src/lib`（外部 API 客户端）/ `src/db`（Drizzle）/ `src/mastra`（agent 与 workflow）

### 两个 SQLite 库（勿混淆）

- `data/douyin.db` — 业务库，schema 在 `src/db/schema.ts`（bloggers → works → evaluations → prediction_items，外加 settings KV 表）。drizzle-kit 只管理这个库。
- `data/mastra.db` — Mastra 的 LibSQLStore（workflow 运行记录等），在 `src/mastra/index.ts` 配置，不归 drizzle-kit 管。

### 抖音雷达管线

1. **扫描**：`scanner-service` 经 `src/lib/douyin-api.ts` 调 TikHub API 拉取博主作品。`DOUYIN_CACHE_MODE=true` 时响应落盘缓存到 `data/api-cache/`（节省 API 配额）。
2. **转写**：works 表即任务队列（`transcriptStatus` + `claimedAt`）。`pipeline-queue.ts` 提供原子认领（`UPDATE ... WHERE status='pending'`）与僵尸恢复（processing 超 15 分钟重置）；`pipeline-runner.ts` 是进程内 globalThis 单例（固定并发 2），`kick()` 唤醒后清空队列自动歇下。每条作品跑一次 Mastra `transcribeWorkWorkflow`：下载视频 → ffmpeg 提取音频 → 百炼 Paraformer-v2 ASR（音频上传内建文件服务 → 提交公网 URL → 轮询获取结果）→ LLM 观点提取并回写业务库，每步自动重试 2 次。transcribe 路由只入队 + kick，立即返回，前端轮询进度。**此机制依赖单实例部署**，横向扩容前须改造。
3. **评估**：`evaluator-service` + `market-snapshot` 将博主预测与行情对照打分，结果写入 evaluations / prediction_items。

API 有全局与单博主两套入口：`/api/douyin/{scan,transcribe,evaluate}` 与 `/api/douyin/bloggers/[slug]/{scan,transcribe,summarize,evaluate,update-profile}`。

### Mastra 约定

- 所有 agent / workflow 注册在 `src/mastra/index.ts`；新增 agent 还须在 `src/mastra/agent-meta.ts` 的 `AGENT_META` / `AGENT_KEYS` 补同一 **注册键**（agents 页面与 skills 挂载据此展示）。
- **命名合同**：注册键 camelCase（`opinionAgent`）用于 `getAgent` / `listAgents` / `AGENT_META` / skills mount / `?agentKey=`；Agent `id` kebab-case（`opinion-agent`）仅 Mastra/chat 内部 `agentId`。业务路径经 `getRegisteredAgent(key)` 或 `mastra.getAgent(key)` 调用，禁止 `import { xxxAgent } from agents` 后直接 `.generate`（仅 `index.ts` 注册与测试可 import 单例）。
- 模型不硬编码：统一走 `newapiModel(flow)`（`src/mastra/model.ts`），每次请求时从 settings 表读取该流程配置的模型 id，经 newapi（OpenAI-compatible 网关，`NEWAPI_BASE_URL` / `NEWAPI_API_KEY`）调用。流程枚举 `LlmFlow` 定义在 `src/services/settings-service.ts`。
- LLM/workflow 结构化日志：`src/lib/llm-log.ts`（JSON 一行；含 `runId`/`workId`/`awemeId`/`batchId`/`agentKey`/`workflowId`/`model`/`latencyMs` 等；禁止打 apiKey）。
- API 路由错误：统一 `jsonError` / `logApiError`（`src/lib/api-error.ts`），catch 后写 stdout 一行 JSON（含 method/path/stack），再返回 `{ error }`；未 catch 的请求错误见 `src/instrumentation.ts` 的 `onRequestError`。
- Agent 调用日志 UI：`@mastra/observability` + `MastraStorageExporter` 写 `mastra.db`/`mastra_ai_spans`；页面 `/agents/logs`，API `/api/agents/logs`（列表 root `AGENT_RUN`）与 `/api/agents/logs/[traceId]`（详情）。与业务 `llm-log`、workflow snapshot `/api/agents/runs` 分层，勿混用。
- 聊天走 `/api/chat?agentKey=<key>`，用 `@mastra/ai-sdk` 的 `handleChatStream` 流式输出；前端在 `src/components/agents` + ai-elements / streamdown。
- 写操作 / 设置页鉴权：`src/lib/admin-auth.ts` + `src/lib/admin-session.ts`。未设 `ADMIN_TOKEN` 时放行；设置后写接口需 Bearer / `x-admin-token` **或** 有效 `ot_session`（`/login` 用同一 token 登录，无注册）。`settings/layout` 服务端门禁 `/settings/*`。
- `next.config.ts` 的 `serverExternalPackages` 排除了 `@mastra/*`（Node-only 依赖），新增此类依赖时照做。

### 其他

- Tailwind v4 无 config 文件，主题变量在 `src/app/globals.css`；shadcn 组件在 `src/components/ui`，图标用 lucide-react。
- 设计文档在 `docs/superpowers/specs/`，实施计划在 `docs/superpowers/plans/`——了解某功能的来龙去脉先看这里。

## 架构纪律（桌面/SaaS 双形态预留，2026-07 约定）

以下规矩约束**新增代码**（存量不强制回改），目的是让未来的双形态改造只需要动适配层：

1. **DB 调用一律写 `await`**：即使 better-sqlite3 驱动是同步的，调用处也写 `await db...`（无害），保证将来换异步驱动（libsql / Postgres）时调用面零改动。
2. **落盘路径一律走 `dataPath()`**（`src/lib/data-root.ts`）：禁止新增 `process.cwd()` 拼 `data/` 路径；数据目录整体位置只由 `DATA_ROOT` 环境变量决定（桌面端将指向 userData 目录）。打开 SQLite / 首次写盘前调用 `ensureDataRoot()`（`db/index.ts`、`mastra/index.ts` 已做）。
3. **新外部服务的密钥/配置进 settings 表**（经 settings-service 读写），不新增 env-only 读取；env 只作为部署级默认值。
4. **业务层不感知部署形态**：形态差异（DB 驱动、密钥来源、runner 驱动、数据路径）只允许出现在适配层；业务代码禁止出现 `if (isDesktop)` 之类分支。
5. **表行类型从 schema 派生**：一律 `typeof <table>.$inferSelect`，禁止手写 interface 再用 `as` 断言。

## 已知技术债（2026-07 架构评审）

按优先级排列，修复后请从此列表移除对应条目：

1. **API 缓存永不过期**：`src/lib/douyin-api.ts` 开启 `DOUYIN_CACHE_MODE` 后 `fetchUserPosts` 分页响应被永久冻结，扫描发现不了博主新作品；且 `writeCache` 无条件落盘，`data/api-cache/` 无限增长。缓存应定位为开发期回放，生产关闭或加 TTL。
2. **API 路由成对复制**：全局/单博主路由重复（管线内部重复已在 2026-07 队列化改造中消除）。
3. **扫描器 N+1**：`scanner-service.ts` 逐条查重 + 逐条插入，应批量 `inArray` 查重 + `onConflictDoNothing` 批量插入（`works` 常用索引已在队列化改造中补齐）。
4. **JSON 文本字段缺乏解析**：`statistics`、`evidence`、`relatedSymbols` 等 JSON 文本字段建议在 service 边界加 zod 解析（原类型断言问题已于 2026-07 修复：行类型改为 `$inferSelect` 派生）。
5. **evaluator 为空壳**（有意暂缓，等行情数据源就绪）：当前 API 返回看似成功的空结果，建议改为明确的 disabled 标记，避免前端误判。
