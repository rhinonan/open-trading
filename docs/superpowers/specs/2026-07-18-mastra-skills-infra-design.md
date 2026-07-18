# Mastra Skills 通用基建 + Agent 沙箱执行 — 设计文档（子项目 A）

日期：2026-07-18
状态：待用户审阅

## 背景

项目已选定「运行时安装 + 沙箱执行」的 skills 架构：第三方 A 股数据 skill（如 a-stock-data）从 URL 安装到 `data/skills/`，通过 Mastra 1.51 原生 `Agent({ skills })` 动态挂载；需要跑代码的 agent 配 Workspace + LocalSandbox 执行。准确度评判（子项目 B）是本基建的第一个验收消费者，chat 场景也可使用。

## 已确认的决策

| 决策点 | 结论 |
|---|---|
| 执行模式 | **沙箱执行型**：agent 挂 a-stock-data skill 后在 sandbox 里抄/写 Python 代码执行取数，开源 Python skill 开箱即用 |
| 数据获取策略（评判场景） | **全 agentic**：评判 agent 自主决定取什么数据、现场写代码执行 |
| 技能管理 | **运行时安装 + 页面管理**：设置页支持从 URL 安装/更新/启停，挂载关系存 settings 表可在页面上改 |
| Sandbox 隔离等级 | 低成本分层：Mastra 原生 timeout + env 白名单 + Docker 资源限制为主线；bwrap 文件系统隔离作为验证项 |

## 架构

### 1. Skills 存储与生命周期

**目录约定**：`data/skills/<name>/SKILL.md`（+ 可选附属文件如 `references/checklist.md`），与 `data/douyin.db`、`data/mastra.db` 同级，Docker 已挂载 `./data`，天然随部署持久化。

**新增 `src/services/skills-service.ts`**：

- **安装**（`installFromUrl(url)`）：接收 GitHub 仓库 URL（如 `https://github.com/simonlin1212/a-stock-data`），走 GitHub API 遍历文件树、取 `SKILL.md` + 附属文件、解析 frontmatter（name/description/version）→ 写入 `data/skills/<name>/`。记录 `sourceUrl`、`installedAt`、`contentHash`。**仅支持 public GitHub 仓库**（`github.com/<owner>/<repo>` 格式），私仓/纯文本 URL/非 GitHub 平台第一版不做。安装后**默认禁用**。
- **列表**（`listSkills()`）：读取 `data/skills/` 下全部目录，解析每个 SKILL.md 的 frontmatter 返回元数据。
- **启用/禁用**：状态写入 `data/skills/<name>/.enabled` 标记文件（轻量，不用进 settings 表）。Agent 的动态 resolver 在构建 skills 路径数组时跳过不存在 `.enabled` 标记的目录——安装后默认禁用即初始不生成此文件，用户在设置页启用手动生成。
- **删除**（`deleteSkill(name)`）：删除整个 skill 目录（确认二次）。
- **检查更新**（`checkUpdate(name)`）：重拉上游 SKILL.md 对比 `version` 字段 → 返回新版本号与 diff 摘要。
- **挂载管理**：agent ↔ skill 挂载关系存入 settings 表 `skills_agent_mounts`（JSON `{ agentKey: [skillName, ...] }`）。规模小不值得单开表。

**供应链安全**：

- 安装后默认禁用，用户需到设置页审阅 SKILL.md 内容后手动启用。
- 检查更新时展示版本 diff 摘要，用户确认后再升级。
- 页面顶部醒目标注：「⚠️ 安装 skill 即引入可执行代码，请仅从信任来源安装。skill 代码在服务器本机执行，可读取 skill 文件但无宿主环境变量。」

### 2. Agent 挂载（动态生效）

Mastra 1.51 `Agent({ skills })` 支持动态 resolver 函数——与现有 `newapiModel(flow)` 同模式：每次请求时从 settings 表读挂载关系，启用的 skill 返回 `data/skills/<x>` 路径数组。改挂载不重启服务。

Skill 的渐进加载（描述先注入、正文按需 `skill_read`）由 Mastra 原生处理，2815 行的 a-stock-data 不会一口气塞满上下文。

**本期挂载的 agent**：

| Agent | Skills | Workspace | 用途 |
|---|---|---|---|
| `evaluatorAgent`（新增） | a-stock-data | ✅ LocalSandbox | 评判时动态取行情/K 线/板块数据 |
| `opinionAgent`（现有） | 无 | 无 | 纯 LLM 观点提取，不需要外部数据 |
| chat 场景（将来） | 用户可在设置页给任意 agent 加挂 | 可选 | `/api/chat?agentKey=xxx`，agent 挂了就能用 |

### 3. 执行能力：Workspace + LocalSandbox

需要跑代码的 agent 配 Mastra **Workspace**：

- **`LocalFilesystem`**：限定在 `data/workspace/<agentKey>/`，agent 读写 skill 代码、中间脚本、输出文件都落在这里。
- **`LocalSandbox`**：执行命令（`python3 script.py`）。agent 从 skill 抄/写 Python → 落盘 → execute → 读输出。Workspace 已有 `readFileTool` 等全套内置工具。

**安全分层（低成本渐进式）**：

| 层级 | 措施 | 成本 | 覆盖场景 |
|---|---|---|---|
| ① Mastra 原生 | `timeout`（默认 30s，取数场景 120s）+ `env` 白名单（默认只透传 `PATH`，`NEWAPI_API_KEY` 等**不进 sandbox**）+ `workingDirectory` 锁在 workspace 目录 | 零（配置即可） | 所有环境 |
| ② Docker 资源限制 | `docker-compose.yml` 加 `mem_limit: 2g` + `cpus: 2`；Dockerfile runner 阶段 `USER node` | 几行配置 | 生产 |
| ③ bwrap 文件系统隔离 | `isolation: 'bwrap'`（Mastra 原生支持），sandbox 进程跑在只读根 + 只写 workspace 视图里，`detectIsolation()` 自动探测，不可用回落 `'none'` | `apt-get install bubblewrap` | 生产（验证项，不确保能跑） |
| ④ 供应链审核 | 安装后默认禁用、审阅 SKILL.md 后手动启用、更新展示 diff | 页面交互 | 所有环境 |

**部署改造**：

- Dockerfile runner 阶段**保留 python3 + pip**（当前被 purge），安装 `mootdx requests pandas stockstats`，写入 Dockerfile `RUN` 指令（一次构建、不再动）。
- 开发机（Windows）依赖：本机已安装 Python 3.12.5 + pip（确认 ✓），`pip install mootdx requests pandas stockstats` 一次性手动执行。
- 开发机（命令名 `python`）与容器（`python3`）差异：workspace 初始化时探测一次 `python3 --version` / `python --version`，将可用命令名注入 agent instructions 与代码块示例中。
- 额外验证：mootdx 走 TCP 7709，容器网络策略放行；海外部署可能全部超时，但本项目定位国内自部署面板，此假设可接受。

### 4. 页面

**设置页新增「Skills 管理」tab**（`/settings/skills`）：

- 顶部安全提示横幅。
- 安装区：URL 输入框 + 「安装」按钮（含 loading/错误提示）。
- 已装列表：名称、版本、描述、来源 URL（截断显示）、安装时间、启用开关、挂载下拉（勾选各 agent）、「检查更新」「删除」按钮。启用开关关闭时不参与挂载。
- 检查更新：异步对比 ↑ 版本 → 显示 diff → 用户确认升级。

**Agents 页面改造**（子项目 A 只做展示层，配置入口在设置页）：

- 每个 agent 卡片底部新增「已挂载 skills」行：显示 skill 名称标签（未挂载显示「无」），带「管理 skills →」链接跳设置页。
- `AGENT_META` 补充 `evaluatorAgent` 一行（描述：「抖音博主观点准确度评判，对比行情数据判定预测正确性」）。

**Chat**：agent 挂了 skills + workspace 后聊天里自然可用——不管改动路由。

### 5. 明确不做（YAGNI）

- Skill 市场/多源索引、版本回滚、自动定时更新
- Sandbox 容器级或 cgroup 资源隔离（bwrap 做验证但不强依赖）
- Windows 沙箱（开发机靠 timeout + env 白名单 + 信任本机）
- 多用户权限体系

## 错误处理

- GitHub API 不通 / 仓库不存在 → 返回明确错误信息给前端
- SKILL.md 格式无效（缺 name/description）→ 安装拒绝，提示原因
- LocalSandbox 命令超时 → agent 收到超时错误后可选择重试或跳过
- bwrap 不可用 → `detectIsolation()` 回落 `'none'`，不阻断功能

## 测试与验证

1. `npx tsc --noEmit` + `npm run lint` + `npm run build` 通过
2. 设置页手动冒烟：从 a-stock-data 仓库 URL 安装 → 审阅内容 → 启用 → 挂载到评判 agent
3. 评判 agent 手动冒烟（子项目 B 验证）：取数时 sandbox 正常执行 python 脚本、timeout 生效、env 变量不泄露
4. Docker build + up 确认 python3 + pip 依赖正确安装，容器非 root 运行
5. bwrap 验证（可选）：检测到 → 启用 → 确认命令在隔离视图下执行；未检测到 → 回落无报错

## 与子项目 B 的关系

子项目 A 提供基础设施（skills 存储/安装/挂载 + sandbox 执行）。子项目 B（准确度评判）作为第一个消费者：

- 评判 agent 在 `src/mastra/index.ts` 注册，挂 a-stock-data skill + workspace（动态挂载路径从 settings 读取）。
- 评判 workflow 里 agent 自主取数依赖 sandbox 可用。
- 评判功能上线后，agents 页面自动展示 evaluatorAgent 及其挂载的 skills。

子项目 A 单独也可验收：安装 a-stock-data → 挂载到现有 opinionAgent（仅技能注入，无需 sandbox）→ 问一个行情问题（如「上证指数 PE 怎么看」）→ 验证 agent 能调用 skill_read 获取数据端点信息。聊天场景天然可用。
