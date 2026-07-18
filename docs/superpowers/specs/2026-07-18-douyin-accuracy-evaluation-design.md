# 抖音博主准确度评判 — 设计文档（子项目 B）

日期：2026-07-18
状态：待用户审阅

## 背景

转写管线（子项目 2）已稳定运行，作品 transcript + opinionSummary 持续产出。评判功能（原子项目 3）前置障碍（行情数据源）通过子项目 A 的 a-stock-data skill + sandbox 执行能力解除。本子项目落地完整的准确度评判闭环：五档判定、长期预测标记重评、定时与手动双触发。

## 已确认的决策

| 决策点 | 结论 |
|---|---|
| 数据模型 | **作品为中心重建**：`works` 加 `evalStatus` 字段，`prediction_items` 直接挂 `workId`；删除 `evaluations` 表。零真实数据 → 零迁移成本 |
| 数据获取 | **全 agentic**：评判 agent 自主决定取什么行情数据、现场写 Python 代码 execute |
| 触发时机 | **定时自动 + 手动兼有**：cron 表达式驱动定时入队 + 页面按钮手动触发 |
| 「当前不适合」建模 | **条目级 `not_yet` + 到期重评**：每条预测独立判定，含 `verifiableAfter` 到期日，定时扫描自动重评 |
| 到期重评策略 | **整作品重跑**（旧条目事务内先删后插），逻辑最简、结果自洽 |
| 准确率聚合口径 | `(correct + 0.5 × mostly_correct) / (correct + mostly_correct + incorrect)`，`not_yet` 和 `not_applicable` 不进分母；无可判条目显示「暂无」 |
| 评判期限口径 | 「短期/近期」→ 5 个交易日；「中期」→ 30 天；有方向无明确期限 → 默认 5 个交易日 |

## 架构

### 1. Schema 改造

#### Works 新增字段

```ts
// 新增列（与 transcriptStatus 字段同构，复用队列模式）
evalStatus: text("eval_status", {
  enum: ["none", "pending", "processing", "done", "failed"],
}).notNull().default("none"),
evalClaimedAt: integer("eval_claimed_at"),     // runner 认领时间，僵尸恢复
evaluatedAt: integer("evaluated_at"),          // 评判完成时间

// 索引
index("works_eval_status_idx").on(t.evalStatus),
```

默认 `none`：从未进过评判队列。已有作品全部 `none`，不影响转写管线。

**迁移方式**：修改 `src/db/schema.ts` 后运行 `npm run db:generate` 自动生成新增列 + 重建 prediction_items 表的 SQL，`npm run db:push` 推向 `data/douyin.db`。库内无真实评判数据，删表重建零风险。

#### Prediction Items 重建

删除旧表，建新表——直接挂 `workId`，不再通过 evaluations 中转：

```ts
export const predictionItems = sqliteTable("prediction_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workId: integer("work_id")
    .notNull()
    .references(() => works.id, { onDelete: "cascade" }),
  predictedContent: text("predicted_content").notNull(),       // 具体预测描述
  predictionTarget: text("prediction_target").notNull().default(""), // 标的描述
  relatedSymbols: text("related_symbols").notNull().default("[]"),  // JSON 数组
  judgment: text("judgment", {
    enum: ["correct", "mostly_correct", "incorrect", "not_yet", "not_applicable"],
  }).notNull(),
  verifiableAfter: text("verifiable_after"),  // YYYY-MM-DD，not_yet 必填
  reasoning: text("reasoning").notNull().default(""),  // 判定理由
  evidence: text("evidence").notNull().default("{}"),  // JSON：agent 取到的关键数据点
  judgedAt: integer("judged_at").notNull(),             // unixepoch 秒
}, (t) => [
  index("pred_items_work_id_idx").on(t.workId),
  index("pred_items_judgment_idx").on(t.judgment),
  // 到期重评扫描：每天扫 not_yet + verifiableAfter <= today
  index("pred_items_verifiable_idx").on(t.verifiableAfter).where(
    sql`judgment = 'not_yet'`
  ),
]);
```

#### 删除 evaluations 表

`evaluations` 表删除，连带清理：

- `src/types/index.ts` 中的 `DouyinEvaluation` 接口。
- `WorkWithBlogger.evaluationId` 字段。
- 两条 evaluate 路由中的旧接口残留。
- `src/services/douyin/evaluator-service.ts`（空壳）、`src/services/douyin/market-snapshot.ts`（mock）——技术债 #5 一并销账。

博主准确率及五档统计改为从 `prediction_items` 实时 SQL 聚合（见 B5 节）。

#### 类型更新

- `JudgmentResult` 枚举加 `"not_yet"`。
- `WorkWithBlogger.judgment` 改为作品级聚合结构：`{ evalStatus, judgments: Record<JudgmentResult, number>, latestItem: { judgment, predictedContent } | null }`。
- 删除 `DouyinEvaluation`、`PredictionItem`（旧版），改为新版 `PredictionItem`。
- `MarketSnapshot` 保留但仅作为 agent 输出 evidence 的类型参考，不再有专门的路由/服务返回它。

### 2. 评判队列与 Runner

#### Queue（`src/services/douyin/eval-queue.ts`）

与 `pipeline-queue.ts` 同构，独立表字段（`evalStatus` / `evalClaimedAt`）：

- **`enqueueForEvaluation(whereFilter)`**：两类入队——①指定作品 ID（手动触发），②扫描全部新转写完成作品（`transcriptStatus='done' AND evalStatus='none'`）。批量 `UPDATE ... SET evalStatus='pending'`。
- **`enqueueReevaluation()`**（定时触发）：扫描到期重评作品：`SELECT DISTINCT w.id FROM works w JOIN prediction_items pi ON pi.work_id = w.id WHERE pi.judgment = 'not_yet' AND pi.verifiableAfter <= date('now') AND w.evalStatus = 'done'`——返回的 workId 批量 `UPDATE SET evalStatus='pending'`。
- **`claimOne()`**：`UPDATE works SET evalStatus='processing', evalClaimedAt=unixepoch() WHERE id=(SELECT id FROM works WHERE evalStatus='pending' LIMIT 1) RETURNING *`——原子认领，无竞态。
- **`recoverZombies(minutes=15)`**：`UPDATE works SET evalStatus='pending', evalClaimedAt=NULL WHERE evalStatus='processing' AND evalClaimedAt < unixepoch()-15*60`。

#### Runner（`src/services/douyin/eval-runner.ts`）

globalThis 单例，与 `pipeline-runner.ts` 同构但有差异：

- **并发 = 1**（东财 API 限流 + sandbox 资源双重约束，串行是硬需求）。
- **`kick()`**：外部入队后唤醒拿一个作品跑。
- **定时 tick**：每秒检查一次——先查 `eval_schedule_enabled`（缺省 `true`），关闭则跳过。开启时根据 `eval_schedule_cron`（5 字段 cron 表达式，默认 `5 17 * * 1-5` = 工作日 17:05）计算「上次触发时间 (settings `eval_last_run_at`, unixepoch) 到此刻之间 cron 是否有命中」→ 有命中则触发。到点后：①所有 `transcriptStatus='done' AND evalStatus='none'` 的新作品入队，②到期重评作品入队（见 `enqueueReevaluation()`）。设 `eval_last_run_at = now`。无新作品/无到期条目空转无害，不浪费 LLM 调用。纯手动触发不受 cron 限制。
- **cron 解析**：服务启动时从 settings 读取 `eval_schedule_cron`，缺省用内置 `5 17 * * 1-5`。内置轻量解析（5 字段 → 匹配当前分钟），不引入 cron-parser 依赖——字段语义固定、匹配逻辑十几行。
- **处理循环**：`claimOne()` → `evaluateWork()` → 写库（`evalStatus='done'` + 插入 prediction_items）→ 回步骤；队列空歇下；失败 → `evalStatus='failed'`，不阻塞后续。
- Mastra workflow 调用 `evaluateWorkWorkflow`。

#### 手动触发 API

- **`POST /api/douyin/evaluate`** → 入队全部未评判作品 + `kick()`，立即返回 `{ success: true, enqueued: N }`。
- **`POST /api/douyin/bloggers/[slug]/evaluate`** → 入队该博主作品 + `kick()`，同上。
- **`GET /api/douyin/evaluate/progress`**（新增）：统计 `evalStatus` 各状态 count → 前端轮询。

### 3. evaluateWorkWorkflow（`src/mastra/workflows/evaluate-work-workflow.ts`）

三阶段 workflow：

```
prepare → agentic_judge → persist
```

- **prepare**：取 work（含 transcript、opinionSummary）、blogger 信息、`publishedAt`（作为时间锚点传递给 agent）。写日志。
- **agentic_judge**：评判 agent 自主执行（见 B4），上限 15 tool 步。agent 挂 a-stock-data skill + workspace sandbox，可通过 `execute_command` + `read_file` + `write_file` 取数。
- **persist**：事务内——①删除该 work 的所有旧 `prediction_items`（重评场景），②插入新条目，③更新 `works.evaluatedAt` + `works.evalStatus='done'`。

重试：每步 catch 后重试 2 次，全失败 → `works.evalStatus='failed'`，可通过手动触发再次入队。

结构化输出：agent 最终输出走 zod schema 强约束：

```ts
z.object({
  predictions: z.array(z.object({
    content: z.string().describe("预测内容表述"),
    target: z.string().describe("预测标的：大盘/板块/个股等"),
    symbols: z.array(z.string()).describe("涉及股票代码或指数名，无则空数组"),
    judgment: z.enum(["correct","mostly_correct","incorrect","not_yet","not_applicable"]),
    verifiableAfter: z.string().optional().describe("YYYY-MM-DD，not_yet必填，其他null"),
    reasoning: z.string().describe("判定理由（凭什么这么判）"),
    evidence: z.object({}).passthrough().describe("支撑判定的行情数据快照"),
  }))
})
```

纯闲聊视频 `predictions=[]` 合法（作品级无评判内容，evalStatus 仍为 done）。

### 4. 评判 Agent（`src/mastra/agents/evaluator-agent.ts`）

```ts
export const evaluatorAgent = new Agent({
  id: "evaluator-agent",
  name: "evaluator-agent",
  instructions: EVALUATOR_INSTRUCTIONS,
  model: newapiModel("evaluation"),
  skills: ({ requestContext }) => {
    // 动态从 settings 读取挂载
    // 默认挂 a-stock-data（安装路径 data/skills/a-stock-data/）
  },
  workspace: new Workspace({
    filesystem: new LocalFilesystem({ rootDir: "data/workspace/evaluator" }),
    sandbox: new LocalSandbox({
      workingDirectory: "data/workspace/evaluator",
      timeout: 120000,  // 取数场景 2 分钟
    }),
  }),
});
```

#### Instructions 核心纪律

```
你是 A 股行情评判专家。给定抖音博主口播转写文本，你需要：

1. 从转录中提取所有可验证的行情预测/判断（一作品可能有多条）
2. 对每条预测，根据数据判定其正确性

## 判定标准

- correct: 预测方向与实际完全一致，幅度偏差 ≤ 20%
- mostly_correct: 方向正确但幅度偏差 > 20%
- incorrect: 方向错误
- not_yet: 预测期限尚未到达（如 6 个月后见底，现在只过了 2 个月），必须给出 verifiableAfter 日期
- not_applicable: 内容不涉及行情预测或无法验证（纯闲聊、纯技术分析无方向等）

## 期限口径（重要，保持一致）
- 「短期/近期」→ 发布日后 5 个交易日
- 「中期」→ 发布日后 30 个自然日
- 「长期」或「N 个月后」但无具体可验证标的 → 倾向 not_applicable（不挂永远的 not_yet）
- 有方向、有标的、有明确时间（如「年底前见 4000 点」）→ not_yet + verifiableAfter

## 数据获取
- 你需要的数据：作品发布日期前后的指数日 K 线（上证/深成指/创业板）、涉及板块的排名/涨跌、涉及个股的实时价/K 线
- 优先走 skill 里的腾讯财经 API 和通达信 mootdx（不封 IP），东财接口必须走 skill 里内建的 em_get 限流
- 每次判定必须在 evidence 字段记录实际取到的关键数据点
- 作者发布日期（视频发布时间）是 key：你必须取发布日附近的数据来判断方向是否正确

## 输出
严格按照要求的 JSON schema 输出。
```

#### Agent 元数据

`AGENT_META` 追加：

```ts
evaluatorAgent: { flow: "evaluation", description: "抖音博主观点准确度评判，对比行情数据判定预测正确性" }
```

### 5. 准确率聚合与 API

#### 博主页聚合

```sql
-- 博主正确率
SELECT
  COUNT(CASE WHEN pi.judgment IN ('correct','mostly_correct','incorrect') THEN 1 END) AS evaluable,
  COUNT(CASE WHEN pi.judgment = 'correct' THEN 1 END) AS correct,
  COUNT(CASE WHEN pi.judgment = 'mostly_correct' THEN 1 END) AS mostly_correct,
  COUNT(CASE WHEN pi.judgment = 'incorrect' THEN 1 END) AS incorrect,
  COUNT(CASE WHEN pi.judgment = 'not_yet' THEN 1 END) AS not_yet,
  COUNT(CASE WHEN pi.judgment = 'not_applicable' THEN 1 END) AS not_applicable
FROM prediction_items pi
JOIN works w ON w.id = pi.work_id
WHERE w.blogger_id = ?
-- accuracy = (correct + 0.5 * mostly_correct) / evaluable
```

博主列表页的 `accuracy` 同样从此聚合计算。

#### 作品管理表聚合

`WorkWithBlogger.judgment` 改为聚合结构供前端直接渲染：

```ts
interface WorkJudgment {
  evalStatus: "none" | "pending" | "processing" | "done" | "failed";
  evaluable: number;    // correct + mostly_correct + incorrect
  correct: number;
  mostlyCorrect: number;
  incorrect: number;
  notYet: number;
  notApplicable: number;
  latestItem: { judgment: string; predictedContent: string } | null;
}
```

filterCounts 加 `evalStatus` 和 `not_yet` 的 count。

> 旧代码清理已在 §B1「删除 evaluations 表」中覆盖，此处不重复。

### 6. UI 改造

#### 作品管理表（`/settings/douyin`）

- **筛选栏**：judgment 下拉增加「当前不适合 (`not_yet`)」「未评判 (`none`)」选项。
- **行内评判徽标**：作品级聚合显示——例如「3 条预测：1✓ 1✗ 1⏳」。
- **展开详情面板**（点击行展开）：每条 prediction_item 独立一行——预测内容、判定结果 badge、标的与代码、理由、到期日（not_yet 高亮）、evidence 折叠。同时显示 evalStatus 时间线。

#### 博主页与列表

- `DouyinBloggerWithOpinion.accuracy`：新聚合口径实时计算。
- 博主页增加五档计数条（correct / mostly_correct / incorrect / not_yet / not_applicable 横向色块）。
- 列表页「准确率」列对应的 tooltip 展示五档明细。

#### 定时配置

> 相关 settings 键：`eval_schedule_cron`（默认 `5 17 * * 1-5`）、`eval_schedule_enabled`（默认 `true`）、`eval_last_run_at`（unixepoch，防重复触发）。

- 设置页面评判区域增加 **cron 表达式输入框**：显示当前 cron、编辑、保存到 `settings` 表。
- **快捷预设下拉**：工作日收盘后 (`5 17 * * 1-5`)、每日收盘后 (`5 17 * * *`)、每周一 (`0 9 * * 1`)。
- **启用/禁用开关**：关闭时定时 tick 静默跳过，手动触发不受影响。
- cron 输入框带实时人类可读预览（「下次触发：2026-07-20 周一 17:05」）。
- 「立即运行」按钮不受 cron 影响。

#### 评判进度轮询

- 设置页面评判区域：显示评判进度（pending/processing/done/failed 各计数 + 进度条），手动触发按钮（全局 + 单博主），3 秒轮询。

### 7. 测试

vitest（内存 SQLite）覆盖：

- **eval-queue.ts**：原子认领（2 并发只拿走 1 条）、claimOne 空队列返回 null、僵尸恢复（processing 超时重置）、到期重评扫描（`verifiableAfter <= today` 的归队，`verifiableAfter > today` 的不动）。
- **准确率聚合 SQL**：correct/mostly_correct/incorrect 混合场景的 accuracy 数值正确，not_yet/not_applicable 不计入分母，全部 not_yet 返回 null。
- **runner tick**：同一天不重复触发、过日触发（mock Date）。

不测（手动冒烟）：agent+workflow 真实取数、LLM 判定质量。

### 8. 明确不做（YAGNI）

- 行情数据预缓存层（agent 每次现场取数，东财限流已内置）
- 节假日历（周末不取数的逻辑简单粗暴，重评周末到期周一跑也可接受）
- 博主历史准确率趋势图
- 多实例评判支持（沿用单实例假设，同转写管线）

## 错误处理

- **agent 取数失败（Python 抛错/sandbox timeout）**：workflow step 内 catch → 清理 workspace 残留脚本 → 写 evidence 里标记取数失败 → 判定可能降级（部分数据缺失时 agent 应标记 not_yet 或降低置信度，不硬判）。全失败 → `evalStatus='failed'` → 可手动重试。
- **LLM 输出不合 schema**：Mastra zod schema 模式自动重试，上限同 workflow step 重试（2 次）。
- **东财风控（HTTP 000/403）**：agent skill 内建的 `em_get` 自带限流 + 重试；仍被封时 agent 应能通过腾讯/通达信降级取数。
- **数据库事务失败**：persist 阶段事务回滚 → workflow 整体失败 → `evalStatus='failed'`。
- **手动触发幂等**：`evalStatus='none'` / `'failed'` 才入队，already `pending`/`processing`/`done` 不影响（不会对同作品产生重复条目）。

## 测试与验证

1. `npx tsc --noEmit` + `npm run lint` + `npm run build` 通过
2. `npm test`（vitest 单测：queue 原子性/僵尸/重评扫描/聚合 SQL/runner tick）全绿
3. 手动冒烟：
   - 安装 a-stock-data skill → 挂载到 evaluatorAgent
   - 对已有 opinionSummary 的作品手动触发评判 → agent 正常取数 → 判定写入 prediction_items
   - 设置页轮询进度正常
   - 到期重评：制造一条 not_yet + verifiableAfter=昨天 → trigger tick → 确认重评完成、旧条目被替换
   - 博主页准确率数值正确

## 与子项目 A 的关系

子项目 B 依赖子项目 A 提供：skills 安装/存储（`data/skills/a-stock-data/`）、动态挂载、sandbox 执行能力。子项目 A 可单独交付（见 A 的验收场景），但准确度评判的完整功能仅在两者都落地后可用。
