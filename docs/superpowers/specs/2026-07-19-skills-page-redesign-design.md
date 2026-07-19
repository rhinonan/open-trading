# Skills 管理页改造 + 安装链路修复

**日期：** 2026-07-19  
**状态：** 已确认  
**范围：** `/settings/skills` UI 重做 + `skills-service` 发布契约修复（`.candidate.json` → `.meta.json`）+ meta 扩展（license / commit）

---

## 1. 背景与问题

### 1.1 用户反馈

- 下载 OK、审查 OK；点「安装选中」后提示成功，但已装列表为空
- 再装一次提示「已存在」，列表仍空

### 1.2 根因（已取证）

| 层 | 行为 |
|---|---|
| Staging 写入 | `data/skills-staging/<repo>/skills/<name>/.candidate.json` |
| Publish | `fs.renameSync` 整目录搬到 `data/skills/<name>/`，**不改文件名** |
| List | 只认 `.meta.json` + `SKILL.md`，缺 meta 则静默跳过 |
| 再装 | `fs.existsSync(dest)` → 「Skill 已存在」 |

磁盘证据（2026-07-19）：

- `data/skills/a-stock-data/` 有 `SKILL.md` + `.candidate.json`，**无** `.meta.json`（幽灵安装）
- `data/skills-staging/a-stock-data/` 仍在（二次下载的批次，审查已通过）

### 1.3 本次目标

1. **修发布契约**：publish 后正式目录一定有可被 `listSkills` 识别的 meta
2. **UI 改版**：主列表变表格 + toolbar 新增；安装走弹窗三步向导
3. **字段补齐**：协议、commit 在安装时抓取落盘
4. **覆盖更新**：更新按钮先检查，有更新则走同一向导并允许覆盖

非目标：

- 不重做审查 agent / workflow 逻辑
- 不引入新 UI 组件库依赖（无 table/stepper 组件则用语义 HTML + 现有 Dialog/Button/Badge）
- 不改挂载数据模型（仍 settings KV `skills_agent_mounts`）
- 不改 Agent 运行时 resolve 逻辑（仍读 `.enabled` + mounts）

---

## 2. 页面信息架构

### 2.1 主页面

```
┌──────────────────────────────────────────────────────────────┐
│ Skills                                      [+ 添加 Skill]   │  toolbar
├──────┬──────┬────────┬──────┬────┬────────┬────┬─────────────┤
│ 名称 │ 版本 │ 描述   │ 协议 │ GH │ commit │ 启 │ 操作        │
│      │      │ (截断) │      │ 图标│ short  │ 停 │ 更新 挂载 删除│
└──────┴──────┴────────┴──────┴────┴────────┴────┴─────────────┘
空态：暂无已安装的 Skill
```

规则：

- **主列表只显示已安装 skill**；staging 不再常驻主页，只出现在安装弹窗
- 安全警告文案**移入安装弹窗**标题下方（`DialogDescription` / 其下 warning 条）
- **启用**：行内开关，调用现有 `PATCH /api/skills/:name` `{ action: enable|disable }`
- **GitHub 列**：lucide `Github` 图标，外链 `sourceUrl`（`target=_blank rel=noopener`）
- **commit 列**：显示短 SHA（7 位）；无则 `—`；可悬停显示完整 sha
- **描述列**：单行截断 + `title` 全文
- **协议列**：如 `MIT` / `Apache-2.0`；未知 `—`

### 2.2 操作列

| 操作 | 行为 |
|---|---|
| 更新 | `POST /api/skills/:name/check-update`；无更新 toast「已是最新」；有更新打开安装向导（预填 URL，`mode=update`，允许覆盖） |
| 挂载 | 打开挂载小弹窗：Agent 列表多选勾选，确认后 `PUT /api/skills/mounts` |
| 删除 | 确认对话框 → `DELETE /api/skills/:name` → 刷新列表；同时清理 mounts 中对该 skill 的引用（见 §4.4） |

### 2.3 组件拆分（建议）

| 文件 | 职责 |
|---|---|
| `src/app/settings/skills/page.tsx` | 页面壳：toolbar + 拉列表 + 表格 + 弹窗开关 |
| `src/app/settings/skills/SkillsTable.tsx` | 表格渲染、启停、删除确认 |
| `src/app/settings/skills/InstallSkillDialog.tsx` | 三步安装向导（新增 + 更新共用） |
| `src/app/settings/skills/MountSkillDialog.tsx` | 挂载 Agent 勾选 |

无 shadcn `Table` / `Stepper` 时：表格用语义 `<table>`（对齐 `WorksTable` 风格），步骤条用轻量自定义（圆点 + 连线 + 当前步高亮）。

---

## 3. 安装向导

### 3.1 步骤

| Step | 标题 | UI | 主按钮 |
|---|---|---|---|
| 1 | 填写来源 | GitHub URL 输入；警告条在标题下 | 下一步 → 下载并审查 |
| 2 | 安全审查 | Spinner + 状态文案；完成后展示 verdict / summary / issues | 通过 → 进入 step3；失败 → 重新审查 / 放弃 |
| 3 | 选择安装 | candidates 勾选列表（默认全选） | 安装选中 → publish → 成功关窗刷新 |

### 3.2 状态机

```
idle ──打开──▶ step1
step1 ──提交 URL──▶ step2(loading)
step2 ──审查 pass──▶ step3
step2 ──审查 reject──▶ step2(failed) ──重审──▶ step2(loading)
step2/任意 ──放弃──▶ 删除 staging batch ──▶ 关闭
step3 ──publish ok──▶ 关闭 + 刷新列表
step3 ──publish err──▶ 停留 step3 显示错误
```

### 3.3 更新模式

- 打开参数：`{ mode: "update", sourceUrl, skillName }`
- Step1 预填并锁定 URL（只读）
- 下载前若同 repo 的 staging 批次已存在：先 discard 再装（或后端允许覆盖同 batchId）
- Publish 时 `overwrite: true`（或名单内 skill 允许覆盖）
- 覆盖后保留原 enabled 状态（若原先启用，覆盖后写回 `.enabled`）

### 3.4 弹窗内警告

标题下方固定：

> 安装 Skill 即引入可执行代码，请仅从信任来源安装。Skill 代码在服务器本机执行，可读取 Skill 文件但无宿主环境变量。

---

## 4. 后端修复与扩展

### 4.1 元数据契约（核心 bugfix）

**正式 skill 目录**（`data/skills/<name>/`）必须包含：

```
SKILL.md
.meta.json          ← 列表/详情唯一真相源
.enabled            ← 可选，存在即启用
（可选附属文件）
```

**禁止**在正式目录保留 `.candidate.json` 作为唯一 meta。

`publishCandidates` 变更：

1. 校验 review.verdict === pass
2. 对每个 name：
   - 读 `src = candidateDir`、`dest = skillDir`
   - 若 dest 存在且不允许覆盖 → 记入 errors，continue
   - 若允许覆盖：先读旧 enabled 状态，再 `rmSync(dest, {recursive})`
   - `renameSync(src, dest)` 或 copy+rm（Windows rename 跨盘容错可后补）
   - 读 `.candidate.json`（若有）→ 合并写入 `.meta.json` → **删除 `.candidate.json`**
   - 补齐 `license` / `commit`（见 §4.2）
   - 覆盖场景：若旧 enabled，写回 `.enabled`
3. 更新/清理 batch（无剩余 candidates 则 rm staging 批）
4. 有 errors 时：若 published 非空返回 `{ published, errors }` 部分成功；仅当 published 空才 throw/500

`listSkills` / `getSkill` 保持只读 `.meta.json`；可选兼容：若仅有 `.candidate.json`，启动时或 list 时升级为 `.meta.json`（一次性修复幽灵目录，推荐在 `listSkills` 开头做轻量 migrate）。

### 4.2 SkillMeta 扩展

```ts
export interface SkillMeta {
  name: string;
  description: string;
  version: string;
  sourceUrl: string;
  installedAt: string; // ISO
  enabled: boolean;    // 运行时由 .enabled 覆盖，不信任 json 内字段
  contentHash: string;
  license: string | null;   // 新增，如 "MIT" | "Apache-2.0" | null
  commit: string | null;    // 新增，完整 SHA
  commitShort: string | null; // 新增，前 7 位，冗余便于展示
}
```

**license 解析（安装/发布时）：**

- 在 batch 根或 candidate 目录找 `LICENSE` / `LICENSE.md` / `LICENSE.txt`（大小写不敏感）
- 启发式：内容含 `MIT License` → `MIT`；`Apache License` + `Version 2.0` → `Apache-2.0`；`BSD 3-Clause` → `BSD-3-Clause`；`BSD 2-Clause` → `BSD-2-Clause`；`ISC` → `ISC`；`Unlicense` → `Unlicense`；`CC0` → `CC0`
- 匹配不到 → `null`（显示 `—`）；审查仍负责拒绝传染性协议，本字段只做展示

**commit 抓取：**

- `installToStaging` 时额外调 GitHub：
  - `GET /repos/{owner}/{repo}/commits/{default_branch}` 或 git ref API
  - 取 `sha`，写入 batch 级或每个 candidate 的 meta
- 落盘到 `.meta.json` 的 `commit` / `commitShort`
- 失败不阻断安装，字段置 `null`

### 4.3 覆盖发布 API

`POST /api/skills/staging/[name]/publish`

```json
// request
{ "names": ["a-stock-data"], "overwrite": true }

// response success
{ "success": true, "published": ["a-stock-data"], "errors": [] }

// partial
{ "success": true, "published": ["foo"], "errors": ["Skill \"bar\" 已存在"] }
```

- 默认 `overwrite: false`（新增场景）
- 更新向导传 `overwrite: true`
- 前端对 `errors` 非空 toast 提示

### 4.4 删除时清理 mounts

`deleteSkill(name)` 之后（或 DELETE 路由内）：

- 读 `getAgentSkillMounts()`
- 从每个 agent 数组移除该 name
- `setAgentSkillMounts` 写回

避免表里没了 skill，mounts KV 仍挂着死引用。

### 4.5 Staging 同名批次

`installToStaging`：

- 若 `batchDir` 已存在：抛错「已在暂存区」**或**（推荐向导体验）提供 `force?: boolean`，为 true 时先 `discardStaging` 再装
- 更新模式 / 用户重试时前端传 force

### 4.6 幽灵安装 migrate

`listSkills` 内：

```
if (has SKILL.md && has .candidate.json && !has .meta.json) {
  rename/copy → .meta.json，补 license/commit 默认 null
}
```

一次 list 即可自愈当前 `a-stock-data` 幽灵目录。

### 4.7 附属文件（本期最小）

共享文件（LICENSE、README、assets）仍在 batch 根；publish 时：

- 至少把 **LICENSE*** 拷进正式 skill 目录（便于日后离线解析）
- 其他附属文件本期可不搬（与现状一致）；若 skill 运行依赖 scripts 且在 candidate 子树内，rename 已带上

---

## 5. API 一览（变更点）

| 方法 | 路径 | 变更 |
|---|---|---|
| GET | `/api/skills` | 返回扩展字段；触发幽灵 migrate |
| POST | `/api/skills` | 支持 body `{ url, force? }`；行为仍：staging + 自动审查 |
| POST | `/api/skills/staging/:batchId/publish` | body 增 `overwrite?`；响应增 `errors`；规范化 meta |
| DELETE | `/api/skills/:name` | 删正式 skill 时清理 mounts；staging discard 逻辑保留 |
| POST | `/api/skills/:name/check-update` | 无强制变更；返回信息供更新向导使用 |
| GET/PUT | `/api/skills/mounts` | 无契约变更 |

---

## 6. 错误处理

| 场景 | 表现 |
|---|---|
| URL 非法 | step1 内联错误 |
| GitHub API 失败 | step2 错误态，可返回 step1 |
| 审查 reject | step2 展示 issues，可重审/放弃 |
| publish 全部失败 | step3 错误文案，不关窗 |
| publish 部分成功 | 关窗刷新 + toast 列出失败项 |
| 删除不存在 | 404，toast |
| 网络错误 | toast「网络错误」 |

---

## 7. 测试与验收

手动冒烟：

1. 清理或保留现有幽灵 `data/skills/a-stock-data` → 打开页面 → 列表应出现该 skill（migrate）或可删除后重装
2. 添加 `https://github.com/simonlin1212/a-stock-data` → 三步走完 → 列表有行，含版本/协议/commit/GH 图标
3. 再装同一 URL → force 或「已在暂存」处理不卡死
4. 更新：无新版本提示已是最新；有版本差则向导覆盖后列表刷新，enabled 状态保留
5. 挂载勾选 → Agent mounts 正确；删除 skill 后 mounts 无残留
6. 启停开关 → `.enabled` 文件创建/删除；`listSkills` enabled 字段正确

可选：`pnpm test` 若有 skills-service 单测则补 publish 规范化用例；无则不强制建测框架。

---

## 8. 实现顺序建议

1. **服务层 bugfix**：`publishCandidates` meta 规范化 + 幽灵 migrate + SkillMeta 扩展 + license/commit 抓取 + overwrite + 删 mounts
2. **API 小改**：publish body/响应、install force
3. **UI**：表格页 + InstallSkillDialog + MountSkillDialog
4. 手动冒烟

---

## 9. 已确认决策摘要

| 项 | 决策 |
|---|---|
| 布局 | 表格 + toolbar 新增 |
| 安装 | 弹窗三步向导 |
| 警告 | 弹窗标题下 |
| 启停/挂载 | 本页保留；行内开关 + 挂载弹窗 |
| 更新 | 检查后走向导覆盖 |
| license/commit | 安装时抓取落盘 |
| 实现路径 | 就地改造，不先大重构 |
