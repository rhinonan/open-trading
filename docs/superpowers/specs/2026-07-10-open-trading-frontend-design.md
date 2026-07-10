# Open Trading — 前端框架设计文档

> 日期：2026-07-10 | 状态：待审阅

## 1. 项目概述

基于多 Agent 架构的股票分析系统前端。核心功能模块：
- **个股分析**：多 Agent 协作分析单只股票
- **行业分析**：行业对比、板块热度
- **舆情分析**：社交网络爬取结果、情绪指标
- **财报 & 研报**：历史财报数据、研报汇总
- **Agent 管理**：Agent 状态监控、任务队列、日志

本次初始化范围：**搭建完整前端框架**（Next.js + 主题切换 + 路由骨架 + 首页 Dashboard），后端多 Agent 留接口预留。

## 2. 技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| 框架 | Next.js 14+ (App Router) | React Server Components + 文件系统路由 |
| 语言 | TypeScript (strict) | 全项目 TS |
| 样式 | Tailwind CSS | `darkMode: "class"` 策略 |
| 主题切换 | next-themes | 持久化 + 跟随系统 + 防闪烁 |
| 组件库 | shadcn/ui | Radix UI 原语 + Tailwind，源码级复用 |
| 图标 | lucide-react | shadcn/ui 默认图标库，与其完美集成 |

## 3. 项目目录结构

```
open-trading/
├── src/
│   ├── app/                    # App Router 页面
│   │   ├── layout.tsx          # 根布局（ThemeProvider + 侧边栏）
│   │   ├── page.tsx            # Dashboard 首页
│   │   ├── globals.css         # Tailwind + CSS 变量
│   │   ├── loading.tsx         # 全局加载骨架
│   │   ├── error.tsx           # 全局错误边界
│   │   ├── stocks/
│   │   │   ├── page.tsx        # 个股列表页
│   │   │   └── [symbol]/
│   │   │       ├── page.tsx    # 个股详情页
│   │   │       └── loading.tsx
│   │   ├── industry/
│   │   │   └── page.tsx
│   │   ├── sentiment/
│   │   │   └── page.tsx
│   │   ├── financials/
│   │   │   └── page.tsx
│   │   ├── agents/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   ├── components/
│   │   ├── ui/                 # shadcn/ui 组件（自动生成）
│   │   ├── layout/
│   │   │   ├── sidebar.tsx     # 侧边栏导航
│   │   │   ├── header.tsx      # 顶部栏（面包屑、搜索入口）
│   │   │   └── theme-toggle.tsx # 主题切换按钮
│   │   ├── dashboard/          # Dashboard 专用组件
│   │   │   ├── market-banner.tsx    # 大盘概览 Banner
│   │   │   ├── hotspot-stocks.tsx   # 个股热点卡片
│   │   │   ├── industry-snapshot.tsx # 行业板块快照
│   │   │   ├── sentiment-preview.tsx # 舆情速览卡片
│   │   │   └── recent-activity.tsx   # 最近分析记录
│   │   └── shared/             # 跨模块共享组件
│   ├── hooks/                  # 自定义 hooks
│   │   └── use-mobile.ts       # 响应式检测（移动端侧边栏用 Sheet）
│   ├── lib/
│   │   ├── utils.ts            # 工具函数（shadcn 默认 cn()）
│   │   └── api.ts              # API 请求层（base URL 可配置）
│   └── types/                  # TypeScript 类型定义
│       └── index.ts            # Stock, Agent, Sentiment 等核心类型
├── public/                     # 静态资源
├── tailwind.config.ts
├── next.config.ts
├── tsconfig.json
└── package.json
```

## 4. 布局架构

### 整体结构

```
RootLayout
├── ThemeProvider (next-themes, attribute="class")
│   ├── <html class="dark|light">  ← 防闪烁 inline script 在此注入
│   │   └── body
│   │       ├── Sidebar（固定左侧 w-64，可折叠至 w-16）
│   │       │   ├── Logo / 项目名
│   │       │   ├── Nav items（图标 + 文字，折叠时仅图标）
│   │       │   ├── ThemeToggle（底部，折叠时仅图标）
│   │       │   └── Collapse button（底部）
│   │       └── Main content area（ml-64 → ml-16 折叠时）
│   │           ├── Header（面包屑 + 搜索入口，可选）
│   │           └── <main>{children}</main>
```

### 侧边栏导航项

| 图标 (lucide) | 标签 | 路由 |
|---------------|------|------|
| `LayoutDashboard` | 仪表盘 | `/` |
| `TrendingUp` | 个股分析 | `/stocks` |
| `Building2` | 行业分析 | `/industry` |
| `MessageCircle` | 舆情分析 | `/sentiment` |
| `FileText` | 财报 & 研报 | `/financials` |
| `Bot` | Agent 管理 | `/agents` |
| `Settings` | 设置 | `/settings` |

### 移动端适配

- 侧边栏默认隐藏，通过顶部 hamburger 按钮以 Sheet（抽屉）形式滑出
- `use-mobile.ts` hook 通过 `matchMedia` 检测 `(max-width: 768px)`

## 5. 主题系统设计

### 核心机制

```
用户点击 ThemeToggle（☀️/🌙 切换）
    │
    ▼
next-themes setTheme("dark" | "light" | "system")
    │
    ├── localStorage 持久化 key
    ├── <html> class 切换
    │     ├── Tailwind dark: 前缀全部自动生效
    │     └── CSS 变量 .dark 块接管所有颜色
    └── React 层 re-render，所有组件即时响应
```

### CSS 变量（globals.css）

使用 shadcn/ui 标准的 HSL 通道变量格式。定义 `:root`（亮色）和 `.dark`（暗色）两套值。

亮色背景为白色系，暗色背景为深蓝灰系（`222 47% 11%`）。主色调为蓝色系，暗色模式下略微提亮以保证对比度。

侧边栏在亮/暗模式下均使用深色背景（`--sidebar`），与主内容区形成层次对比。

### 防闪烁

next-themes 自动在 `<head>` 注入内联 `<script>`，在页面渲染前同步读取 localStorage 或系统偏好，预置 `<html>` 的 class。用户不会看到亮→暗的闪烁。

### 后续扩展

CSS 变量架构天然支持添加更多主题（如护眼模式、高对比度模式），只需新增一个 `.theme-xxx` class 块并定义对应变量即可。框架层面无需改动。

## 6. 页面设计

### Dashboard 首页（`/`）

Grid 卡片布局，展示各模块摘要：

```
┌──────────────────────────────────────────────────────┐
│  大盘概览 Banner                                     │
│  [指数涨跌] [涨跌家数] [成交量] [北向资金]              │
├──────────────────┬───────────────────┬───────────────┤
│  个股热点         │  行业板块           │  舆情速览      │
│  涨幅榜 Top5      │  板块涨跌分布        │  情绪热词云    │
│  → 去个股分析    │  → 去行业分析       │  → 去舆情分析  │
├──────────────────┴───────────────────┴───────────────┤
│  最近分析记录（时间线）                                │
│  2026-07-10  分析了 AAPL → 查看报告                  │
│  2026-07-09  分析了 半导体行业                         │
└──────────────────────────────────────────────────────┘
```

### 个股分析（`/stocks` → `/stocks/[symbol]`）

- **列表页**：搜索栏 + 股票表格 + 行业/市值筛选，点击进入详情
- **详情页**：K 线图表区域（预留） + 多 Agent 分析面板（Tab 切换各 Agent 结论），后期核心页面

### 行业分析（`/industry`）

- 行业对比表格（涨跌幅、资金流向、市盈率）
- 板块热度热力图（预留 ECharts/Recharts）

### 舆情分析（`/sentiment`）

- 舆情时间线（按时间排序的社媒帖子/新闻）
- 情绪仪表盘（正面/负面/中性比例）
- 来源分布（Twitter、Reddit、微博等）

### 财报 & 研报（`/financials`）

- 财报数据表格（季度/年度对比）
- 研报列表 + 下载/预览

### Agent 管理（`/agents`）

- Agent 状态卡片（在线/离线/错误、当前任务）
- 任务队列列表
- 日志流（预留 WebSocket 实时推送）

### 设置（`/settings`）

- 主题偏好（Dark / Light / System）
- 通知设置
- API Key 配置
- 数据源配置

## 7. 初始化步骤（实施清单）

```
 1. npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
 2. npm install next-themes lucide-react
 3. npx shadcn@latest init (默认配置：New York style, CSS variables, neutral base)
 4. npx shadcn@latest add button card dropdown-menu sheet separator tooltip avatar badge skeleton scroll-area
 5. 配置 tailwind.config.ts → darkMode: "class"
 6. 配置 globals.css → 写入完整的 :root + .dark CSS 变量
 7. 创建 src/lib/utils.ts（shadcn cn() 函数）
 8. 创建 src/types/index.ts（基础类型定义）
 9. 创建 src/lib/api.ts（API 请求层骨架）
10. 创建 ThemeProvider 包裹组件（src/components/layout/theme-provider.tsx）
11. 创建 RootLayout（src/app/layout.tsx，接入 ThemeProvider + Sidebar）
12. 创建 Sidebar + ThemeToggle + Header 组件
13. 创建 use-mobile hook
14. 创建 shadcn/ui 组件（按需 npx shadcn add）
15. 创建各路由占位页（page.tsx + loading.tsx + error.tsx）
16. 创建 Dashboard 首页（market-banner + 各卡片组件）
```

## 8. 后端衔接预留

| 预留点 | 位置 | 说明 |
|--------|------|------|
| API 请求层 | `src/lib/api.ts` | 统一 fetch 封装，base URL 可配置，后期填入真实后端地址 |
| 类型定义 | `src/types/index.ts` | Agent、Stock、Sentiment、FinancialReport 等核心 interface |
| K 线图表 | `/stocks/[symbol]` | 预留图表容器，推荐 ECharts 或 lightweight-charts |
| WebSocket | `/agents` | 日志流预留 WebSocket 连接点，实时推送 Agent 状态 |
| 数据 Mock | `src/lib/mock-data.ts` | 初期用 mock 数据填充各页面，后期替换为真实 API 调用 |

## 9. 非目标（明确不做）

- ❌ 不做多主题（仅 Dark/Light），但架构预留扩展能力
- ❌ 不做自定义布局/信息密度切换
- ❌ 不做后端多 Agent 实现
- ❌ 不做真实数据对接
- ❌ 不做用户认证系统（后期单独设计）
