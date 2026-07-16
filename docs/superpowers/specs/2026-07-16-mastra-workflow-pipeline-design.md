# Workflow 编排转写流水线 — 设计文档（子项目 2/4）

日期：2026-07-16
状态：已确认

## 背景

子项目 1 已完成 Mastra 基座（`@mastra/core@1.51`、newapi 动态模型工厂、opinion agent）。本子项目把抖音转写流水线（下载视频 → 提取音频 → ASR 转写 → 观点提取 → 写库）从 `pipeline-service.ts` 里的手写顺序调用改为 Mastra Workflow 编排，获得步骤级重试与运行记录持久化。

总体规划见 `2026-07-16-mastra-foundation-design.md`（4 个子项目）。

## 已确认的决策

| 决策点 | 结论 |
|---|---|
| Workflow 粒度 | **方案 A：单作品 workflow**，批量调度（查询 + 信号量并发）保持普通代码 |
| 重试策略 | 每步自动重试 2 次，耗尽后 run 失败 → `transcriptStatus = "failed"` |
| 运行持久化 | 采纳 Mastra 官方推荐：`@mastra/libsql` `LibSQLStore`，本地文件 `data/mastra.db`（绝对路径），与业务库 `data/douyin.db` 分离 |
| 对外行为 | `transcribePendingWorks` 签名、返回结构 `{total, done, failed, results}`、API 层、works 状态机全部不变 |

## 架构

### 1. 依赖与实例配置

- 新增依赖：`@mastra/libsql`
- `src/mastra/index.ts`：
  - 增加 `storage: new LibSQLStore({ url: "file:" + path.join(process.cwd(), "data", "mastra.db") })`（绝对路径，避免多进程相对路径解析不一致）
  - 注册 workflow：`workflows: { transcribeWorkWorkflow }`
- 顺手落子项目 1 终审遗留 Minor：
  - `package.json` 增加 `"engines": { "node": ">=22.13.0" }`（Mastra 的要求显式化）
  - `@types/node` 升级到 `^22`
  - `next.config.ts` 的 `serverExternalPackages` 补显式 `"@mastra/core"`（glob 之外的稳妥项），并加入 `"@mastra/libsql"`

### 2. Workflow 定义

新文件 `src/mastra/workflows/transcribe-work-workflow.ts`：

- `createWorkflow` + 4 个 `createStep` 链式（`.then()`）：
  1. **downloadStep** — 调 `downloadVideo(awemeId, videoUrl)`（`@/services/douyin/video-downloader`）
  2. **extractAudioStep** — 调 `extractAudio(videoPath, awemeId)`（`@/services/douyin/audio-extractor`）
  3. **transcribeStep** — 调 `transcribeAudio(audioPath, effectiveDuration)`（`@/services/douyin/transcriber`）；`duration=0` 视为未知按 61000ms（沿用现有 LFASR 兜底逻辑）
  4. **opinionAndSaveStep** — 调 `extractOpinion(transcript)`（非致命，失败返回 `""`）后回写 `works` 表：`transcript` + `opinionSummary` + `transcriptStatus: "done"`
- 输入 schema（zod）：`{ workId: number, awemeId: string, videoUrl: string, duration: number }`；步骤间通过 output schema 传递（videoPath / audioPath / transcript）
- 每步重试 2 次（Mastra step 重试配置，具体字段名以安装版 `.d.ts` 为准——同子项目 1 的"最小调整 + 报告说明"约定）
- 被复用的四个服务函数文件**本身不做任何修改**

### 3. pipeline-service 改造

`src/services/douyin/pipeline-service.ts`：

- `processOneWork(row)` 内部改为：
  1. 校验 `videoUrl`（缺失直接 failed，同现状）
  2. 置 `transcriptStatus: "processing"`（同现状）
  3. `mastra.getWorkflow("transcribeWorkWorkflow").createRun()` → `start({ inputData })`
  4. run 成功 → 返回 `{ awemeId, status: "done", transcript }`；run 失败 → 回写 `failed` + 返回 `{ awemeId, status: "failed", error }`
- 查询待处理、`Semaphore` 并发、结果聚合、日志风格保持不变
- `PipelineConfig` / `TaskResult` / `PipelineResult` 类型不变

### 4. 持久化收益

- 每条作品一个独立 run，Mastra 自动把运行状态/每步输入输出持久化到 `data/mastra.db`（`mastra_workflow_snapshot` 等表自动创建，无需手动迁移）
- 子项目 4 的 Agent 管理页可读取运行历史

## 错误处理

- 单步失败 → 自动重试 2 次 → 耗尽后 run 失败 → `transcriptStatus = "failed"`（对外与现状一致，只是多了重试）
- 观点提取保持非致命：`extractOpinion` 内部 catch 返回 `""`，不会触发 opinionAndSaveStep 失败
- `videoUrl` 缺失：不进 workflow，直接标 failed（与现状一致）
- `data/` 目录已存在（业务库在用），LibSQL 文件自动创建

## 测试与验证

1. `npx tsc --noEmit` + `npm run lint` + `npm run build` 通过
2. 真实转写冒烟：`POST /api/douyin/transcribe` 处理一条待转写作品 → `works` 表 transcript/opinionSummary 正常写入、状态 done
3. 持久化验证：`data/mastra.db` 生成，含本次 run 记录（`sqlite3` 或代码查询 `mastra_workflow_snapshot`）
4. 失败路径验证：人为构造坏 `videoUrl` 的作品 → 观察重试日志 → 最终 `transcriptStatus = "failed"`，API 返回 `failed` 计数正确
5. 回归：`{total, done, failed, results}` 结构与并发行为不变

## 明确不做（YAGNI）

- 批量调度进 workflow（`.foreach`）
- suspend/resume 人工介入、定时调度
- Studio 集成、运行历史 UI（子项目 4）
- 扫描（scan）流程、evaluator 改造（子项目 3）
