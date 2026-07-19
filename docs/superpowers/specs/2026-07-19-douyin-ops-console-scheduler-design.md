# 抖音雷达运维台 + JobScheduler 设计

> 日期：2026-07-19  
> 状态：已确认  
> 分支：`style/intelligence-console`  
> 背景：7/19 master-detail 重构后，侧栏扫描交互受损、作品表丢失勾选/批量、评判 cron UI 被删、扫描/处理从未有进程内定时。本设计一次补齐运维台与四环调度。

## 1. 目标

将 `/settings/douyin` 做成完整运维台，并用 **JobScheduler** 统一四类定时任务：

1. **资料更新**（profile）— 与作品扫描分离  
2. **作品扫描**（scan）  
3. **处理队列 kick**（pipeline）— 仅 kick，不自动重试 failed  
4. **观点评判**（eval）— 含 not_yet 重评  

同时：修复侧栏扫描交互与反馈、恢复勾选批量（含评判）、博主 **停用（disabled）**、删除旧 `eval-schedule` API/键。

### 非目标（本轮不做）

- 多实例选主 / 分布式锁（保持单进程假设，文档声明）  
- pipeline 定时自动把 failed 重置为 pending  
- 侧栏/工具条博主多选批量（工具条 = 全部启用博主；侧栏 = 单博主）  
- 改转写/评判 LLM 管线、ASR、TikHub 协议本身  

## 2. 架构

```
┌─────────────────────────────────────────────────────────┐
│  Settings UI                                            │
│  /settings/douyin      运维台（操作）                     │
│  /settings/schedule    调度 Tab（配置四 job）             │
└───────────────┬─────────────────────┬───────────────────┘
                │                     │
                ▼                     ▼
     REST: scan/batch/…      REST: /api/settings/schedules
                │                     │
                ▼                     ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│  业务入口（手动）      │   │  JobScheduler (globalThis)    │
│  scan / profile /    │   │  每 60s tick                  │
│  pipeline kick /     │   │  读 schedule.* 配置            │
│  eval enqueue        │   │  cron 命中 → handler          │
└──────────┬───────────┘   └──────────────┬───────────────┘
           │                              │
           ▼                              ▼
┌──────────────────┐  ┌─────────────┐  ┌──────────────────┐
│ scanner /        │  │ pipeline-   │  │ eval-queue +     │
│ update-profile   │  │ runner.kick │  │ eval-runner.kick │
└──────────────────┘  └─────────────┘  └──────────────────┘
```

### 模块边界

| 模块 | 职责 | 禁止 |
|------|------|------|
| `src/services/scheduler/*` | 注册表、60s tick、cron 命中、last_run/last_error、`runJob` | TikHub/ASR/LLM 细节 |
| `pipeline-runner` / `eval-runner` | 队列消费 + `kick()` | 不再读 schedule settings、不再自建 cron |
| `scanner-service` / blogger profile | 纯业务 | 不感知 cron |
| `/settings/douyin` | 操作、批量、只读进度 | 不编辑 cron |
| `/settings/schedule` | 四 job 配置、立即运行 | 不做作品表格 |

### 单实例假设

与现 pipeline/eval runner 相同：**依赖单进程**。多副本会重复 profile/scan/eval。桌面/多实例改造时只替换 scheduler 适配层，handler 不动。

## 3. Job 注册表

| jobId | 到点做什么 | 不做什么 | 博主过滤 |
|-------|------------|----------|----------|
| `profile` | 对 **启用中** 博主 `update-profile` | 不扫作品 | `disabled=0` |
| `scan` | 对 **启用中** 博主 `scanBlogger` / 全量扫 | 不改资料 | `disabled=0` |
| `pipeline` | **仅** `getTranscribeRunner().kick()` | 不重置 failed、不改 status | n/a |
| `eval` | `enqueueForEvaluation` + `enqueueReevaluation` + `getEvalRunner().kick()` | 与现网一致 | **不过滤**停用博主的已有作品 |

### Settings 键（全新）

```
schedule.<jobId>.enabled      # "true" | "false"
schedule.<jobId>.cron         # 5 字段
schedule.<jobId>.last_run_at  # unix 秒字符串
schedule.<jobId>.last_error   # 可选，最近一次错误摘要
```

`jobId` ∈ `profile` | `scan` | `pipeline` | `eval`。

### 默认值

| jobId | enabled 默认 | cron 默认 | 说明 |
|-------|--------------|-----------|------|
| `profile` | `false` | `0 8 * * *` | 每日 08:00 更新资料 |
| `scan` | `false` | `30 8 * * *` | 每日 08:30 扫作品 |
| `pipeline` | `true` | `*/15 * * * *` | 每 15 分钟 kick |
| `eval` | 迁移旧键，缺省 `true` | 迁移旧键，缺省 `5 17 * * 1-5` | 工作日 17:05 |

### 旧键迁移与删除

启动或首次 `GET /api/settings/schedules` / `ensureSchedulerStarted` 时执行 **幂等迁移**：

| 旧键 | 新键 |
|------|------|
| `eval_schedule_enabled` | `schedule.eval.enabled` |
| `eval_schedule_cron` | `schedule.eval.cron` |
| `eval_last_run_at` | `schedule.eval.last_run_at` |

规则：

1. 若新键尚无值且旧键存在 → 写入新键。  
2. 迁移后 **删除旧键**（新键已有则只删旧键）。  
3. 业务代码不得再读写旧键；仅迁移函数可引用旧键名。  
4. **删除** 路由 `src/app/api/settings/eval-schedule/`（无代理、无 410 长期并存）。  
5. **删除** `eval-runner` 内 `setInterval(scheduledTick)` 及 cron 相关逻辑。

## 4. JobScheduler 内核

### 目录

```
src/services/scheduler/
  job-scheduler.ts      # globalThis 单例，tick，runJob
  job-registry.ts       # 元数据 + handler 绑定
  migrate-eval-keys.ts  # 旧→新，幂等
  jobs/
    profile.ts
    scan.ts
    pipeline.ts
    eval.ts
```

### Tick（60s）

对每个 job：

1. `enabled !== true` → 跳过  
2. 解析 cron；读 `last_run_at`  
3. 在 `(last_run_at, now]` 按分钟步进，任一分钟 `cronMatches` → 应触发  
4. 若该 job 已在 `runningJobs` 中 → 跳过（防重入）  
5. `await handler()`  
6. **无论成功失败** 写 `last_run_at = now`  
7. 失败：结构化 log + 写 `last_error`；成功：清空 `last_error`

失败仍写 `last_run_at` 的原因：避免外部 API 故障时每分钟打爆配额。

### `runJob(id, { force?: boolean })`

- `force: true`：忽略 cron/窗口，供「立即运行」与运维 API  
- 仍尊重「同 job 已在跑则跳过/返回 busy」  
- 返回结构化结果（成功摘要或 error）

### 启动

`ensureSchedulerStarted()`：

1. 跑 eval 键迁移  
2. 启动 60s interval（HMR 下 globalThis 防双实例）  
3. 确保 `getTranscribeRunner()` / `getEvalRunner()` 已创建（消费端就绪）  
4. 立即空跑一轮 tick（未到点不 fire）

在现有会拉起 eval runner 的服务冷启动路径上改为调用 `ensureSchedulerStarted()`。

### 并发

- 同一 job 不重入  
- 不同 job 可并行  

## 5. 博主停用 `disabled`

### Schema

`bloggers` 表新增：

- `disabled`：integer，`0` = 启用，`1` = 停用，默认 `0`  
- 经 drizzle schema + `db:generate` / `db:push` 落地  

### 语义

| 场景 | 行为 |
|------|------|
| 调度 `profile` / `scan` | 仅 `disabled=0` |
| 工具条「全部…」 | 仅启用博主 |
| 侧栏 | 显示全部；停用行降透 +「已停用」标记；可点进看历史作品 |
| 单博主手动 scan / profile / 转写 | **允许**（排障不锁死） |
| 前台 `/douyin` | **隐藏**停用博主 |
| 定时 / 手动 eval | 停用博主的**已有作品仍参与** |
| 删除 | 硬删不变；停用 ≠ 删除 |

### API

```
PATCH /api/douyin/bloggers/[slug]
body: { disabled: boolean }
→ { success: true, blogger } | { error }
```

若该 route 已有 DELETE，同文件扩展 PATCH。写操作走 `requireAdmin`。

## 6. 运维页 `/settings/douyin`

### 6.1 布局

```
┌ Card: 抖音雷达管理 ──────────────────────────────────────────┐
│ 标题 + 链接到「调度」Tab                                      │
│ 工具条：添加 | 更新资料 | 扫描作品 | 全部转写 | 立即评判         │
│ 只读状态条：评判进度 | runner 提示 | → 调度配置                 │
│ ┌──────────┬───────────────────────────────────────────────┐ │
│ │ Sidebar  │  Message banner（按动作分流）                   │ │
│ │          │  批量条（有勾选时）                              │ │
│ │          │  WorksTable + checkbox + 分页                   │ │
│ └──────────┴───────────────────────────────────────────────┘ │
│ WorkDrawer | AddBloggerDialog                                │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 侧栏单博主操作（hover）

图标（tooltip）：**扫描新作品 | 更新资料 | 停用/启用 | 删除**

交互要求：

- 操作区使用 `opacity-0 group-hover:opacity-100`（或等效），**禁止** `hidden` 导致 hover 目标消失  
- 外包 `TooltipProvider`  
- `TooltipTrigger` 与 `sidebar.tsx` 一致：`render` 传入完整可点按钮，click 落在真实 DOM  
- 停用态：行样式区分；图标切换为「启用」

#### 扫描成功反馈

- 文案：`已扫描「昵称」：新增 N 条`（使用 API `newWorks`）  
- 当前选中该博主 → `WorksTable` 强制刷新  
- **不**附带「查看 Agent 日志」

#### 消息分流

| 动作 | 成功是否链 `/agents/logs` |
|------|---------------------------|
| scan / profile / delete / disable | 否 |
| 单行或批量 transcribe / summarize / evaluate | 是 |
| 工具条全部转写 / 立即评判 | 是 |

### 6.3 工具条（全部启用博主）

| 按钮 | 行为 |
|------|------|
| 添加博主 | 现有 Dialog |
| 更新资料 | 全部 `disabled=0` 博主 update-profile |
| 扫描作品 | 全部启用博主 scan |
| 全部转写 | 现有全局/按博主 transcribe 入队 + kick |
| 立即评判 | `POST /api/douyin/evaluate` |

无博主多选；始终「全部启用」。侧栏负责单博主。

### 6.4 WorksTable：勾选 + 批量

- 首列 checkbox；表头本页全选  
- **切换博主**：清空选择  
- **翻页**：保留已选 id（跨页批量）；批量条显示「已选 N」  
- 批量动作：`转写` | `提取观点` | `评判`  

#### Batch API

```
POST /api/douyin/works/batch
body: { workIds: number[], action: "transcribe" | "summarize" | "evaluate" }
```

- `evaluate` → `enqueueForEvaluation({ workIds })` + `getEvalRunner().kick()`  
- 返回保持 `{ total, succeeded, failed, errors[] }`  
- 单行操作保留；可用性规则与现网一致（transcript/eval 门闩）  
- 入队后刷新；`processing` 时 5s 轮询不变  

### 6.5 状态条

- 轮询 `GET /api/douyin/evaluate/progress`（可沿用旧逻辑）  
- 展示 done / pending / processing / failed  
- 链接：`/settings/schedule`  

## 7. 调度 Tab `/settings/schedule`

### 导航

`src/app/settings/layout.tsx` 的 `TABS` 增加：

```
基础设置 | 抖音雷达 | 调度 | Skills
```

`href: "/settings/schedule"`。

### UI

四张卡片（或一表四行），每 job：

- 名称 + 一句话说明  
- enabled 开关  
- cron 输入 + 按 job 的预设（如评判：工作日收盘；pipeline：每 15 分钟）  
- 下次触发预览（`describeCronNext`）  
- 上次运行 / 上次错误  
- 「立即运行」→ `POST /api/settings/schedules/run`  

页头说明：**单实例进程内调度；多副本请勿开启。**

### API

```
GET  /api/settings/schedules
→ {
  jobs: Array<{
    id: string
    label: string
    description: string
    enabled: boolean
    cron: string
    lastRunAt: number | null
    lastError: string | null
    nextRun: string
  }>
}

PUT  /api/settings/schedules
body: { id: string, enabled?: boolean, cron?: string }
→ 校验 cron 为 5 字段；写 settings；返回更新后的 job

POST /api/settings/schedules/run
body: { id: string }
→ runJob(id, { force: true })
```

写接口 `requireAdmin`。

**删除** `src/app/api/settings/eval-schedule/`。

## 8. 数据流摘要

### 手动扫描（侧栏）

```
POST /api/douyin/bloggers/:slug/scan
  → scanBlogger（不拦截 disabled）
  → { newWorks }
  → banner + 条件刷新 WorksTable
```

### 工具条扫描全部

```
对 disabled=0 的每个 slug 调 scan（或 /api/douyin/scan 内过滤停用）
  → 汇总成功/失败
```

### 批量评判

```
POST /api/douyin/works/batch { action: "evaluate", workIds }
  → enqueue + kick → 刷新 + 轮询
```

### 定时

```
JobScheduler tick → enabled && cron 窗口 && !running
  → handler → last_run_at (+ last_error if fail)
```

## 9. 错误处理

| 场景 | 行为 |
|------|------|
| 扫描 TikHub 失败 | API 错误 + banner error；不刷表 |
| 批量部分失败 | succeeded/failed/errors；banner 摘要 |
| job handler 抛错 | log + last_error + 仍更新 last_run_at |
| cron 非法 | PUT 400，不落库 |
| job 正在跑时立即运行 | 返回 busy / 明确提示 |
| 无 TooltipProvider | 侧栏自带 Provider |

## 10. 测试要点

- **单元**：job-scheduler — 窗口命中、enabled 跳过、重入跳过、last_run + last_error  
- **单元**：batch `evaluate` 入队；profile/scan handler 跳过 `disabled=1`  
- **单元/集成**：旧 eval 键迁移幂等且删除旧键  
- **手工**：侧栏 hover 四操作可见可点；扫描 N 条与表刷新；无误挂 Agent 日志；批量三动作；调度 Tab 保存/立即运行；停用后工具条与定时跳过、前台隐藏、历史作品仍可评  

## 11. 文件清单（实施对照）

| 区域 | 路径 |
|------|------|
| Schema | `src/db/schema.ts`（`bloggers.disabled`）+ drizzle 迁移 |
| Scheduler | `src/services/scheduler/**`；`eval-runner` 去 cron |
| API 新增 | `/api/settings/schedules`、`/run`；blogger `PATCH` |
| API 修改 | `works/batch` 支持 `evaluate`；全量 scan 过滤 disabled |
| API 删除 | `/api/settings/eval-schedule` |
| 运维 UI | `src/app/settings/douyin/*`（page、Sidebar、WorksTable、工具条/状态条） |
| 调度 UI | `settings/layout.tsx` Tab；`settings/schedule/page.tsx` |
| 前台 | `/douyin` 列表过滤 `disabled` |
| 迁移 | `migrate-eval-keys.ts`；settings 旧键删除 |

## 12. 操作矩阵

| 能力 | 侧栏 hover（单博主） | 工具条（全部启用） | 调度 job |
|------|----------------------|--------------------|----------|
| 更新资料 | ✅ | ✅ | `profile` |
| 扫描作品 | ✅ | ✅ | `scan` |
| 停用/启用 | ✅ | — | —（影响谁进定时/工具条） |
| 删除 | ✅ | — | — |
| 转写/观点/评判 | 表格单行 + 勾选批量 | 全部转写 / 立即评判 | `pipeline` kick / `eval` |

## 13. 决策记录

| 项 | 决定 |
|----|------|
| 架构 | JobScheduler 中心（方案 C） |
| 扫描定时 | profile / scan 分 job |
| 处理定时 | 仅 kick |
| 批量 | 转写 + 观点 + 评判 |
| 调度 UI | `/settings/schedule` 独立 Tab |
| settings 键 | 全新 `schedule.*`；旧 eval 键迁移后删除 |
| 旧 eval-schedule API | 本轮删除 |
| 工具条范围 | 全部启用博主 |
| 侧栏 | 扫描 / 资料 / 停用 / 删除 |
| job 失败 | last_run_at + last_error |
| 停用与 eval | 已有作品仍参与定时评判 |
| 前台 | 隐藏停用博主 |
