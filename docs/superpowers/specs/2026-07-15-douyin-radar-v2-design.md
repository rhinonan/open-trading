# 抖音雷达 V2 优化设计

> 日期：2026-07-15
> 状态：已确认
> 基于：[抖音监控设计](./2026-07-11-douyin-monitor-design.md) | [流水线设计](./2026-07-12-douyin-pipeline-asr-design.md) | [V1 优化设计](./2026-07-15-douyin-radar-optimization-design.md)

## 目标

1. 默认页面定位到抖音雷达，移除仪表盘
2. 详情页 URL 使用固定长度 slug（SHA256 前 12 位）
3. 去掉博主分类（预测类/技术类），每条视频独立四档评判
4. 扫描器分页循环，支持环境变量配置截止日期
5. 博主列表支持三维度排序

---

## 一、路由 & 导航

### 1.1 默认页重定向

`src/app/page.tsx` 内容替换为：

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/douyin");
}
```

### 1.2 侧边栏

`NAV_ITEMS` 删除「仪表盘」项：

```
抖音雷达  →  /douyin
个股分析  →  /stocks
行业分析  →  /industry
舆情分析  →  /sentiment
财报研报  →  /financials
Agent管理 →  /agents
设置      →  /settings
```

### 1.3 仪表盘组件

`src/components/dashboard/` 目录保留不删，后续可能复用。

---

## 二、固定长度 slug

### 2.1 生成规则

```
slug = SHA256(douyin_uid).toString("hex").slice(0, 12)
```

### 2.2 路由变更

| 旧路由 | 新路由 |
|--------|--------|
| `/douyin/[id]` | `/douyin/[slug]` |
| `/api/douyin/bloggers/[id]` | `/api/douyin/bloggers/[slug]` |

### 2.3 数据库变更

```sql
ALTER TABLE bloggers ADD COLUMN slug TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX idx_bloggers_slug ON bloggers(slug);
```

现有博主跑一次性脚本计算 slug。

### 2.4 涉及文件

- `src/db/schema.ts` — bloggers 表新增 slug 字段
- `src/services/douyin/blogger-service.ts` — addBlogger 写入时计算；getBloggerById → getBloggerBySlug
- `src/app/api/douyin/bloggers/[slug]/route.ts` — 路径参数改为 slug
- `src/app/douyin/[slug]/page.tsx` — 路由参数改为 slug
- `src/app/douyin/page.tsx` — 列表链接改为 `/douyin/${blogger.slug}`
- `src/app/douyin/[slug]/page.tsx` — records API 查询参数改为 `blogger_slug`
- `src/app/api/douyin/records/route.ts` — 支持 `blogger_slug` 参数

---

## 三、去掉博主分类

### 3.1 数据库变更

bloggers 表删除以下字段：

```sql
ALTER TABLE bloggers DROP COLUMN category;
ALTER TABLE bloggers DROP COLUMN classified_at;
ALTER TABLE bloggers DROP COLUMN classification_note;
```

`works`、`evaluations`、`prediction_items` 结构不变。

### 3.2 前端变更

**首页 (`/douyin`)：**
- 删除分类统计卡片（"N 预测类博主 / N 技术类博主"）
- 删除分类 Tab 切换
- 博主卡片删除分类 Badge
- 所有博主扁平化展示在一个列表

**设置页 (`/settings`)：**
- 添加博主表单删除分类选择下拉
- 博主列表删除分类 Badge
- `POST /api/douyin/bloggers` body 不再需要 `category`

**详情页 (`/douyin/[slug]`)：**
- 移除基于 `category` 的差异化 tab 逻辑
- 统一为两个 tab：**作品列表** + **评判汇总**
- 顶部博主信息栏删除分类标签和分类备注

### 3.3 类型变更

```typescript
// 移除
type BloggerCategory = "predictor" | "technical";

// DouyinBlogger 删除字段
//   category, classifiedAt, classificationNote

// DouyinBloggerWithOpinion 同样删除
```

---

## 四、视频四档评判

### 4.1 评判标准

| 等级 | 字段值 | 含义 |
|------|--------|------|
| 正确 | `correct` | 预测方向、目标、时间均准确 |
| 基本正确 | `mostly_correct` | 大方向对，细节有偏差 |
| 不正确 | `incorrect` | 预测错误 |
| 不涉及 | `not_applicable` | 纯交流/分享，不含预测内容 |

### 4.2 数据库变更

prediction_items 表：

```sql
-- 删除旧的二值字段
ALTER TABLE prediction_items DROP COLUMN is_correct;

-- 新增四档字段
ALTER TABLE prediction_items ADD COLUMN judgment TEXT NOT NULL DEFAULT 'not_applicable';
-- judgment CHECK (judgment IN ('correct', 'mostly_correct', 'incorrect', 'not_applicable'))
```

### 4.3 准确率计算

```
准确率 = (correct + mostly_correct) / (correct + mostly_correct + incorrect) × 100%
```

`not_applicable` 不参与分母。若分母为 0，准确率显示为 `--`。

### 4.4 前端展示

**作品列表 Tab：** 每条作品显示评判徽章

| 评判 | 颜色 | 图标 |
|------|------|------|
| `correct` | 绿色 | ✅ |
| `mostly_correct` | 蓝绿色 | 💚 |
| `incorrect` | 红色 | ❌ |
| `not_applicable` | 灰色 | — |

**评判汇总 Tab：**
- 四档柱状/环形分布图
- 各档数量和占比
- 准确率百分比（综合指标）
- 按日期的时间线记录

---

## 五、扫描分页循环

### 5.1 环境变量

```bash
DOUYIN_SCAN_CUTOFF_DATE=2026-06-01
```

`.env` 和 `.env.example` 均添加此项。

### 5.2 分页逻辑

```typescript
async function scanBlogger(blogger: DouyinBlogger): Promise<ScanResult> {
  let cursor = 0;
  let hasMore = true;
  let pageCount = 0;
  const MAX_PAGES = 50;
  const cutoffTimestamp = Date.parse(process.env.DOUYIN_SCAN_CUTOFF_DATE || "2026-06-01") / 1000;

  while (hasMore && pageCount < MAX_PAGES) {
    const { awemeList, nextCursor, hasMore: more } = await fetchUserPosts(blogger.douyinUid, cursor, 20);

    for (const post of awemeList) {
      if (post.create_time < cutoffTimestamp) {
        hasMore = false;
        break;  // 当前页更早的不入库，停止翻页
      }
      // 去重 → 入库（逻辑不变）
    }

    if (!more) hasMore = false;
    cursor = nextCursor;
    pageCount++;
  }
}
```

### 5.3 TikHub API 适配

`fetchUserPosts` 签名变更：

```typescript
// 旧
async function fetchUserPosts(secUid: string, count = 10): Promise<DouyinVideoData[]>

// 新
async function fetchUserPosts(
  secUid: string,
  maxCursor = 0,
  count = 20
): Promise<{ awemeList: DouyinVideoData[]; nextCursor: number; hasMore: boolean }>
```

返回 `max_cursor` 和 `has_more` 供外层循环使用。

### 5.4 边界处理

- 新添加博主首次扫描：同样受 `DOUYIN_SCAN_CUTOFF_DATE` 约束
- 50 页安全上限：达到后静默停止，不报错
- API 异常：单页失败记录到 errors，中断该博主扫描

---

## 六、博主列表排序

### 6.1 三个维度

| 维度 | 排序依据 | 说明 |
|------|----------|------|
| 粉丝数（默认） | `follower_count DESC` | 按粉丝数降序 |
| 最近更新 | `latest_work_at DESC` | 最新作品发布时间 |
| 准确率 | `accuracy DESC` | `(correct + mostly_correct) / 总数` |

### 6.2 实现方式

前端排序（数据量不会太大，全量加载后前端排序足够）：

```tsx
const SORT_OPTIONS = [
  { key: "followers", label: "粉丝数" },
  { key: "recent", label: "最近更新" },
  { key: "accuracy", label: "准确率" },
] as const;

// API 返回数据包含：followerCount, latestWorkAt, accuracy
// 默认 sortBy = "followers"
```

API `/api/douyin/bloggers` 扩展返回字段：
- `latestWorkAt` — 已有（`include=latest_opinion` 时返回）
- `accuracy` — 新增计算：从 evaluations 汇总

### 6.3 前端 UI

列表顶部排序栏：

```
[ 粉丝数 ▼ ] [ 最近更新 ] [ 准确率 ]
```

三个按钮切换，当前选中项高亮 + 三角箭头。

---

## 七、API 变更汇总

| Method | Route | 变更 |
|--------|-------|------|
| `GET` | `/api/douyin/bloggers` | 移除 `?category=`；返回字段增加 `slug`、`accuracy`；删除 `category` |
| `POST` | `/api/douyin/bloggers` | body 不再需要 `category` |
| `GET` | `/api/douyin/bloggers/[slug]` | 路径参数 `id` → `slug`；`?include=works` 不变 |
| `DELETE` | `/api/douyin/bloggers/[slug]` | 路径参数 `id` → `slug` |
| `POST` | `/api/douyin/scan` | 内部逻辑改为分页循环 |
| `POST` | `/api/douyin/transcribe` | 不变 |
| `POST` | `/api/douyin/evaluate` | 评判逻辑改为四档输出 |
| `GET` | `/api/douyin/records` | 支持 `blogger_slug` 参数；返回 judgment 四档值 |

---

## 八、数据库迁移

Drizzle migration 需要按序处理：

```sql
-- 1. bloggers 表新增 slug
ALTER TABLE bloggers ADD COLUMN slug TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX idx_bloggers_slug ON bloggers(slug);

-- 2. bloggers 表删除分类字段
ALTER TABLE bloggers DROP COLUMN category;
ALTER TABLE bloggers DROP COLUMN classified_at;
ALTER TABLE bloggers DROP COLUMN classification_note;

-- 3. prediction_items 表变更
ALTER TABLE prediction_items DROP COLUMN is_correct;
ALTER TABLE prediction_items ADD COLUMN judgment TEXT NOT NULL DEFAULT 'not_applicable';
```

存量数据脚本：
- 遍历已有 bloggers，计算 `SHA256(douyin_uid)` 前 12 位 → 填入 slug

---

## 九、类型系统更新

```typescript
// ===== 移除 =====
// BloggerCategory
// PredictionType
// PredictionMix

// ===== 新增 =====
type JudgmentResult = "correct" | "mostly_correct" | "incorrect" | "not_applicable";

type SortDimension = "followers" | "recent" | "accuracy";

// ===== 变更 =====
interface DouyinBlogger {
  id: number;
  slug: string;                    // 新增
  douyinUid: string;
  nickname: string;
  avatarUrl: string;
  signature: string;
  followerCount: number;
  // category, classifiedAt, classificationNote 删除
  createdAt: number;
  updatedAt: number;
}

interface DouyinBloggerWithOpinion extends DouyinBlogger {
  latestOpinion: string;
  latestWorkAt: number | null;
  accuracy: number | null;          // 新增
}

interface PredictionItem {
  id: number;
  evaluationId: number;
  workId: number;
  predictedContent: string;
  predictionTarget: string;
  predictionDetail: string;
  judgment: JudgmentResult;         // 替代 is_correct + 原 judgment
  relatedSymbols: string;
  // predictionType 删除
}
```

---

## 十、涉及文件清单

### 数据库 & 迁移
- `src/db/schema.ts`
- `drizzle/` 新增 migration SQL

### 后端 API
- `src/app/api/douyin/bloggers/route.ts`
- `src/app/api/douyin/bloggers/[slug]/route.ts`（原 `[id]/route.ts`）
- `src/app/api/douyin/scan/route.ts`
- `src/app/api/douyin/evaluate/route.ts`
- `src/app/api/douyin/records/route.ts`

### Service 层
- `src/services/douyin/blogger-service.ts`
- `src/services/douyin/scanner-service.ts`
- `src/services/douyin/evaluator-service.ts`

### 数据层
- `src/lib/douyin-api.ts`

### 前端页面
- `src/app/page.tsx`
- `src/app/douyin/page.tsx`
- `src/app/douyin/[slug]/page.tsx`（原 `[id]/page.tsx`）
- `src/app/settings/page.tsx`

### 组件
- `src/components/layout/sidebar.tsx`

### 类型 & 配置
- `src/types/index.ts`
- `.env`
- `.env.example`
