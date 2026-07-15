# 抖音雷达优化设计

> 日期：2026-07-15
> 状态：已确认
> 基于：[抖音监控设计](./2026-07-11-douyin-monitor-design.md) | [流水线设计](./2026-07-12-douyin-pipeline-asr-design.md)

## 目标

1. 抖音雷达从"舆情分析"中独立为一
2. 博主按"预测类"/"技术类"手动分类，技术类不走准确率评判
3. 管理功能（添加博主、扫描、转写）迁入设置页，首页只读

---

## 一、导航 & 路由

### 侧边栏调整

```
抖音雷达  →  /douyin         ← 新增，首位
仪表盘    →  /
个股分析  →  /stocks
行业分析  →  /industry
舆情分析  →  /sentiment       ← 去掉抖音子页
财报研报  →  /financials
Agent管理 →  /agents
设置      →  /settings         ← 新增抖音管理区域
```

### 路由迁移

| 旧路径 | 新路径 | 说明 |
|--------|--------|------|
| `/sentiment/douyin` | `/douyin` | 抖音雷达首页 |
| `/sentiment/douyin/[id]` | `/douyin/[id]` | 博主详情 |
| `/api/douyin/*` | `/api/douyin/*` | API 路径不变 |

### 涉及文件

- `src/components/layout/sidebar.tsx` — NAV_ITEMS 新增抖音雷达，调整顺序
- `src/app/sentiment/page.tsx` — 移除"抖音监控"tab，回归纯舆情概览
- `src/app/sentiment/douyin/page.tsx` → `src/app/douyin/page.tsx` — 重写为只读首页
- `src/app/sentiment/douyin/[id]/page.tsx` → `src/app/douyin/[id]/page.tsx` — 迁移，按分类差异化
- `src/app/settings/page.tsx` — 新增抖音管理区域

---

## 二、数据模型

### bloggers.category 值域变更

```
旧：pending | predictor | non_predictor
新：predictor | technical
```

移除 `non_predictor`（不再需要 AI 分类的中间态），移除 `pending`（手动分类无需默认值）。

### 迁移（Drizzle）

```sql
-- 新增 migration：category 列的值域变更
-- 存量数据（pending/non_predictor）需要用户在设置页手动重新分类
-- migration 不做自动映射，仅确保新值约束生效
```

> 处理方式：已有博主的 category 如果不在新值域内，前端展示为"未分类"，用户在设置页手动选择 predictor/technical。

### TypeScript 类型

```typescript
type BloggerCategory = "predictor" | "technical";

// DouyinBlogger 其余字段不变
// classified_at / classification_note 保留但不再作为必须项
```

其他表（works、evaluations、prediction_items）结构不变。

---

## 三、抖音雷达首页 `/douyin`

### 布局

- **顶部统计卡片行**：仅两个数字——预测类博主数、技术类博主数
- **分类 Tab**：[ 预测类 ] [ 技术类 ]，默认选中"预测类"
- **博主列表**（卡片式，单列）：
  - 每条卡片：头像、昵称、分类标签、粉丝数
  - 预测类额外展示准确率（百分比徽章）
  - 最新观点摘要（取该博主最近一条已转写作品的 transcript，LLM 提取一句话摘要）
  - 相对时间（"2小时前"、"昨天"）+ 查看详情入口
- **空状态**：插画 + "暂无博主，请前往设置 > 抖音雷达管理添加"

### 数据获取

- `GET /api/douyin/bloggers` 获取全部博主
- 每位博主的"最新观点摘要"可通过 API 扩展字段返回，或在博主列表接口中 join 最新一条 done 状态的 work

---

## 四、博主详情页 `/douyin/[id]`

### 预测类：三个 Tab

| Tab | 内容 |
|-----|------|
| 预测记录 | 按日期倒序，每次评判结果：准确率徽章、预测摘要、具体预测项卡片（类型标签、标的、原文引用、对错标识） |
| 准确率趋势 | 横向柱状图：evalDate vs accuracyScore |
| 作品列表 | 3 列封面网格 + 转写状态标签 + 播放量，点击进入 WorkDetailSheet（封面/描述/统计/转写文字） |

### 技术类：两个 Tab

| Tab | 内容 |
|-----|------|
| 观点总结 | 按日期倒序，每条作品转写后 LLM 提取核心观点摘要（无对错判断，纯归纳） |
| 作品列表 | 同上，3 列网格 |

### 顶部博主信息栏

两个分类共用：头像、昵称、分类标签、粉丝数、简介。

---

## 五、设置页 `/settings`

在现有设置页追加"抖音雷达管理"section：

### 添加博主

- 输入框：抖音 `sec_uid`
- 下拉选择：预测类 / 技术类
- 添加按钮（调用 `POST /api/douyin/bloggers`）

### 已添加博主列表

- 每行：头像、昵称、分类标签、粉丝数、删除按钮
- 删除带确认提示（调用 `DELETE /api/douyin/bloggers/[id]`）

### 操作区

- "扫描全部博主"按钮（`POST /api/douyin/scan`）— 带 loading 和结果反馈
- "开始转写"按钮（`POST /api/douyin/transcribe`）— 带 loading 和结果反馈

### 逻辑来源

管理功能的代码从当前 `/sentiment/douyin/page.tsx` 的管理操作部分迁移过来，API 调用逻辑不变。

---

## 六、API 变更

现有 API 全部保留，路由不变：

| Method | Route | 说明 |
|--------|-------|------|
| `GET` | `/api/douyin/bloggers` | 列表查询，新增 `?category=predictor\|technical` 过滤（已有此能力） |
| `POST` | `/api/douyin/bloggers` | 新增博主，body 增加 `category: "predictor" \| "technical"` |
| `GET` | `/api/douyin/bloggers/[id]` | 博主详情，不变 |
| `DELETE` | `/api/douyin/bloggers/[id]` | 删除博主，不变 |
| `POST` | `/api/douyin/scan` | 触发扫描，不变 |
| `POST` | `/api/douyin/transcribe` | 触发转写，不变 |
| `GET` | `/api/douyin/records` | 查询预测记录，不变 |

### 需要调整的服务层

- `blogger-service.ts`：`addBlogger(uid, category)` 接收 category 参数，不再默认 `"pending"`
- `scanner-service.ts`：保持不变（扫描时不需要区分分类）
- `evaluator-service.ts`：评判时按 `category = "predictor"` 过滤博主

---

## 七、技术类观点总结（新增能力）

技术类博主不经过 `evaluations` 评判流程。观点总结的实现方案：

- 作品转写完成后，对每条 transcript 调 LLM 提取核心观点摘要
- 摘要存储在 works 表新增字段 `opinion_summary TEXT`，或单独建表
- 前端"观点总结"tab 直接查询 works 中有 transcript 且已提取摘要的记录，按 `published_at` 倒序展示

建议：先存 `works.opinion_summary` 字段，简单直接。后续如果观点内容变复杂再拆表。

### Drizzle migration

```sql
ALTER TABLE works ADD COLUMN opinion_summary TEXT DEFAULT '';
```

---

## 八、边界情况

- 删除博主 → 级联删除 works/evaluations/prediction_items（已实现）
- 添加重复博主 → 后端返回 409（已实现）
- 博主无已转写作品 → 最新观点摘要显示"暂无观点"
- 预测类博主尚无评判记录 → 准确率显示"暂无数据"
- 技术类博主无作品 → 观点总结 tab 显示空状态
- 视频文件清理 → `VIDEO_RETENTION_DAYS` 到期自动删除（已实现）
- 转写失败的作品 → 作品列表中显示"转写失败"红色标签，不计入观点总结
