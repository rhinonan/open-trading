# 抖音博主监控 — 设计文档

> 日期：2026-07-11 | 状态：待审阅

## 1. 概述

在舆情分析模块下新增抖音博主监控功能。核心目标：**自动追踪抖音财经博主的口播内容，收盘后结合行情用 LLM 评判其预测准确率**。

### 核心流程

1. 用户添加抖音博主 → 拉取近期作品 → ASR 转写 → LLM 定位（是否预测型博主）
2. 对 predictor 博主周期性扫描新作品，转写并存库
3. 每日 A 股收盘后，汇总作品文案 + 行情数据 → LLM 评判准确率
4. 按大盘方向/指数点位/板块/个股分类统计准确率趋势

## 2. 技术选型

| 层面 | 选型 | 说明 |
|------|------|------|
| 架构 | Next.js 全栈 | Service Layer 分层，API Routes 薄转发 |
| 数据库 | SQLite + Drizzle ORM | `better-sqlite3` 驱动 |
| 抖音数据 | 用户自供 API | `douyin-api.client.ts` 封装 |
| ASR 转写 | 云端 ASR（待定） | 预留适配器接口，首批空实现 |
| LLM 评判 | `@anthropic-ai/sdk` | baseURL 指向 `https://newapi.tdance.cc/v1`，apikey 配 env |
| 触发机制 | 手动触发 API → 生产换 cron | 不引入进程内调度器 |
| 前端 | `/sentiment/douyin` 子页面 | 博主管理 + 预测记录 + 准确率趋势 |

## 3. 环境变量

```bash
# .env.local
DOUYIN_API_BASE=https://xxx.com/api/douyin
NEWAPI_BASE_URL=https://newapi.tdance.cc/v1
NEWAPI_API_KEY=sk-xxx
ASR_API_KEY=           # 预留
ASR_API_SECRET=        # 预留
```

## 4. 目录结构

```
src/
├── services/douyin/
│   ├── blogger-service.ts      # 博主 CRUD + 定位编排
│   ├── scanner-service.ts      # 作品扫描、去重、入库
│   ├── transcriber.ts          # ASR 转写适配器（预留空实现）
│   ├── evaluator-service.ts    # LLM 评判 + 准确率计算
│   └── market-snapshot.ts      # 获取当日行情快照
├── app/api/douyin/
│   ├── bloggers/route.ts       # GET (列表) / POST (添加)
│   ├── bloggers/[id]/route.ts  # GET / DELETE
│   ├── scan/route.ts           # POST 触发扫描
│   ├── evaluate/route.ts       # POST 触发收盘评判
│   └── records/route.ts        # GET 查询预测记录
├── app/sentiment/douyin/
│   ├── page.tsx                # 博主管理主页面
│   └── [id]/
│       └── page.tsx            # 博主详情（预测记录+作品+趋势）
├── db/
│   ├── schema.ts               # Drizzle schema
│   └── index.ts                # 数据库连接
├── lib/
│   ├── api.ts                  # (已存在，扩展 douyinAPI)
│   └── llm.ts                  # Anthropic SDK 客户端初始化
└── types/
    └── index.ts               # (已存在，新增 Douyin + Prediction 相关类型)
```

> **扩展预留**：若 service 层文件超过 ~300 行，可按 DDD-lite 进一步拆分为 `application/`（用例编排）、`domain/`（纯逻辑实体）、`infrastructure/`（外部 API 适配器）。

## 5. 数据模型

### 5.1 `bloggers` — 抖音博主

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer PK (autoincrement) | |
| `douyin_uid` | text, unique | `sec_uid`，抖音用户唯一标识 |
| `nickname` | text | 昵称 |
| `avatar_url` | text | 头像 URL |
| `signature` | text | 个人签名 |
| `follower_count` | integer | 粉丝数 |
| `category` | text, default `'pending'` | `pending` / `predictor` / `non_predictor` |
| `classified_at` | integer, nullable | 定位完成时间戳 |
| `classification_note` | text, nullable | LLM 定位判断依据 |
| `created_at` | integer, not null | |
| `updated_at` | integer, not null | |

### 5.2 `works` — 作品

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer PK | |
| `aweme_id` | text, unique | 抖音视频 ID |
| `blogger_id` | integer FK → bloggers.id | |
| `desc` | text | 原始描述文案 |
| `transcript` | text, nullable | ASR 转写结果 |
| `transcript_status` | text, default `'pending'` | `pending` → `processing` → `done` / `failed` |
| `duration` | integer | 视频时长 (ms) |
| `cover_url` | text | 封面图 |
| `share_url` | text | 抖音分享链接 |
| `statistics` | text (JSON) | `{ digg_count, comment_count, share_count, play_count }` |
| `published_at` | integer | 发布时间戳 |
| `scanned_at` | integer | 抓取时间戳 |

### 5.3 `evaluations` — 每日评判

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer PK | |
| `blogger_id` | integer FK | |
| `eval_date` | text | 日期 `"2026-07-11"` |
| `works_count` | integer | 涉及作品数 |
| `prediction_summary` | text | LLM 总结的预测要点 |
| `accuracy_score` | integer | 综合准确率 0-100 |
| `eval_detail` | text (JSON) | LLM 返回的完整评判 |
| `market_snapshot` | text (JSON) | 当日大盘行情快照 |
| `created_at` | integer | |

### 5.4 `prediction_items` — 预测明细

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer PK | |
| `evaluation_id` | integer FK | |
| `work_id` | integer FK | |
| `predicted_content` | text | 原文中提取的预测语句 |
| `prediction_type` | text | `market_direction` / `index_level` / `sector` / `stock_pick` |
| `prediction_target` | text | 目标名称：`"上证指数"` / `"新能源板块"` / `"贵州茅台"` |
| `prediction_detail` | text (JSON) | 结构化预测细节（见下方说明） |
| `is_correct` | integer, nullable | 1=正确 / 0=错误 / null=未到期 |
| `judgment` | text | LLM 判断理由 |
| `related_symbols` | text (JSON) | 关联股票代码 |

### 5.5 `prediction_detail` JSON 结构

```typescript
// market_direction — 大盘涨跌方向
{ "direction": "up" | "down", "scope": "大盘" | "A股", "time_horizon": "明日" }

// index_level — 具体点位
{ "index": "上证指数", "target_level": 3350, "direction": "看涨到" }

// sector — 板块/行业
{ "sector": "新能源", "direction": "up", "reasoning": "政策利好" }

// stock_pick — 个股
{ "symbols": ["600519"], "direction": "up", "target_price": 1850 }
```

### 5.6 `prediction_type` 枚举

| 值 | 含义 | 例子 |
|----|------|------|
| `market_direction` | 大盘涨跌方向 | "明天大概率红盘" |
| `index_level` | 具体点位预测 | "上证看到 3400" |
| `sector` | 板块/行业 | "半导体要起飞" |
| `stock_pick` | 明确个股 | "茅台看到 2000" |

## 6. 核心流程

### 6.1 添加博主 + 定位

```
POST /api/douyin/bloggers { douyin_uid }
    │
    ▼
1. 调用抖音 API 获取博主信息（昵称、头像、粉丝数、签名）
    │
    ▼
2. 写入 bloggers 表，category = "pending"
    │
    ▼
3. 拉取博主最近 20 条作品，下载视频 → ASR 转写中控 → 写入 works
    │
    ▼
4. 汇总 transcript → 调用 LLM 定位
   输入 Prompt 1（见 §7.1）
    │
    ▼
5. 更新 blogger.category / classified_at / classification_note
```

### 6.2 周期性扫描

```
POST /api/douyin/scan
    │
    ▼
1. SELECT * FROM bloggers WHERE category = "predictor"
    │
    ▼
2. 对每个博主：调用抖音 API 拉最新作品列表
    │
    ▼
3. 按 aweme_id 去重（已存在的跳过）
    │
    ▼
4. 新作品 → ASR 转写 → 写入 works
```

触发频率建议每 6 小时一次（博主通常每天发 1-3 条，低频即可）。

### 6.3 收盘后评判

```
POST /api/douyin/evaluate (每日 15:00 后触发)
    │
    ▼
1. 获取当日行情快照（上证/深证/创业板涨跌幅、领涨领跌板块）
    │
    ▼
2. SELECT predictor 博主 + 其近期未评判的 works
    │
    ▼
3. 对每个博主：
   - 汇总 works 文案
   - 调用 LLM 评判（Prompt 2，见 §7.2）
   - 写入 evaluations + prediction_items
    │
    ▼
4. 返回本次评判摘要
```

### 6.4 触发方式

- **开发/调试阶段**：页面按钮手动触发 `POST /api/douyin/scan` 和 `POST /api/douyin/evaluate`
- **生产阶段**：Linux crontab 或 Vercel Cron Jobs 定时调用 API Routes

## 7. LLM Prompt 设计

三个场景三个 prompt，均通过 `@anthropic-ai/sdk` → newapi 调用。

### 7.1 Prompt 1：博主定位

```
你是A股市场分析专家。以下是一个抖音博主最近发布的视频文案汇总：

{逐条列出：发布时间 + desc + transcript}

请判断：
1. 这位博主是否在内容中做出A股市场的行情预测？
   （包括大盘涨跌、指数点位、板块走势、个股推荐等）
2. 如果是，他主要预测哪种类型？占比各多少？
3. 预测是否有明确的判断逻辑？还是模糊的主观感受？
4. 综合判断：该博主属于 "predictor"（行情预测型）还是 "non_predictor"（非预测型）？

返回严格JSON格式（不要markdown代码块包裹）：
{
  "category": "predictor",
  "prediction_mix": {
    "market_direction": 0.4,
    "index_level": 0.2,
    "sector": 0.3,
    "stock_pick": 0.1
  },
  "has_reasoning": true,
  "note": "该博主以大盘方向判断为主，兼有板块分析，具备明确的逻辑框架"
}
```

### 7.2 Prompt 2：每日收盘评判

```
你是A股市场分析专家。以下是今天的实际行情数据：

{market_snapshot JSON}

以下是某抖音博主在今天及近期发布的视频文案：

{逐条列出：发布时间 + desc + transcript}

请完成：
1. 从文案中提取所有明确的行情预测（模糊观点忽略）
2. 根据今天的实际行情，逐一判断每条预测是否正确
3. 综合评估该博主今天的预测准确率（0-100）

返回严格JSON（不要markdown代码块包裹）：
{
  "works_count": 3,
  "prediction_summary": "今日共3条预测，大盘方向正确，个股推荐1条待验证",
  "accuracy_score": 67,
  "items": [
    {
      "predicted_content": "明天大盘大概率红盘",
      "prediction_type": "market_direction",
      "prediction_target": "大盘",
      "prediction_detail": { "direction": "up" },
      "is_correct": 1,
      "judgment": "今日上证+0.8%，沪深300+0.6%，预测正确",
      "related_symbols": []
    },
    {
      "predicted_content": "半导体板块有望走强",
      "prediction_type": "sector",
      "prediction_target": "半导体",
      "prediction_detail": { "sector": "半导体", "direction": "up" },
      "is_correct": 1,
      "judgment": "今日半导体板块+1.2%，领涨两市，预测正确",
      "related_symbols": []
    },
    {
      "predicted_content": "茅台看到2000",
      "prediction_type": "stock_pick",
      "prediction_target": "贵州茅台",
      "prediction_detail": { "symbols": ["600519"], "direction": "up", "target_price": 2000 },
      "is_correct": null,
      "judgment": "今日茅台收1825，距离目标价2000仍有距离，暂未兑现",
      "related_symbols": ["600519"]
    }
  ]
}
```

> **注意**：`is_correct` 三态——1 正确、0 错误、null 未到期（如点位预测尚未到达目标价）。`accuracy_score` 只计入已明确可判的条目。

## 8. API Routes 设计

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/api/douyin/bloggers` | 博主列表，支持 `?category=predictor` 筛选 |
| `POST` | `/api/douyin/bloggers` | 添加博主，body: `{ douyin_uid }`，自动触发定位 |
| `GET` | `/api/douyin/bloggers/[id]` | 博主详情 + 统计 |
| `DELETE` | `/api/douyin/bloggers/[id]` | 删除博主及其关联数据 |
| `POST` | `/api/douyin/scan` | 触发全量扫描（可选 body: `{ blogger_id }` 单博主扫描） |
| `POST` | `/api/douyin/evaluate` | 触发收盘评判（可选 body: `{ blogger_id, eval_date }`） |
| `GET` | `/api/douyin/records` | 查询预测记录，支持 `?blogger_id=&eval_date=&type=` |

## 9. 前端页面

### 9.1 路由

| 路由 | 内容 |
|------|------|
| `/sentiment` | 现有舆情概览页（不变） |
| `/sentiment/douyin` | 抖音博主管理主页 |
| `/sentiment/douyin/[id]` | 博主详情（预测记录 + 作品 + 趋势） |

### 9.2 主页面 (`/sentiment/douyin`)

- 顶部：添加博主输入框 + 确认按钮
- 博主卡片网格：头像、昵称、定位状态标签（pending/predictor/non_predictor）、最近准确率
- 操作按钮行：**手动扫描** / **收盘评判**
- 点击卡片 → 进入博主详情

### 9.3 博主详情 (`/sentiment/douyin/[id]`)

三个 Tab：

1. **预测记录**：按日期倒序的评判列表，展开看各条 prediction_item 的详情（原文 vs 判断）
2. **作品列表**：该博主所有已抓取作品，展示 desc、转写状态、发布时间
3. **准确率趋势**：折线图（日期 x 轴），三条线分别：大盘方向正确率、板块正确率、个股正确率

## 10. 非目标（本次不做）

- 不实现音频下载 + ASR 的实际调用（预留适配器空函数）
- 不做实时推送/WebSocket 通知
- 不做博主批量导入
- 不做视频自动摘要
- 不引入进程内定时调度器（依赖外部 cron）
- 暂不做用户认证与多用户隔离

## 11. 扩展预留

- ASR 适配器接口：`transcribe(videoUrl: string): Promise<string>`，切换厂商只需实现新的适配器
- LLM 客户端：`src/lib/llm.ts` 统一初始化 Anthropic 客户端，service 层不直接接触 apiKey
- DDD-lite 目录结构预留：当 service 文件超过 ~300 行时，可拆分为 `modules/douyin/{application,domain,infrastructure,interfaces}/`
