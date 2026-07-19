# Mastra 使用评估与改进路线

> 日期：2026-07-19  
> 状态：路线图（按优先级逐步落地；完成一项请在文末进度表勾选并链到对应 PR/commit）  
> 相关：[[2026-07-16-mastra-foundation-design]] · [[2026-07-16-mastra-workflow-pipeline-design]] · [[2026-07-18-mastra-skills-infra-design]] · [[2026-07-18-agent-log-viewer-design]]

## 1. 目的

站在业界常见 Agent 工程实践，评估本仓库对 Mastra 的用法，给出：

1. **已对齐的做法**（保留）
2. **主要差距**（按优先级）
3. **分阶段改进清单**（可逐步打勾执行，避免一次大改）

本文是**工程路线**，不是立刻全量重写方案。当前产品阶段（抖音雷达 + 少量 agent + 单实例）允许大量 YAGNI；差距要按性价比收，而不是按框架功能清单堆。

---

## 2. 现状速览

### 2.1 代码地图

```
src/mastra/
├── index.ts                 # Mastra 单例：agents + workflows + LibSQLStore
├── model.ts                 # newapiModel(flow) 动态模型
├── agent-meta.ts            # 管理页元数据（与注册键对齐）
├── resolve-skills.ts        # agent → 启用 skill 路径
├── agents/
│   ├── opinion-agent.ts
│   ├── evaluator-agent.ts   # skills + LocalSandbox workspace
│   └── skill-reviewer-agent.ts
└── workflows/
    ├── transcribe-work-workflow.ts   # 下载→音频→ASR→观点
    ├── evaluate-work-workflow.ts     # prepare→agentic judge→persist
    └── skill-review-workflow.ts      # prepare→review→persist

调度（非 Mastra）：
src/services/douyin/pipeline-runner.ts   # 转写队列 kick + 并发
src/services/douyin/eval-runner.ts       # 评判队列 + cron tick

HTTP：
src/app/api/chat/route.ts                # handleChatStream
src/app/api/agents/**                    # list / runs / test
```

### 2.2 运行时形态

```text
业务队列 (works.*Status / claim + kick runner，进程内)
    → mastra.getWorkflow(...).createRun().start()
        → steps（I/O + LLM）
            → 业务库 douyin.db 落库
Mastra storage：data/mastra.db（run 快照）
```

**隐含约束（已在 CLAUDE.md / 队列设计中写明）**：转写/评判 runner **依赖单实例**；多实例前必须换外部调度。

### 2.3 依赖（以 package.json 为准）

- `@mastra/core`、`@mastra/libsql`、`@mastra/ai-sdk`
- 模型：newapi OpenAI-compatible，经 `newapiModel(flow)` 注入
- 前端 chat：AI SDK + `handleChatStream`

---

## 3. 已对齐的实践（保留）

| 实践 | 现状 | 说明 |
|------|------|------|
| 单一注册入口 | `src/mastra/index.ts` | agents / workflows / storage 集中 |
| 模型不硬编码 | `newapiModel(flow)` + settings | 换模型无需发版重启（热读 settings） |
| Workflow 契约 | zod input/output、step `retries` | 边界清楚 |
| 双库分离 | `douyin.db` vs `mastra.db` | 业务与框架 run 存储不混 |
| 结构化输出 | evaluator / skill-reviewer `structuredOutput` | 可解析、可落库 |
| 扩展能力位 | skills + workspace sandbox（evaluator） | 方向对，运行时边界待收紧 |
| Next 集成 | `serverExternalPackages`、`handleChatStream` | 避免把 Node-only 打进客户端包 |
| 产品目录 | `AGENT_META` | 管理页与注册键映射 |

**结论**：不是「用错 Mastra」，而是从「能跑的 Agent SDK 基座」到「可观测、可评估、可扩展的运行时」还差一层工程化。

---

## 4. 目标架构原则

后续改动遵守这些原则，避免来回摇摆：

1. **调度平面 ≠ 执行平面**  
   - 队列 / runner：认领、并发、多实例、重试投递  
   - Mastra workflow：单次 run 内的步骤编排与 LLM  
2. **一切 LLM 调用经 `mastra` 实例**  
   - `mastra.getAgent` / workflow 内官方 agent 步骤；禁止业务路径长期 `import agent 单例.generate`（测试 fixture 除外）  
3. **Tools 优先于自由 Sandbox**  
   - 行情、限流、鉴权做成 typed tools；skills 写「怎么用」；sandbox 是最后手段  
4. **可观测默认开启**  
   - 每次 generate / 每个 workflow run 能关联 `runId` + 业务键（`workId` / `awemeId` / `batchId`）  
5. **无 eval 不改 prompt/模型当「优化」**  
   - 金标集 + 自动断言先于手感调参  
6. **安全：安装时审查 + 运行时最小权限**  
   - skill-review 保留；运行时默认无通用 shell、密钥不进 sandbox env  

### 推荐中期形态（单实例 → 多实例）

```text
[API / Cron]
    → 外部或增强队列（认领、可见性超时、并发）
        → Worker（可多进程）
            → mastra.getWorkflow(id).createRun().start({ inputData, tracingOptions })
                → steps: tools / agent.generate / 纯函数
                    → 返回结果
            → service 层幂等写 douyin.db（或末步写库但必须幂等）

观测：日志 +（可选）Langfuse/OTel
评估：fixtures + CI/nightly scorers
```

当前进程内 `kick` runner 可保留到 **P2 换队列前**，但不要再往 runner 里堆业务步骤。

---

## 5. 差距详解

### 5.1 编排双脑（架构）

| | 现状 | 风险 |
|--|------|------|
| 调度 | `pipeline-runner` / `eval-runner` + DB 状态机 | 单实例；与 Mastra run 状态双写心智 |
| 执行 | Mastra workflow | run 失败与 DB `failed` 需两边对齐 |

**方向**：明确队列=调度、Mastra=执行；多实例时换 BullMQ / 等价物，而不是复制更多 `globalThis` 单例。

### 5.2 Agent 调用路径不统一

| 路径 | 位置 |
|------|------|
| `mastra.getAgent("opinionAgent")` | `opinion-service.ts` ✅ |
| 直接 `evaluatorAgent.generate` | `evaluate-work-workflow.ts` ⚠️ |
| 直接 `skillReviewerAgent.generate` | `skill-review-workflow.ts` ⚠️ |

绕过实例会导致 tracing / scorers / 中间件 / 未来 gateway 钩不全。

### 5.3 可观测性不足

- 主通道：`console.log` / `console.error`
- 缺：token、cost、latency、model id、统一 `runId`↔`workId`
- runs API 目前偏转写 workflow，未形成全 workflow 运维面

### 5.4 Tools 弱、Sandbox 重

evaluator 依赖 skills + `LocalSandbox` + prompt 约定数据源。  
更稳分层：

```text
Typed Tools（zod、可单测、可限流）  ← 优先
    ↑
Skills（操作说明 / 少量脚本）
    ↑
Sandbox（强隔离最后手段）
```

### 5.5 Memory / 会话

`/api/chat` 无 thread memory。调试台可接受；若产品要「研究助手」再上 Memory，并绑定博主/work 上下文。

### 5.6 无 Agent 质量 Eval 闭环

有业务「预测对错」评判，无：

- opinion 是否漏点位  
- skill-review 是否漏高危  
- evaluator schema 稳定性  

### 5.7 安全

- ✅ 安装期 skill-reviewer  
- ⚠️ 运行时 LocalSandbox 信任模型偏本机开发  
- ⚠️ chat / agents / skills 写接口缺统一鉴权（内网假设）

### 5.8 Prompt 治理

instructions 内嵌 TS 字符串；模型可 settings 热切换，prompt 不可对等回滚。

### 5.9 Workflow 细部

| 点 | 现状 | 改进方向 |
|----|------|----------|
| 机械步骤 | 下载/ffmpeg/ASR 均在 Mastra | 可保留换统一 run 日志；或拆「数据准备 job → LLM workflow」 |
| 幂等 | 重跑可能重复下载 | 产物存在则 skip；`awemeId` 幂等键 |
| schema | `evidence` passthrough 过宽 | 收紧字段 |
| 落库 | workflow 内写 DB | 允许，但必须幂等；或结果交 service |
| runs API | 偏单一 workflow | 全量 list + filter |
| 命名 | `opinionAgent` vs `opinion-agent` | 固定映射表，禁止漂移 |

### 5.10 测试

runner 可注入；agent/workflow 几乎靠手工冒烟。缺 mock model、schema 契约、LLM fixture。

---

## 6. 明确 YAGNI（现阶段不做）

- 自建 `MastraModelGateway`（动态 `newapiModel` 已够）
- 未到多实例前上 Temporal / 重型编排平台
- 为 stocks/industry 等占位页先造 agent
- 全量 Chat Memory（产品未要持续研究对话前）
- 为装饰性指标重做整站可观测平台（先结构化日志 + 可选 Langfuse）

---

## 7. 分阶段改进清单

### 图例

- [ ] 未开始 · [~] 进行中 · [x] 完成  
- 每项建议：**独立 PR**、可回滚、附验证方式  
- 完成时在「进度表」更新日期与链接  

---

### P0 — 地基（建议先做，改动面相对可控）

#### P0-1 统一 Agent 调用入口

- [x] **evaluate-work-workflow**：经 `mastra.getAgent("evaluatorAgent")`（或 workflow 官方 agent 步骤）调用，去掉直接 `evaluatorAgent.generate`
- [x] **skill-review-workflow**：同上 → `skillReviewerAgent`
- [x] 约定：新增代码禁止 `import { xxxAgent } from agents` 后业务 `generate`（仅 `index.ts` 注册与测试可 import）
- [x] 验证：跑一条 evaluate + 一条 skill-review；行为与结构化输出不变

**主要文件**：`evaluate-work-workflow.ts`、`skill-review-workflow.ts`、`src/mastra/get-agent.ts`。

#### P0-2 LLM / Workflow 可观测最小集

- [x] 定义日志字段合同（JSON 一行日志即可），至少包含：  
  `ts, level, event, runId?, workId?, awemeId?, batchId?, agentKey?, workflowId?, stepId?, model?, latencyMs?, error?`
- [x] workflow `createRun/start` 成功与失败打点；与业务 `mark*Failed` 同字段关联
- [x] `newapiModel` 或 generate 包装层记录 modelId（**禁止打 apiKey**）
- [ ] （可选）接入 Langfuse / OTel；若暂不接，保留接口以便后续挂 exporter
- [x] 验证：一次转写 + 一次评判日志能用 `workId` 串起来

**主要文件**：`pipeline-runner.ts`、`eval-runner.ts`、`model.ts`、`src/lib/llm-log.ts`。

#### P0-3 收紧 Structured Output Schema

- [x] `predictionsSchema.evidence`：从宽松 passthrough 改为明确字段（如标的、区间、开关价/涨跌、数据源、取数时间），保留有限 `z.record` 扩展位若必要
- [x] skill-review `issues[]` 已较严；复查 agent instructions 与 schema 一致
- [x] 验证：旧数据读取兼容（解析失败降级展示，不炸页）

**主要文件**：`evaluate-work-workflow.ts`、类型/前端展示若依赖 evidence 形状。

#### P0-4 写操作鉴权（最小）

- [x] 明确部署假设：开发放开 / 生产共享密钥或 session  
- [x] 保护：`/api/chat`、`/api/agents/**` 写、`/api/skills/**` 写、管线触发类 API、settings 写  
- [x] 验证：无凭证 401；有凭证 200

**说明**：`ADMIN_TOKEN` 头校验 + `.env.example` / `CLAUDE.md` 约定；未设置 token 时放行。

#### P0-5 Agent 命名合同

- [x] 文档化：注册键（`opinionAgent`）= `listAgents` / `AGENT_META` / skills mount key  
- [x] `id`（`opinion-agent`）仅 Mastra/chat `agentId`  
- [x] 单测或 lint：`Object.keys(mastra.listAgents())` 与 `AGENT_META` 键集合一致  

---

### P1 — 质量、成本、工具化

#### P1-1 行情 Typed Tools

- [ ] 将 evaluator 高频数据能力收成 tools（示例）：`getIndexKline`、`getStockQuote`、`getSectorRank`  
- [ ] zod 入参/出参；内部复用限流（东财 em_get 等）  
- [ ] agent instructions 改为「优先 call tools」，skills 降为说明文档  
- [ ] 单测：tool 入参校验 + mock HTTP  
- [ ] 验证：同作品评判 evidence 来自 tool 结果而非随意脚本 stdout  

**主要文件**：`src/mastra/tools/**`、`evaluator-agent.ts`、skills 内容可能收缩。

#### P1-2 收紧 Sandbox

- [ ] 默认超时/输出大小上限保持并文档化  
- [ ] 环境变量：不向 sandbox 注入 `NEWAPI_*` / `TIKHUB_*` / `ASR_*`  
- [ ] 评估：生产是否禁用通用 shell，仅允许 `python` 跑白名单入口  
- [ ] 验证：skill 内读 env 秘钥应失败  

#### P1-3 Agent 金标 Eval 集

- [ ] 建立 `tests/fixtures/agents/`：  
  - opinion：输入转写片段 → 期望关键词/禁词  
  - evaluator：输入固定 transcript + mock tools → 期望 judgment  
  - skill-review：危险样本 / 干净样本  
- [ ] `pnpm test` 可跑（mock model 或录制响应）  
- [ ] CI 或本地 pre-push 可跑子集  
- [ ] 验证：改 instructions 导致期望失败时测试红  

#### P1-4 成本与步数治理

- [ ] evaluator `maxSteps` / timeout 配置化（settings 或常量）  
- [ ] 日预算或并发熔断（与 eval-runner CONCURRENCY 协同）  
- [ ] 日志输出 token 估算或网关用量  

#### P1-5 Workflow 步骤幂等

- [ ] download：目标文件存在且大小可信 → skip  
- [ ] extract/transcribe：下游产物存在可 skip 或续跑  
- [ ] evaluate persist：已是 delete+insert；确认与 `evalStatus` 一致  
- [ ] 验证：同一 `workId` 重跑不重复占满磁盘  

#### P1-6 Runs 运维面统一

- [ ] `/api/agents/runs`（或后继 log viewer）支持全部 workflow，query：`workflowId`、`status`、分页  
- [ ] 与 P0-2 字段对齐，便于从业务页跳到 run  

---

### P2 — 平台化（有明确需求再上）

#### P2-1 外部队列替换进程内 Runner

- [ ] 选型（建议写短 ADR）：BullMQ + Redis / 其他  
- [ ] 转写、评判 consumer 调 Mastra workflow  
- [ ] 保留 DB 状态机作业务展示，或逐步以队列 job 状态为准（二选一写清）  
- [ ] 多实例部署文档  
- [ ] 验证：两 worker 不双抢同一 work；进程杀后可见性超时重投  

#### P2-2 Chat Memory（产品驱动）

- [ ] 仅当「持续研究对话」进路线图时开启  
- [ ] threadId / resourceId 与用户或会话绑定  
- [ ] 管理页调试台可一键「无记忆」模式  

#### P2-3 Prompt 版本化

- [ ] instructions 外置 `src/mastra/prompts/*.md` 或 DB 版本  
- [ ] 变更日志；支持按 flow 回滚  
- [ ] 与金标 eval 联动  

#### P2-4 机械管线与 LLM 管线拆分（可选）

- [ ] 评估：下载/ASR 是否迁出 Mastra，仅「opinion + evaluate + review」留在 Mastra  
- [ ] 若迁出：统一用 P0-2 日志，避免可观测回退  

#### P2-5 强隔离运行时

- [ ] 不可信 skill / 多租户前提：容器级 sandbox 或「只调 tools、无 shell」  
- [ ] 与 skills 安装策略联动  

---

## 8. 建议实施顺序（一条主路径）

```text
P0-5 命名合同（极小）
  → P0-1 统一 getAgent
  → P0-2 可观测最小集
  → P0-3 evidence schema
  → P0-4 鉴权
  → P1-1 tools
  → P1-3 金标 eval
  → P1-5 幂等
  → P1-2 sandbox 收紧
  → P1-4 / P1-6
  → （多实例需求明确）P2-1
  → （产品要对话）P2-2 / P2-3
```

并行建议：P0-2 与 P0-1 可同迭代；P1-3 fixtures 可在 P1-1 前先用 mock 堆意见抽取样本。

---

## 9. 每项 PR 的完成定义（DoD）

1. 行为合同：对外 API / DB 字段无意外破坏（有则写迁移与前端兼容）  
2. 验证：列出手工或自动步骤（至少一条 happy path + 一条失败路径）  
3. 日志：不打印密钥、不打印完整用户隐私转写到第三方（若上 Langfuse，注意脱敏）  
4. 文档：本文件进度表打勾；若改架构约束，同步 `CLAUDE.md` 一句  
5. 单实例假设未解除前，不在文档中宣称「可水平扩展」  

---

## 10. 进度表

| ID | 项 | 状态 | 完成日期 | PR/Commit | 备注 |
|----|----|------|----------|-----------|------|
| P0-1 | 统一 Agent 调用 | [x] | 2026-07-19 | style/intelligence-console | `getRegisteredAgent` |
| P0-2 | 可观测最小集 | [x] | 2026-07-19 | style/intelligence-console | `llm-log`；Langfuse 仍可选 |
| P0-3 | 收紧 structured schema | [x] | 2026-07-19 | style/intelligence-console | `evidenceSchema` |
| P0-4 | 写操作鉴权 | [x] | 2026-07-19 | style/intelligence-console | `ADMIN_TOKEN` |
| P0-5 | 命名合同 | [x] | 2026-07-19 | style/intelligence-console | `AGENT_KEYS` + 单测 |
| P1-1 | 行情 Typed Tools | [ ] | | | |
| P1-2 | Sandbox 收紧 | [ ] | | | |
| P1-3 | 金标 Eval 集 | [ ] | | | |
| P1-4 | 成本/步数治理 | [ ] | | | |
| P1-5 | Workflow 幂等 | [ ] | | | |
| P1-6 | Runs 运维面统一 | [ ] | | | |
| P2-1 | 外部队列 | [ ] | | | |
| P2-2 | Chat Memory | [ ] | | | |
| P2-3 | Prompt 版本化 | [ ] | | | |
| P2-4 | 机械/LLM 管线拆分 | [ ] | | | |
| P2-5 | 强隔离运行时 | [ ] | | | |

---

## 11. 参考（仓库内）

- `docs/superpowers/specs/2026-07-16-mastra-foundation-design.md` — 基座决策（动态模型、不做 gateway）  
- `docs/superpowers/specs/2026-07-16-mastra-workflow-pipeline-design.md` — 转写 workflow  
- `docs/superpowers/specs/2026-07-18-mastra-skills-infra-design.md` — skills / review  
- `docs/superpowers/specs/2026-07-18-agent-log-viewer-design.md` — run 展示（与 P0-2 / P1-6 衔接）  
- `docs/superpowers/plans/2026-07-17-transcribe-queue-runner.md` — 队列单实例假设  

---

## 12. 一句话

> 当前 Mastra 用法是 **Next 单实例里的 Agent SDK + 轻量 Workflow**；改进目标是在不提前过度设计的前提下，补齐 **统一调用、可观测、Tools 优先、Eval 闭环、运行时安全**，并在多实例需求出现时把 **调度平面** 从进程内 runner 迁出。
