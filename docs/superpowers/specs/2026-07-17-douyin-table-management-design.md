# 抖音雷达表格化管理设计

> 日期：2026-07-17
> 状态：已确认
> 基于：[抖音雷达 V2 设计](./2026-07-15-douyin-radar-v2-design.md)

## 目标

将 `/settings/douyin` 从简单表单页面改造为以视频为粒度的数据表格管理界面，直观展示每个博主、每个视频的处理状态，支持单视频操作、批量勾选操作和筛选搜索。

---

## 一、页面概述

替换 `src/app/settings/douyin/page.tsx` 为全新的表格管理界面，保持设置页的 Tab 布局不变（基础设置 / 抖音雷达）。

页面结构自上而下：
1. **顶部操作栏** — 添加博主、扫描全部、全部转写、收盘评判
2. **筛选栏** — 博主多选、转写状态、评判结果、搜索框 + 批量操作按钮
3. **数据表格** — 视频为行的分页表格，带勾选、行内展开详情
4. **分页器** — 页码导航

---

## 二、API 设计

### 新增路由

| Method | Route | 说明 |
|--------|-------|------|
| `GET` | `/api/douyin/works` | 分页查询所有视频，支持筛选 |
| `POST` | `/api/douyin/works/[id]/transcribe` | 单视频触发转写 |
| `POST` | `/api/douyin/works/[id]/summarize` | 单视频提取观点 |
| `POST` | `/api/douyin/works/batch` | 批量操作 |

### 保留路由

现有的 `POST /api/douyin/scan`、`POST /api/douyin/transcribe`、`POST /api/douyin/evaluate` 保留不动。

### GET /api/douyin/works

查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `blogger_slug` | string | — | 逗号分隔的多选过滤 |
| `transcript_status` | string | — | pending / processing / done / failed |
| `judgment` | string | — | correct / mostly_correct / incorrect / not_applicable |
| `search` | string | — | 模糊匹配视频描述 |
| `page` | number | 0 | 页码 |
| `perPage` | number | 20 | 每页条数（上限 50） |

返回结构：

```ts
{
  works: Array<{
    id: number;
    awemeId: string;
    desc: string;
    coverUrl: string;
    duration: number;
    statistics: string;            // JSON string
    publishedAt: number;
    transcriptStatus: TranscriptStatus;
    transcript: string | null;
    opinionSummary: string;        // 空字符串表示未提取
    blogger: {
      id: number;
      slug: string;
      nickname: string;
      avatarUrl: string;
      followerCount: number;
    };
    judgment: {                    // 可能为 null
      judgment: JudgmentResult;
      predictedContent: string;
    } | null;
    evaluationId: number | null;
  }>;
  total: number;
  page: number;
  perPage: number;
  filterCounts: {                  // 各状态的计数，供筛选器展示
    transcriptStatus: Record<string, number>;
    judgment: Record<string, number>;
  };
}
```

### POST /api/douyin/works/[id]/transcribe

- 对单个视频触发转写（调用 transcriber）
- 返回：`{ success: true, workId, status: "processing" }`
- 如果该视频已在处理中 → 409 `{ error: "该视频正在转写中" }`

### POST /api/douyin/works/[id]/summarize

- 对单个已转写视频调用 LLM 提取观点摘要
- 写入 `works.opinion_summary` 字段
- 返回：`{ success: true, workId, summary }`
- 如果未转写 → 400 `{ error: "请先转写视频" }`

### POST /api/douyin/works/batch

Body：`{ workIds: number[], action: "transcribe" | "summarize" }`

- 遍历 workIds，依次触发对应操作
- 返回：`{ total: number, succeeded: number, failed: number, errors: Array<{ workId, error }> }`

---

## 三、UI 设计

### 3.1 顶部操作栏

```
┌──────────────────────────────────────────────────────────┐
│ [+ 添加博主]  [🔄 扫描全部]  [🎤 全部转写]  [📊 收盘评判] │
└──────────────────────────────────────────────────────────┘
```

- "添加博主"打开 Dialog 弹窗（sec_uid 输入 + 添加按钮）
- 其余三个按钮保留现有逻辑（调用全量 API）
- 每个按钮带 loading 状态，结果用 Toast 通知

### 3.2 筛选栏

```
┌───────────────────────────────────────────────────────────────────┐
│ [👤 全部博主 ▼]  [📋 全部状态 ▼]  [📊 全部评判 ▼]  [🔍 搜索... ] │
│                                                                   │
│ 已选 3 项 →  [🎤 批量转写]  [📝 批量提取观点]                     │
└───────────────────────────────────────────────────────────────────┘
```

- **博主下拉**：多选 Checkbox 列表，支持"全选/取消全选"
- **转写状态**：下拉单选 — 全部 / 待处理 / 转写中 / 已转写 / 失败
- **评判结果**：下拉单选 — 全部 / 正确 / 基本正确 / 不正确 / 不涉及 / 未评判
- **搜索框**：输入防抖 300ms，模糊匹配视频描述
- **批量操作按钮**：仅在勾选 ≥1 项时显示，显示已选数量

### 3.3 数据表格

```
┌───┬──────────┬──────────────────┬──────┬────────┬────────┬────────┬────────┐
│ ☐ │ 博主      │ 视频              │ 发布  │ 转写   │ 观点   │ 评判   │ 操作   │
├───┼──────────┼──────────────────┼──────┼────────┼────────┼────────┼────────┤
│ ☐ │ 🥷 张三  │ 🎬 明天大盘要涨... │ 2h前 │✅ 已转写│✅ 已提取│✅ 正确  │ 📝 ▶  │
│   │ 50.2w粉 │    00:32         │      │        │        │        │        │
├───┼──────────┼──────────────────┼──────┼────────┼────────┼────────┼────────┤
│ ☐ │ 🥷 李四  │ 🎬 板块要爆发...  │ 5h前 │⏳ 待处理│  —     │  —     │ 🎤    │
│   │ 30.8w粉 │    01:15         │      │        │        │        │        │
└───┴──────────┴──────────────────┴──────┴────────┴────────┴────────┴────────┘
```

列定义：

| 列 | 宽度 | 内容 |
|----|------|------|
| ☐ | 40px | 勾选框（表头为全选/取消全选当前页） |
| 博主 | 140px | 头像(24px圆形) + 昵称(truncate) + 粉丝数 |
| 视频 | 自适应 | 封面缩略图(40x56) + 描述(1行截断) + 时长 |
| 发布时间 | 80px | 相对时间，hover 显示完整时间 |
| 转写状态 | 80px | 彩色徽章 |
| 观点状态 | 80px | 已提取/未提取 |
| 评判结果 | 80px | 评判徽章或 — |
| 操作 | 60px | 根据状态动态渲染按钮 |

状态徽章颜色：

| 状态 | 颜色 | 图标 |
|------|------|------|
| 待处理 | 灰色 | ⏳ |
| 转写中 | 黄色 | 🔄 |
| 已转写 | 绿色 | ✅ |
| 失败 | 红色 | ❌ |
| 已提取观点 | 绿色 | ✅ |

评判徽章复用现有 `JUDGMENT_CONFIG`（✅ 💚 ❌ ➖）。

操作列按钮逻辑：
- 转写状态 = pending/failed → 显示「🎤 转写」
- 转写状态 = done 且 opinionSummary 为空 → 显示「📝 提取」
- 始终显示「▶」展开详情按钮

### 3.4 行内展开详情面板

点击 ▶ 或双击行，在行下方展开：

```
┌──────────────────────────────────────────────────────────────────┐
│ 📹 视频详情                                                      │
│ ┌────────────┬──────────────────────────────────────────────────┐│
│ │ 封面大图   │ 完整文案: "...明天大盘要涨到3500点..."            ││
│ │            │ 转写文本: "...大家好，今天来聊聊大盘..."          ││
│ │            │                                                  ││
│ │            │ 👍 1.2万  💬 3,562  ↗ 892  ▶ 45.6万             ││
│ │            │                                                   ││
│ │            │ [🔗 在新页查看完整详情]                            ││
│ └────────────┴──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### 3.5 添加博主弹窗

使用 Dialog 组件：
- 标题：「添加抖音博主」
- 输入框：sec_uid
- 按钮：取消 / 添加（loading 态）
- 成功后：关闭弹窗 + 刷新表格 + 刷新博主下拉

### 3.6 分页器

```
         第 1/5 页   [← 上一页] [下一页 →]
```

- 切换页时重新请求 API
- 保持勾选状态在跨页时清空（避免"已选 N 项但不可见"的困惑）

### 3.7 空状态 & 加载态

- **加载中**：表格骨架屏 (Skeleton 行 × 10)
- **空数据**：插画 + "暂无视频数据，请先添加博主并扫描"
- **筛选无结果**："没有匹配的视频，请调整筛选条件"
- **错误状态**：行内错误提示 + 重试按钮

---

## 四、组件架构

### 组件树

```
src/app/settings/douyin/page.tsx          ← 主页面（重写）
├── AddBloggerDialog.tsx                   ← 添加博主弹窗
├── FilterBar.tsx                          ← 筛选栏 + 批量操作
├── WorksTable.tsx                         ← 数据表格主体
│   ├── WorkRow.tsx                        ← 单行视频
│   └── WorkDetailPanel.tsx               ← 行内展开详情
└── (现有操作按钮保留：扫描全部、全部转写、收盘评判)
```

### 文件变更清单

| 文件 | 操作 |
|------|------|
| `src/app/settings/douyin/page.tsx` | **重写** |
| `src/app/settings/douyin/AddBloggerDialog.tsx` | **新增** |
| `src/app/settings/douyin/FilterBar.tsx` | **新增** |
| `src/app/settings/douyin/WorksTable.tsx` | **新增** |
| `src/app/settings/douyin/WorkRow.tsx` | **新增** |
| `src/app/settings/douyin/WorkDetailPanel.tsx` | **新增** |
| `src/app/api/douyin/works/route.ts` | **新增** |
| `src/app/api/douyin/works/[id]/transcribe/route.ts` | **新增** |
| `src/app/api/douyin/works/[id]/summarize/route.ts` | **新增** |
| `src/app/api/douyin/works/batch/route.ts` | **新增** |
| `src/services/douyin/works-service.ts` | **新增** |
| `src/types/index.ts` | **修改**（新增 WorkWithBlogger 等类型） |

---

## 五、类型补充

```typescript
// 新增类型
export interface WorkWithBlogger {
  id: number;
  awemeId: string;
  desc: string;
  coverUrl: string;
  duration: number;
  statistics: string;
  publishedAt: number;
  transcriptStatus: TranscriptStatus;
  transcript: string | null;
  opinionSummary: string;
  blogger: {
    id: number;
    slug: string;
    nickname: string;
    avatarUrl: string;
    followerCount: number;
  };
  judgment: {
    judgment: JudgmentResult;
    predictedContent: string;
  } | null;
  evaluationId: number | null;
}

export interface WorksFilter {
  bloggerSlugs?: string[];
  transcriptStatus?: TranscriptStatus;
  judgment?: JudgmentResult;
  search?: string;
  page: number;
  perPage: number;
}

export interface FilterCounts {
  transcriptStatus: Record<string, number>;
  judgment: Record<string, number>;
}

export interface WorksResponse {
  works: WorkWithBlogger[];
  total: number;
  page: number;
  perPage: number;
  filterCounts: FilterCounts;
}

export type BatchAction = "transcribe" | "summarize";
```

---

## 六、边界情况

| 场景 | 处理 |
|------|------|
| 视频正在转写中 | 单视频转写 → 409；批量操作中跳过并记录错误 |
| 视频未转写但请求提取观点 | 400 "请先转写视频" |
| 批量操作包含无效 workId | 跳过 + 错误列表返回，不中断整个批量 |
| 勾选跨页清空 | 切换页时清空勾选，提示"已清空跨页选择" |
| 删除博主后表格有残留数据 | 前端刷新表格 + 筛选下拉 |
| 添加已存在的博主 | 后端 409，前端 Toast "博主已存在" |
| 转写/观点提取超时 | 前端按钮恢复可用 + Toast 错误提示 |
| 表格数据为空 | 显示空状态，引导添加博主 + 扫描 |

---

## 七、明确不做 (YAGNI)

- 拖拽排序、列自定义、导出 CSV
- 实时 WebSocket 推送转写进度
- 删除博主操作不在表格中暴露（保留确认弹窗的安全性）
- 表格中的"删除视频"操作
- 评判操作不在此页面进行（收盘评判保留全量按钮即可）
