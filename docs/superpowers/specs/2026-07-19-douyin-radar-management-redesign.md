# 抖音雷达管理界面优化设计

## 目标

将 `settings/douyin` 管理页从嵌套表格（BloggerTable → 展开行 → VideoSubTable）重构为左右 master-detail 布局，提升操作效率和信息密度。

## 布局

```
┌──────────────────────────────────────────────────────────┐
│  settings/douyin/page.tsx                                │
│                                                          │
│  ┌──────────┬───────────────────────────────────────────┐│
│  │ Blogger  │  WorksTable                                ││
│  │ Sidebar  │  ┌────┬──────┬────┬────┬────┬────┬──────┐││
│  │          │  │封面│描述  │类型│时长│转写│观点│操作  │││
│  │  🔍搜索  │  ├────┼──────┼────┼────┼────┼────┼──────┤││
│  │          │  │    │xxx   │视频│3:20│ ✓  │... │📋🔄💡│││
│  │  博主A ◄ │  │    │xxx   │图集│ -  │ ✓  │... │📋🔄💡│││
│  │  博主B   │  │    │xxx   │视频│1:05│ ⏳ │ -  │📋🔄  │││
│  │  博主C   │  └────┴──────┴────┴────┴────┴────┴──────┘││
│  │          │                              < 1 2 3 ... > ││
│  │  (hover  │                                             ││
│  │  显示    │  WorkDrawer (Sheet, 右侧滑出)               ││
│  │  📡 🗑)  │  ┌─────────────────────────────────┐      ││
│  │          │  │ 转写文本 / 观点摘要 / 预测明细   │      ││
│  └──────────┘  └─────────────────────────────────┘      ││
└──────────────────────────────────────────────────────────┘
```

- 左侧 `BloggerSidebar`：固定宽 240px，顶部搜索框过滤，hover 显示操作图标
- 右侧 `WorksTable`：选中博主后加载作品，服务端分页，自动轮询
- `WorkDrawer`：Sheet 右侧滑出，展示作品详情
- 观点列用 HoverCard 浮层显示全文

## 组件

### BloggerSidebar

- 顶部搜索框（本地过滤博主列表）
- 列表项：头像 + 昵称 + 粉丝数
- hover 时右侧浮现扫描（📡）、删除（🗑）图标
- 选中态高亮（bg-accent）
- 空态："暂无博主，请先添加"
- 加载态：Skeleton 占位

### WorksTable

- **无选中博主时**：占位提示"请从左侧选择博主"
- **有选中博主时**：调 `GET /api/douyin/works?blogger_slugs={slug}&page={n}`，服务端分页（默认每页 20 条）
- **轮询**：当前页存在 `transcriptStatus === 'processing'` 或 `evalStatus === 'processing'` 的作品时，每 5s 自动刷新；全部稳定后停止
- **空态**：该博主暂无作品
- **加载态**：Skeleton 表格行
- **分页**：底部分页控件（上一页/下一页 + 页码）

### WorkRow

表格列（从左到右）：

| 列 | 内容 | 备注 |
|---|---|---|
| 封面 | 40px 缩略图 | coverUrl 为空时显示占位图标 |
| 描述 | 文字截断（单行省略） | 无描述显示"(无文案)" |
| 类型 | Badge：视频（蓝色）/ 图集（紫色） | `mediaType === 4` 为视频 |
| 时长 | 视频 → `mm:ss`（复用现有 `formatDuration`），图集或 duration=0 → `-` | duration 单位毫秒 |
| 转写状态 | Badge：待转写/转写中/已转写/失败 | 4 色区分 |
| 观点 | ≤30 字省略 + HoverCard 浮层全文；无观点显示 `-` | opinionSummary 字段 |
| 评判 | 有结果 → 评判图标+计数（✅3 💚1 ❌0）；无 → evalStatus Badge | 取自 WorkJudgment 聚合 |
| 操作 | 📋详情 🔄转写 💡观点提取 ⚖评判 | 按钮根据状态 disabled + Tooltip |

操作按钮可用条件：
- **转写**：transcriptStatus 为 pending 或 failed 时可用；processing 时 disabled
- **观点提取**：transcriptStatus=done 且 opinionSummary 为空时可用
- **评判**：transcriptStatus=done 且 evalStatus 为 none 或 failed 时可用

### WorkDrawer

- 基于现有 `<Sheet>` 组件，右侧滑出，宽 480px
- 数据来源：works 行已有的 transcript / opinionSummary + `GET /api/douyin/records?workId={id}` 获取 predictionItems
- 三个区块：
  1. **作品信息**：封面大图、描述、发布时间、互动数据
  2. **语音转写**：transcript 全文（无转写时显示状态提示）
  3. **观点摘要**：opinionSummary 全文（无观点时显示"-"）
  4. **预测明细**：predictionItems 列表，每项展示预测内容、评判结果、推理依据（复用当前 EvalDetailPanel 卡片样式）

## 数据流

```
page.tsx (状态容器)
  ├─ selectedSlug: string | null
  ├─ drawerWork: WorkWithBlogger | null
  │
  ├─ GET /api/douyin/bloggers ──► BloggerSidebar
  │
  ├─ GET /api/douyin/works?blogger_slugs={slug}&page={n}
  │   └─► WorksTable (分页 + 轮询)
  │
  ├─ POST /api/douyin/works/{id}/transcribe  ──┐
  ├─ POST /api/douyin/works/{id}/summarize   ──┼── 操作后随即刷新表格
  └─ POST /api/douyin/works/{id}/evaluate    ──┘
  
  └─ GET /api/douyin/records?workId={id} ──► WorkDrawer
```

## API 变更

### 新增：`POST /api/douyin/works/[id]/evaluate`

```typescript
// src/app/api/douyin/works/[id]/evaluate/route.ts
// 入队单个作品的评判。底层 eval-queue.enqueueForEvaluation({ workIds: [id] }) 已支持。
// 响应：{ success: true, workId } | { error: string }
```

## 文件清单

| 操作 | 文件 | 说明 |
|---|---|---|
| 重写 | `src/app/settings/douyin/page.tsx` | 新布局容器 |
| 新建 | `src/app/settings/douyin/BloggerSidebar.tsx` | 左侧博主列表 |
| 新建 | `src/app/settings/douyin/WorksTable.tsx` | 右侧作品表格 |
| 新建 | `src/app/settings/douyin/WorkRow.tsx` | 单行作品 |
| 新建 | `src/app/settings/douyin/WorkDrawer.tsx` | 作品详情抽屉 |
| 新建 | `src/app/api/douyin/works/[id]/evaluate/route.ts` | 单作品评判入队 |
| 后续可删 | `BloggerTable.tsx`, `BloggerRow.tsx`, `VideoSubTable.tsx`, `VideoSubRow.tsx`, `FilterBar.tsx` | 旧组件（确认功能无回归后删除） |

## 不涉及

- 博主数据模型、works 表 schema 不变
- 转写/评判 pipeline 不变
- 现有 API（除新增单作品评判端点外）不变
- `/douyin` 和 `/douyin/[slug]` 面向用户的雷达浏览页暂不改动
