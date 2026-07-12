# 抖音下游 Pipeline：视频下载 → 音频剥离 → ASR 转写 — 设计文档

> 日期：2026-07-12 | 状态：待审阅 | 依赖：抖音监控模块（2026-07-11）

## 1. 概述

补齐 scanner 入库后的下游处理链路：下载视频 → ffmpeg 提取音轨 → 讯飞 ASR 转文本 → 回写 `works.transcript`。使用 **DB 作为任务队列**，通过新增 API 手动触发转写。

本次**不做** LLM 分类（classifyBlogger）和收盘评判（evaluator），但为二者铺路——transcript 就绪后它们自然可启用。

## 2. 关键决策

| 决策 | 结论 |
|------|------|
| 文件保留 | env `VIDEO_RETENTION_DAYS` 可配，默认 7 天 |
| ffmpeg | `@ffmpeg/ffmpeg` WASM 版，core 文件锁定 `node_modules` 本地路径 |
| 讯飞 ASR | ≤60s → 语音听写 IAT（实时）；>60s → 语音转写 LFASR（离线轮询） |
| 并发 | 并行池，信号量并发 = 2 |
| 触发机制 | DB 作为任务队列（`transcript_status` 状态机），手动 API 触发 |
| 部署 | Docker 部署于香港服务器，无外网 CDN 依赖 |

## 3. 目录结构

```
src/services/douyin/
├── video-downloader.ts      ← 新增：下载视频 → data/videos/
├── audio-extractor.ts       ← 新增：ffmpeg WASM 提取音轨 → data/audio/
├── transcriber.ts           ← 重写：讯飞 ASR 适配器（听写/转写双接口）
├── pipeline-service.ts      ← 新增：编排层，并行池调度，更新 works 状态
├── scanner-service.ts       ← 修改：入库时存 video_url，完成后可调用 pipeline

src/app/api/douyin/
└── transcribe/route.ts      ← 新增 API：POST 手动触发转写

src/app/sentiment/douyin/
├── page.tsx                 ← 修改：加"开始转写"按钮
└── [id]/page.tsx            ← 修改：新增"作品列表"Tab

scripts/
└── cleanup.ts               ← 新增：过期文件清理脚本

data/
├── videos/                  ← 新增目录：原始视频
└── audio/                   ← 新增目录：提取的音频
```

## 4. 环境变量

```bash
# .env 新增
ASR_API_KEY=           # 讯飞 APIKey
ASR_API_SECRET=        # 讯飞 APISecret
VIDEO_RETENTION_DAYS=7 # 视频/音频文件保留天数
```

## 5. 数据模型变更

### 5.1 `works` 表加字段

```sql
ALTER TABLE works ADD COLUMN video_url TEXT;  -- 抖音 CDN 下载直链
```

入库时从 `DouyinVideoData.video.download_addr.url_list[0]` 取值。

`share_url` 字段已存在无需改动。

### 5.2 状态机（已有，不修改）

```
pending ──→ processing ──→ done
   │                          │
   └────────← failed ←────────┘  (重试时从 failed/pending 均可启动)
```

## 6. 核心模块设计

### 6.1 video-downloader.ts

```typescript
export async function downloadVideo(
  awemeId: string,
  videoUrl: string
): Promise<string> {
  // 职责：流式下载原始视频 → 本地落盘
  // 入参：awemeId + 抖音 CDN 直链
  // 返回：本地文件路径 data/videos/{awemeId}.mp4
  //
  // 逻辑：
  // 1. 检查本地是否已存在（幂等，直接返回）
  // 2. 创建 writeStream → data/videos/{awemeId}.mp4
  // 3. fetch() 流式读 → pipe 到文件
  // 4. 失败重试 3 次，指数退避 (1s / 2s / 4s)
  // 5. 超时 120s，超时视为失败
  //
  // CDN 链接过期处理：
  // - 403/404 时调用 TikHub fetchOneVideo(awemeId) 回捞最新 download_addr
  // - 用新地址重试下载
  // - 如回捞也失败 → 抛出错误
}
```

### 6.2 audio-extractor.ts

```typescript
import { FFmpeg } from "@ffmpeg/ffmpeg";

export async function extractAudio(
  videoPath: string,
  awemeId: string
): Promise<string> {
  // 职责：用 ffmpeg WASM 从视频中提取音轨
  // 入参：视频本地路径
  // 返回：音频本地路径 data/audio/{awemeId}.wav
  //
  // 参数：
  //   -vn          去掉视频流
  //   -acodec pcm_s16le  PCM 16bit 编码
  //   -ar 16000     采样率 16KHz（讯飞要求）
  //   -ac 1         单声道（讯飞要求）
  //
  // WASM core 路径：
  //   锁定 node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js
  //   不依赖外部 CDN，Docker 镜像内本地读取
  //
  // 首次 load() 加载 WASM binary，后续调用复用已加载实例
}
```

### 6.3 transcriber.ts（重写）

```typescript
/**
 * 内部：讯飞语音听写（≤60s）
 * WebSocket: wss://iat-api.xfyun.cn/v2/iat
 * 鉴权：HMAC-SHA256(API_SECRET, signature_origin)
 *   origin = "host: iat-api.xfyun.cn\ndate: {RFC1123}\nGET /v2/iat HTTP/1.1"
 *   signature = base64(HMAC-SHA256(API_SECRET, origin))
 *   auth_header = base64(JSON.stringify({api_key, algorithm, signature}))
 */
async function transcribeShort(audioPath: string): Promise<string>;

/**
 * 内部：讯飞语音转写（>60s）
 * REST: POST https://raasr.xfyun.cn/v2/api/submit (multipart)
 *       GET  https://raasr.xfyun.cn/v2/api/result?task_id={taskId}
 * 轮询间隔 10s，最多等待 5 分钟
 */
async function transcribeLong(audioPath: string): Promise<string>;

/**
 * 对外统一接口（保持现有签名不变）
 * 按视频 duration 自动选路
 */
export async function transcribeAudio(
  audioPath: string,
  durationMs: number
): Promise<string>;
```

### 6.4 pipeline-service.ts（编排层）

```typescript
interface PipelineConfig {
  concurrency: number;  // 默认 2
  maxTasks: number;     // 默认 20
}

export async function transcribePendingWorks(
  config?: Partial<PipelineConfig>
): Promise<{
  total: number;
  done: number;
  failed: number;
  results: Array<{
    awemeId: string;
    status: "done" | "failed";
    transcript?: string;
    error?: string;
  }>;
}> {
  // 1. SELECT works
  //    WHERE transcript_status IN ("pending", "failed")
  //    ORDER BY scanned_at ASC
  //    LIMIT maxTasks
  //
  // 2. 信号量并发池（concurrency=2）：
  //    for each work:
  //      acquire()
  //      try:
  //        - UPDATE transcript_status = "processing"
  //        - videoPath  = downloadVideo(awemeId, videoUrl)
  //        - audioPath  = extractAudio(videoPath)
  //        - transcript = transcribeAudio(audioPath, duration)
  //        - UPDATE transcript, transcript_status = "done"
  //      catch (err):
  //        - UPDATE transcript_status = "failed"
  //        - log error + awemeId
  //      finally:
  //        release()
  //
  // 3. 返回: { total, done, failed, results[] }
}
```

### 6.5 scanner-service.ts 改动

```typescript
// 入库时加一行 videoUrl
db.insert(works).values({
  // ... 现有字段 ...
  videoUrl: post.video?.download_addr?.url_list?.[0] || null,  // ← 新增
});
```

### 6.6 文件清理（scripts/cleanup.ts）

```typescript
// 遍历 data/videos/ data/audio/
// 删除 atime 超过 N 天的文件
// N = parseInt(env.VIDEO_RETENTION_DAYS) || 7
// 可手动执行：npx tsx scripts/cleanup.ts
// 生产环境：docker crontab 每天凌晨执行
```

## 7. API 设计

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/douyin/transcribe` | 手动触发转写 pipeline |

**请求体（可选）：**

```json
{
  "workId": 123,       // 可选，指定单条作品
  "concurrency": 2,    // 可选，覆盖默认并发数
  "maxTasks": 20       // 可选，覆盖默认最大任务数
}
```

**响应体：**

```json
{
  "total": 5,
  "done": 4,
  "failed": 1,
  "results": [
    { "awemeId": "xxx", "status": "done", "transcript": "今天大盘..." },
    { "awemeId": "yyy", "status": "failed", "error": "ASR timeout" }
  ]
}
```

## 8. 前端改动

### 8.1 博主列表页 —— 加"开始转写"按钮

```
[手动扫描]  [收盘评判]  [开始转写]   ← 新增
```

调用 `POST /api/douyin/transcribe`，执行中禁用按钮 + spinner，完成后 toast 显示结果。

### 8.2 博主详情页 —— 新增"作品列表"Tab

```tsx
// 三个 Tab：
// 预测记录 | 准确率趋势 | 作品列表 ← 新增
```

每个作品卡片展示：

| 元素 | 来源 |
|------|------|
| 描述文字 | `works.desc` |
| 发布时间 | `works.published_at` |
| 转写状态 Badge | `works.transcript_status` |
| 互动数据 | `works.statistics` (JSON 解析) |
| 转写全文（折叠展开） | `works.transcript` |

**转写状态 Badge 颜色：**

| status | 显示 | 颜色 |
|--------|------|------|
| `pending` | 等待中 | gray |
| `processing` | 转写中... | yellow |
| `done` | 已转写 | green |
| `failed` | 转写失败 | red |

## 9. 错误处理

| 场景 | 策略 |
|------|------|
| 视频下载超时（120s） | 重试 3 次 → status = failed |
| CDN 链接过期（403/404） | TikHub 回捞 → 重试下载 |
| ffmpeg 提取失败 | 重试 1 次 → status = failed |
| 讯飞听写 WS 断开 | 重试 2 次 → status = failed |
| 讯飞转写轮询超时（5min） | status = failed |
| 讯飞接口限流 | 等待后重试，指数退避 |
| 磁盘空间不足 | 抛出错误，当前任务 failed，其余继续 |

## 10. 非目标（本次不做）

- 不实现 `classifyBlogger`（LLM 博主定位）—— 依赖 transcript 就绪，后续单独做
- 不实现 `evaluator-service`（收盘评判）—— 同上
- 不做实时 WebSocket 推送转写进度
- 不做自动定时调度（手动触发 → 后续换 cron）
- 不做前端进度条（只展示 current/final status）
