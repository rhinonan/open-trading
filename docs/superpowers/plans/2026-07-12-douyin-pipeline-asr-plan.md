# 抖音下游 Pipeline：视频下载 → 音频剥离 → ASR 转写 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 scanner 入库后的下游处理链路——下载视频、ffmpeg 提取音轨、讯飞 ASR 转文本、回写 works.transcript

**Architecture:** Service-per-responsibility 分层（video-downloader / audio-extractor / transcriber / pipeline-service），DB 状态机作为任务队列，并行池（并发=2）批量处理，API Route 薄转发

**Tech Stack:** Next.js 16 (Node 22 内置 WebSocket), @ffmpeg/ffmpeg WASM, better-sqlite3/Drizzle ORM, 讯飞 IAT + LFASR API

## Global Constraints

- 并发池大小 = 2
- 视频文件保留天数默认 7，env `VIDEO_RETENTION_DAYS` 可配
- ffmpeg WASM core 锁定 `node_modules/@ffmpeg/core/` 本地路径，不依赖外部 CDN
- ≤60s 音频走讯飞 IAT 听写（WebSocket），>60s 走 LFASR 转写（REST 轮询）
- DB 状态机：pending → processing → done/failed
- Docker 部署于香港服务器，所有依赖随镜像打包

---

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `@ffmpeg/ffmpeg`, `@ffmpeg/core` 可供 service 文件 import

- [ ] **Step 1: 安装 @ffmpeg/ffmpeg 和 @ffmpeg/core**

```bash
npm install @ffmpeg/ffmpeg @ffmpeg/core
```

- [ ] **Step 2: 验证安装**

```bash
node -e "const { FFmpeg } = require('@ffmpeg/ffmpeg'); console.log('FFmpeg loaded:', typeof FFmpeg)"
```

Expected: `FFmpeg loaded: function`

- [ ] **Step 3: 验证 core 文件路径存在**

```bash
node -e "const fs = require('fs'); const p = require.resolve('@ffmpeg/core/dist/esm/ffmpeg-core.js'); console.log('Core path:', p); console.log('Exists:', fs.existsSync(p))"
```

Expected: `Core path: .../ffmpeg-core.js`, `Exists: true`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @ffmpeg/ffmpeg and @ffmpeg/core for audio extraction"
```

---

### Task 2: Schema 变更 — works 表加 video_url

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0001_*.sql` (由 drizzle-kit 生成)

**Interfaces:**
- Produces: `works.video_url` 列 (text, nullable) 可供 scanner-service 写入

- [ ] **Step 1: 修改 schema.ts，在 works 表中加 video_url 列**

```typescript
// src/db/schema.ts — 在 works 表的 existing 列定义之后、awemeId 附近插入
export const works = sqliteTable("works", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  awemeId: text("aweme_id").notNull().unique(),
  bloggerId: integer("blogger_id")
    .notNull()
    .references(() => bloggers.id, { onDelete: "cascade" }),
  desc: text("desc").notNull().default(""),
  videoUrl: text("video_url"),                                          // ← 新增
  transcript: text("transcript"),
  transcriptStatus: text("transcript_status", {
    enum: ["pending", "processing", "done", "failed"],
  })
    .notNull()
    .default("pending"),
  duration: integer("duration").notNull().default(0),
  coverUrl: text("cover_url").notNull().default(""),
  shareUrl: text("share_url").notNull().default(""),
  statistics: text("statistics").notNull().default("{}"),
  publishedAt: integer("published_at").notNull(),
  scannedAt: integer("scanned_at")
    .notNull()
    .default(sql`(unixepoch())`),
});
```

- [ ] **Step 2: 生成迁移**

```bash
npx drizzle-kit generate
```

- [ ] **Step 3: 推送到数据库**

```bash
npx drizzle-kit push
```

- [ ] **Step 4: 验证列已添加**

```bash
node -e "const Database = require('better-sqlite3'); const db = new Database('./data/douyin.db'); console.log(db.pragma('table_info(works)'))"
```

验证输出中包含 `{ name: 'video_url', type: 'TEXT' }` 行。

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: add video_url column to works table"
```

---

### Task 3: 实现 video-downloader.ts

**Files:**
- Create: `src/services/douyin/video-downloader.ts`

**Interfaces:**
- Produces: `downloadVideo(awemeId: string, videoUrl: string): Promise<string>` — 返回本地 mp4 路径
- Consumes: `fetchOneVideo` from `@/lib/douyin-api` (用于 CDN 链接过期回捞)

- [ ] **Step 1: 创建 video-downloader.ts**

```typescript
// src/services/douyin/video-downloader.ts
import * as fs from "fs";
import * as path from "path";
import { fetchOneVideo } from "@/lib/douyin-api";

const VIDEOS_DIR = path.join(process.cwd(), "data", "videos");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 流式下载视频到本地。
 * @param awemeId - 抖音视频 aweme_id
 * @param videoUrl - 抖音 CDN 直链 (download_addr.url_list[0])
 * @returns 本地文件路径 data/videos/{awemeId}.mp4
 */
export async function downloadVideo(
  awemeId: string,
  videoUrl: string
): Promise<string> {
  ensureDir(VIDEOS_DIR);
  const filePath = path.join(VIDEOS_DIR, `${awemeId}.mp4`);

  // 幂等：已存在直接返回
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    return filePath;
  }

  let lastError: Error | null = null;
  let currentUrl = videoUrl;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      const res = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        // CDN 链接过期，回捞最新地址
        if (res.status === 403 || res.status === 404) {
          const fresh = await fetchOneVideo(awemeId);
          const newUrl =
            fresh?.video?.download_addr?.url_list?.[0];
          if (newUrl && newUrl !== currentUrl) {
            currentUrl = newUrl;
            continue; // 用新地址重试
          }
        }
        throw new Error(
          `Download failed: HTTP ${res.status} ${res.statusText}`
        );
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
      return filePath;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < 2) {
        await sleep(Math.pow(2, attempt) * 1000); // 1s / 2s / 4s
      }
    }
  }

  throw new Error(
    `Failed to download video ${awemeId} after 3 attempts: ${lastError?.message}`
  );
}
```

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit src/services/douyin/video-downloader.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/services/douyin/video-downloader.ts
git commit -m "feat: add video downloader with CDN expiry fallback"
```

---

### Task 4: 实现 audio-extractor.ts

**Files:**
- Create: `src/services/douyin/audio-extractor.ts`

**Interfaces:**
- Produces: `extractAudio(videoPath: string, awemeId: string): Promise<string>` — 返回本地 wav 路径
- Consumes: `@ffmpeg/ffmpeg` 的 FFmpeg 类

- [ ] **Step 1: 创建 audio-extractor.ts**

```typescript
// src/services/douyin/audio-extractor.ts
import * as fs from "fs";
import * as path from "path";
import { FFmpeg } from "@ffmpeg/ffmpeg";

const AUDIO_DIR = path.join(process.cwd(), "data", "audio");

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading: Promise<void> | null = null;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  if (!ffmpegLoading) {
    ffmpegLoading = (async () => {
      const coreURL = require.resolve(
        "@ffmpeg/core/dist/esm/ffmpeg-core.js"
      );
      const wasmURL = coreURL.replace(/\.js$/, ".wasm");

      ffmpegInstance = new FFmpeg();
      await ffmpegInstance.load({
        coreURL,
        wasmURL,
      });
    })();
  }

  await ffmpegLoading;
  return ffmpegInstance!;
}

/**
 * 用 ffmpeg WASM 从视频中提取音轨，输出 PCM 16KHz mono WAV。
 * @param videoPath - 本地视频文件路径
 * @param awemeId - 抖音视频 aweme_id
 * @returns 本地音频文件路径 data/audio/{awemeId}.wav
 */
export async function extractAudio(
  videoPath: string,
  awemeId: string
): Promise<string> {
  ensureDir(AUDIO_DIR);
  const outputPath = path.join(AUDIO_DIR, `${awemeId}.wav`);

  // 幂等
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    return outputPath;
  }

  // ffmpeg WASM 用虚拟文件系统，需要挂载输入输出
  const ffmpeg = await getFFmpeg();

  // 读取视频文件到内存
  const videoData = fs.readFileSync(videoPath);

  // 写入 ffmpeg 虚拟 FS
  await ffmpeg.writeFile("input.mp4", videoData);

  // 执行提取：-vn 去视频流，PCM 16KHz 16bit mono
  await ffmpeg.exec([
    "-i",
    "input.mp4",
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "16000",
    "-ac",
    "1",
    "output.wav",
  ]);

  // 从虚拟 FS 读出结果
  const audioData = (await ffmpeg.readFile("output.wav")) as Uint8Array;

  fs.writeFileSync(outputPath, Buffer.from(audioData));

  // 清理虚拟 FS
  await ffmpeg.deleteFile("input.mp4");
  await ffmpeg.deleteFile("output.wav");

  return outputPath;
}
```

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit src/services/douyin/audio-extractor.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/services/douyin/audio-extractor.ts
git commit -m "feat: add ffmpeg WASM audio extractor"
```

---

### Task 5: 重写 transcriber.ts（讯飞 ASR 适配器）

**Files:**
- Modify: `src/services/douyin/transcriber.ts`

**Interfaces:**
- Produces:
  - `transcribeAudio(audioPath: string, durationMs: number): Promise<string>`
  - `transcribeBatch(videos: Array<{ awemeId: string; videoUrl: string }>): Promise<Map<string, string>>` (保持兼容)
- Consumes: `ASR_API_KEY`, `ASR_API_SECRET` from env

- [ ] **Step 1: 重写 transcriber.ts**

```typescript
// src/services/douyin/transcriber.ts
import * as fs from "fs";
import * as crypto from "crypto";
// Use Node.js 22+ built-in global WebSocket — 无需 import

const ASR_API_KEY = process.env.ASR_API_KEY || "";
const ASR_API_SECRET = process.env.ASR_API_SECRET || "";

// ============================================================
// 鉴权工具
// ============================================================

function rfc1123Date(): string {
  return new Date().toUTCString();
}

function buildSignature(host: string, date: string): string {
  const origin = `host: ${host}\ndate: ${date}\nGET /v2/iat HTTP/1.1`;
  const hmac = crypto.createHmac("sha256", ASR_API_SECRET);
  hmac.update(origin);
  return hmac.digest("base64");
}

function buildAuthorization(host: string): string {
  const date = rfc1123Date();
  const signature = buildSignature(host, date);
  const authObj = {
    api_key: ASR_API_KEY,
    algorithm: "hmac-sha256",
    signature,
  };
  return Buffer.from(JSON.stringify(authObj)).toString("base64");
}

// ============================================================
// 内部：讯飞语音听写 IAT（≤60s 短音频）
// ============================================================

function transcribeShort(audioPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const host = "iat-api.xfyun.cn";
    const date = rfc1123Date();
    const authorization = buildAuthorization(host);

    const url =
      `wss://${host}/v2/iat?` +
      `host=${encodeURIComponent(host)}&` +
      `date=${encodeURIComponent(date)}&` +
      `authorization=${encodeURIComponent(authorization)}`;

    const ws = new WebSocket(url);
    const results: string[] = [];
    let finished = false;

    ws.on("open", () => {
      // Step 1: 发送参数帧（metadata）— IAT 协议要求首帧为 JSON 参数
      const metaFrame = JSON.stringify({
        common: { app_id: ASR_API_KEY },
        business: {
          language: "zh_cn",
          domain: "iat",
          accent: "mandarin",
          vad_eos: 3000,  // 静音检测结束（ms）
        },
        data: {
          status: 0,     // 0=首帧, 1=中间帧, 2=尾帧
          format: "audio/L16;rate=16000",
          encoding: "raw",
          audio: "",     // 首帧不含音频数据
        },
      });
      ws.send(metaFrame);

      // Step 2: 分帧发送音频数据，每帧 ≤1280 bytes
      const audioBuf = fs.readFileSync(audioPath);
      const frameSize = 1280;
      for (let i = 0; i < audioBuf.length; i += frameSize) {
        const chunk = audioBuf.subarray(i, i + frameSize);
        const isLast = i + frameSize >= audioBuf.length;
        const dataFrame = JSON.stringify({
          data: {
            status: isLast ? 2 : 1,  // 1=中间帧, 2=尾帧
            format: "audio/L16;rate=16000",
            encoding: "raw",
            audio: Buffer.from(chunk).toString("base64"),
          },
        });
        ws.send(dataFrame);
      }
    });

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.code !== 0) {
          ws.close();
          reject(new Error(`IAT error: code=${msg.code}, ${msg.message}`));
          return;
        }
        if (msg.data?.result) {
          // 解析识别结果
          const text = msg.data.result
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((ws: any) =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (ws.cw || []).map((cw: any) => cw.w || "").join("")
            )
            .join("");
          if (text) results.push(text);
        }
        // msg.code === 0 && msg.data.status === 2 表示最后一帧
        if (msg.code === 0 && msg.data?.status === 2) {
          finished = true;
          ws.close();
        }
      } catch (e) {
        // 非 JSON 帧（binary ACK）忽略
      }
    });

    ws.on("close", () => {
      if (finished) {
        resolve(results.join(""));
      } else {
        reject(new Error("IAT WebSocket closed unexpectedly"));
      }
    });

    ws.on("error", (err) => {
      reject(new Error(`IAT WebSocket error: ${err.message}`));
    });

    // 超时保护
    setTimeout(() => {
      if (!finished) {
        ws.close();
        reject(new Error("IAT transcription timed out (120s)"));
      }
    }, 120_000);
  });
}

// ============================================================
// 内部：讯飞语音转写 LFASR（>60s 长音频）
// ============================================================

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildLfasrSignature(host: string, date: string): string {
  const origin = `host: ${host}\ndate: ${date}\nPOST /v2/api/submit HTTP/1.1`;
  const hmac = crypto.createHmac("sha256", ASR_API_SECRET);
  hmac.update(origin);
  return hmac.digest("base64");
}

function buildLfasrAuthorization(host: string): string {
  const date = rfc1123Date();
  const signature = buildLfasrSignature(host, date);
  const authObj = {
    api_key: ASR_API_KEY,
    algorithm: "hmac-sha256",
    signature,
  };
  return Buffer.from(JSON.stringify(authObj)).toString("base64");
}

async function transcribeLong(audioPath: string): Promise<string> {
  const host = "raasr.xfyun.cn";
  const date = rfc1123Date();
  const authorization = buildLfasrAuthorization(host);
  const submitUrl = `https://${host}/v2/api/submit`;

  // Step 1: 提交音频文件
  const audioBuffer = fs.readFileSync(audioPath);
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer]), "audio.wav");

  const submitRes = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "Host": host,
      "Date": date,
      "Authorization": authorization,
    },
    body: formData,
  });

  if (!submitRes.ok) {
    throw new Error(
      `LFASR submit failed: HTTP ${submitRes.status} ${submitRes.statusText}`
    );
  }

  const submitJson = await submitRes.json();
  if (submitJson.code !== 0) {
    throw new Error(
      `LFASR submit error: code=${submitJson.code}, ${submitJson.message}`
    );
  }

  const taskId: string = submitJson.data?.task_id;
  if (!taskId) {
    throw new Error("LFASR submit returned no task_id");
  }

  // Step 2: 轮询结果（间隔 10s，最多等 5 分钟）
  const resultUrl = `https://${host}/v2/api/result`;
  const maxAttempts = 30;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(10_000);

    const resultDate = rfc1123Date();
    const resultAuth = buildLfasrAuthorization(host);

    const resultRes = await fetch(
      `${resultUrl}?task_id=${encodeURIComponent(taskId)}`,
      {
        headers: {
          "Host": host,
          "Date": resultDate,
          "Authorization": resultAuth,
        },
      }
    );

    if (!resultRes.ok) continue;

    const resultJson = await resultRes.json();
    if (resultJson.code !== 0) continue;

    // status: 1=处理中, 2=完成, 3=失败
    if (resultJson.data?.status === 2) {
      // 解析转写结果
      const segments = resultJson.data.result || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return segments.map((seg: any) => seg.onebest || "").join("");
    }

    if (resultJson.data?.status === 3) {
      throw new Error(
        `LFASR task failed: ${JSON.stringify(resultJson.data)}`
      );
    }
    // status === 1 继续轮询
  }

  throw new Error(`LFASR polling timed out after ${maxAttempts * 10}s`);
}

// ============================================================
// 对外统一接口
// ============================================================

/**
 * 根据时长自动选择讯飞接口。
 * @param audioPath 本地音频文件路径
 * @param durationMs 视频时长（毫秒）
 */
export async function transcribeAudio(
  audioPath: string,
  durationMs: number
): Promise<string> {
  if (!ASR_API_KEY || !ASR_API_SECRET) {
    throw new Error(
      "ASR not configured. Set ASR_API_KEY and ASR_API_SECRET env vars."
    );
  }

  const durationSec = durationMs / 1000;

  if (durationSec <= 60) {
    return transcribeShort(audioPath);
  }
  return transcribeLong(audioPath);
}

/**
 * 批量转写。保留旧签名以兼容可能的调用方。
 */
export async function transcribeBatch(
  videos: Array<{ awemeId: string; videoUrl: string }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  for (const { awemeId, videoUrl } of videos) {
    try {
      // 注意：旧接口传入的是 videoUrl（CDN 链接），不是 audioPath。
      // 实际批量转写应走 pipeline-service，此处仅为签名兼容保留。
      // 如果直接调用此函数且未经过下载/提取，会抛出错误。
      const text = await transcribeAudio(videoUrl, 0);
      results.set(awemeId, text);
    } catch {
      results.set(awemeId, "");
    }
  }
  return results;
}
```

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit src/services/douyin/transcriber.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/services/douyin/transcriber.ts
git commit -m "feat: implement iFlytek ASR adapter (IAT + LFASR)"
```

---

### Task 6: 实现 pipeline-service.ts（编排层）

**Files:**
- Create: `src/services/douyin/pipeline-service.ts`

**Interfaces:**
- Produces: `transcribePendingWorks(config?: Partial<PipelineConfig>): Promise<PipelineResult>`
- Consumes: `downloadVideo`, `extractAudio`, `transcribeAudio`

- [ ] **Step 1: 创建 pipeline-service.ts**

```typescript
// src/services/douyin/pipeline-service.ts
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq, inArray, asc, sql } from "drizzle-orm";
import { downloadVideo } from "./video-downloader";
import { extractAudio } from "./audio-extractor";
import { transcribeAudio } from "./transcriber";

// ============================================================
// 类型
// ============================================================

interface PipelineConfig {
  concurrency: number;
  maxTasks: number;
}

interface WorkRow {
  id: number;
  awemeId: string;
  videoUrl: string | null;
  duration: number;
}

interface TaskResult {
  awemeId: string;
  status: "done" | "failed";
  transcript?: string;
  error?: string;
}

interface PipelineResult {
  total: number;
  done: number;
  failed: number;
  results: TaskResult[];
}

// ============================================================
// 信号量
// ============================================================

class Semaphore {
  private available: number;
  private queue: Array<() => void> = [];

  constructor(count: number) {
    this.available = count;
  }

  acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.available--;
        resolve();
      });
    });
  }

  release(): void {
    this.available++;
    const next = this.queue.shift();
    if (next) next();
  }
}

// ============================================================
// 单任务处理
// ============================================================

async function processOneWork(row: WorkRow): Promise<TaskResult> {
  const { id, awemeId, videoUrl, duration } = row;

  try {
    // 1. 检查 video_url
    if (!videoUrl) {
      throw new Error("No video_url stored for this work");
    }

    // 2. 更新状态为 processing
    db.update(works)
      .set({ transcriptStatus: "processing" })
      .where(eq(works.id, id))
      .run();

    // 3. 下载视频
    const videoPath = await downloadVideo(awemeId, videoUrl);

    // 4. 提取音频
    const audioPath = await extractAudio(videoPath, awemeId);

    // 5. ASR 转写
    const transcript = await transcribeAudio(audioPath, duration);

    // 6. 回写 DB
    db.update(works)
      .set({
        transcript,
        transcriptStatus: "done",
      })
      .where(eq(works.id, id))
      .run();

    return { awemeId, status: "done", transcript };
  } catch (err) {
    // 失败回写
    const errorMsg =
      err instanceof Error ? err.message : String(err);
    db.update(works)
      .set({ transcriptStatus: "failed" })
      .where(eq(works.id, id))
      .run();

    return { awemeId, status: "failed", error: errorMsg };
  }
}

// ============================================================
// 公开入口
// ============================================================

export async function transcribePendingWorks(
  config?: Partial<PipelineConfig>
): Promise<PipelineResult> {
  const concurrency = config?.concurrency ?? 2;
  const maxTasks = config?.maxTasks ?? 20;

  // 查待处理任务
  const pending = db
    .select({
      id: works.id,
      awemeId: works.awemeId,
      videoUrl: works.videoUrl,
      duration: works.duration,
    })
    .from(works)
    .where(
      inArray(works.transcriptStatus, ["pending", "failed"])
    )
    .orderBy(asc(works.scannedAt))
    .limit(maxTasks)
    .all() as WorkRow[];

  if (pending.length === 0) {
    return { total: 0, done: 0, failed: 0, results: [] };
  }

  const sem = new Semaphore(concurrency);
  const results: TaskResult[] = [];

  const tasks = pending.map((row) => async () => {
    await sem.acquire();
    try {
      const result = await processOneWork(row);
      results.push(result);
    } finally {
      sem.release();
    }
  });

  await Promise.all(tasks.map((t) => t()));

  const done = results.filter((r) => r.status === "done").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return {
    total: results.length,
    done,
    failed,
    results,
  };
}
```

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit src/services/douyin/pipeline-service.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/services/douyin/pipeline-service.ts
git commit -m "feat: add pipeline service with semaphore pool"
```

---

### Task 7: 创建 transcribe API Route

**Files:**
- Create: `src/app/api/douyin/transcribe/route.ts`

**Interfaces:**
- Consumes: `transcribePendingWorks` from pipeline-service
- Produces: `POST /api/douyin/transcribe` — 请求体可选 `{ workId?, concurrency?, maxTasks? }`

- [ ] **Step 1: 创建 route.ts**

```typescript
// src/app/api/douyin/transcribe/route.ts
import { transcribePendingWorks } from "@/services/douyin/pipeline-service";

export async function POST(request: Request) {
  try {
    let body: { workId?: number; concurrency?: number; maxTasks?: number } = {};
    try {
      body = await request.json();
    } catch {
      // body 可选
    }

    const result = await transcribePendingWorks({
      concurrency: body.concurrency ?? 2,
      maxTasks: body.maxTasks ?? 20,
    });

    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 验证路由可访问（启动 dev server 后）**

```bash
curl -X POST http://localhost:3000/api/douyin/transcribe -H "Content-Type: application/json" -d '{"maxTasks": 1}'
```

Expected: `{"total":0,"done":0,"failed":0,"results":[]}`（无 pending 作品时）

- [ ] **Step 3: Commit**

```bash
git add src/app/api/douyin/transcribe/route.ts
git commit -m "feat: add POST /api/douyin/transcribe endpoint"
```

---

### Task 8: 修改 scanner-service.ts — 入库时存 video_url

**Files:**
- Modify: `src/services/douyin/scanner-service.ts`

**Interfaces:**
- Consumes: `DouyinVideoData.video.download_addr.url_list[0]`

- [ ] **Step 1: 修改 scanner-service.ts 入库逻辑**

在 `scanBlogger()` 函数中的 `db.insert(works).values({...})` 调用里，加一行 `videoUrl` 字段：

```typescript
// src/services/douyin/scanner-service.ts
// 找到 db.insert(works).values({...}) 那一行，在 existing fields 中加入：
db.insert(works)
  .values({
    awemeId: post.aweme_id,
    bloggerId: blogger.id,
    desc: post.desc || "",
    videoUrl: post.video?.download_addr?.url_list?.[0] || null,  // ← 新增
    duration: post.video?.duration || 0,
    coverUrl: post.video?.cover?.url_list?.[0] || "",
    shareUrl: post.share_url || "",
    statistics: JSON.stringify(post.statistics || {}),
    publishedAt: post.create_time,
    transcriptStatus: "pending",
  })
  .run();
```

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit src/services/douyin/scanner-service.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/services/douyin/scanner-service.ts
git commit -m "feat: store video download URL on scan insert"
```

---

### Task 9: 创建过期文件清理脚本

**Files:**
- Create: `scripts/cleanup.ts`

**Interfaces:**
- 独立脚本，不 import 任何 src 模块
- 读取 env `VIDEO_RETENTION_DAYS`，默认 7

- [ ] **Step 1: 创建 cleanup.ts**

```typescript
// scripts/cleanup.ts
// 用法：npx tsx scripts/cleanup.ts
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(__dirname, "..", "data");
const RETENTION_MS =
  (parseInt(process.env.VIDEO_RETENTION_DAYS || "7", 10) || 7) *
  24 * 60 * 60 * 1000;

const dirsToCheck = ["videos", "audio"];

function cleanupDir(dirName: string): number {
  const dirPath = path.join(DATA_DIR, dirName);
  if (!fs.existsSync(dirPath)) {
    console.log(`[cleanup] ${dirName}/ does not exist, skip`);
    return 0;
  }

  const now = Date.now();
  const cutoff = now - RETENTION_MS;
  let deleted = 0;

  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.atimeMs < cutoff || stat.mtimeMs < cutoff) {
        fs.unlinkSync(fullPath);
        deleted++;
        console.log(`[cleanup] deleted ${fullPath}`);
      }
    } catch (err) {
      console.error(`[cleanup] error processing ${fullPath}:`, err);
    }
  }

  console.log(`[cleanup] ${dirName}/: deleted ${deleted} files`);
  return deleted;
}

let totalDeleted = 0;
for (const dir of dirsToCheck) {
  totalDeleted += cleanupDir(dir);
}
console.log(`[cleanup] done, total deleted: ${totalDeleted} files`);
```

- [ ] **Step 2: 验证脚本可运行（无文件场景）**

```bash
npx tsx scripts/cleanup.ts
```

Expected: `videos/ does not exist, skip` / `done, total deleted: 0`

- [ ] **Step 3: Commit**

```bash
git add scripts/cleanup.ts
git commit -m "feat: add video/audio cleanup script"
```

---

### Task 10: 前端 — 博主列表页加"开始转写"按钮

**Files:**
- Modify: `src/app/sentiment/douyin/page.tsx`

**Interfaces:**
- 调用 `POST /api/douyin/transcribe`
- 按钮状态：idle / loading / 完成后显示结果 message

- [ ] **Step 1: 在操作按钮区域加"开始转写"按钮**

在 page.tsx 中，找到 action buttons 区域（`<div className="flex gap-3">`），在"收盘评判"按钮后面加一个"开始转写"按钮：

```tsx
// 在现有 state 声明旁边加：
const [transcribing, setTranscribing] = useState(false);

// 加 handler：
const handleTranscribe = async () => {
  setTranscribing(true);
  setMessage("");
  try {
    const res = await fetch("/api/douyin/transcribe", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setMessage(
        `转写完成：共 ${data.total} 条，成功 ${data.done} 条` +
          (data.failed > 0 ? `，失败 ${data.failed} 条` : "")
      );
    } else {
      setMessage(`转写失败: ${data.error}`);
    }
  } catch {
    setMessage("转写请求失败，请检查网络");
  }
  setTranscribing(false);
};

// 在按钮行中加：
<div className="flex gap-3">
  {/* ... 现有两个按钮 ... */}
  <Button variant="outline" onClick={handleTranscribe} disabled={transcribing}>
    {transcribing ? (
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
    ) : (
      <Mic className="h-4 w-4 mr-2" />    // ← 需要 import Mic from lucide-react
    )}
    开始转写
  </Button>
</div>
```

`lucide-react` 已安装，`Mic` 图标需要加入 import：
```typescript
import {
  MessageCircle,
  Radio,
  Plus,
  RefreshCw,
  BarChart3,
  UserPlus,
  Loader2,
  Mic,              // ← 新增
} from "lucide-react";
```

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit src/app/sentiment/douyin/page.tsx
```

- [ ] **Step 3: Dev server 验证**

启动 `npm run dev`，打开 `/sentiment/douyin`，确认三个按钮排列正常。

- [ ] **Step 4: Commit**

```bash
git add src/app/sentiment/douyin/page.tsx
git commit -m "feat: add transcribe button to blogger list page"
```

---

### Task 11: 前端 — 博主详情页新增"作品列表"Tab

**Files:**
- Modify: `src/app/sentiment/douyin/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/douyin/bloggers/[id]` (已有)
- 新增 API 调用获取作品列表（或扩展现有 records API）

- [ ] **Step 1: 加状态和 Tab 切换逻辑**

在 page.tsx 中的现有 state 区域添加：

```tsx
// 新增 state
const [works, setWorks] = useState<DouyinWork[]>([]);   // ← import DouyinWork from types
const [worksLoading, setWorksLoading] = useState(false);

// 新增加载函数
const loadWorks = useCallback(async () => {
  setWorksLoading(true);
  try {
    // 复用现有 records API 的扩展能力 —— 实际上 works 数据目前没有独立 API。
    // 方案：直接读 blogger 详情 API 的扩展数据，或者加一个 ?include=works 参数。
    // 当前最简做法：通过 fetch API 直接查，或者加一个新的 query param。
    // 这里暂时用 fetch records 的方式 — 实际上我们需要一个 works API。
    // 最佳路径：在 blogger API 中加 include=works 支持。
    const res = await fetch(`/api/douyin/bloggers/${id}?include=works`);
    if (res.ok) {
      const data = await res.json();
      setWorks(data.works || []);
    }
  } catch {
    // silent fail
  }
  setWorksLoading(false);
}, [id]);

// 在 tab 区域加第三个 tab：
<button
  onClick={() => { setTab("works"); loadWorks(); }}
  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
    tab === "works"
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:text-foreground"
  }`}
>
  作品列表
</button>
```

- [ ] **Step 2: 渲染作品列表**

```tsx
// 在 tab switch 逻辑中加入：
{tab === "works" && (
  <div className="space-y-4">
    {worksLoading ? (
      <Skeleton className="h-64 rounded-lg" />
    ) : works.length === 0 ? (
      <Card className="border-dashed">
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">暂无作品</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            扫描后将自动拉取作品并转写
          </p>
        </CardContent>
      </Card>
    ) : (
      works.map((work) => {
        const statusCfg = {
          pending: { label: "等待中", className: "bg-muted text-muted-foreground" },
          processing: { label: "转写中...", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
          done: { label: "已转写", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
          failed: { label: "转写失败", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
        }[work.transcriptStatus] || { label: work.transcriptStatus, className: "bg-muted" };

        const stats = JSON.parse(work.statistics || "{}");

        return (
          <Card key={work.id}>
            <CardContent className="pt-6">
              {/* 第一行：文案 + 状态 */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm line-clamp-3">
                    {work.desc || "(无文案)"}
                  </p>
                </div>
                <Badge className={`shrink-0 ${statusCfg.className}`}>
                  {statusCfg.label}
                </Badge>
              </div>

              {/* 第二行：时间和互动数据 */}
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span>
                  {new Date(work.publishedAt * 1000).toLocaleString("zh-CN", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span>👍 {stats.digg_count || 0}</span>
                <span>💬 {stats.comment_count || 0}</span>
                <span>↗ {stats.share_count || 0}</span>
              </div>

              {/* 第三行：转写全文（折叠） */}
              {work.transcript && work.transcriptStatus === "done" && (
                <details className="mt-3">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    查看转写全文
                  </summary>
                  <p className="mt-2 text-sm p-3 rounded-md bg-muted/50 whitespace-pre-wrap">
                    {work.transcript}
                  </p>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })
    )}
  </div>
)}
```

- [ ] **Step 3: 扩展 blogger detail API 支持 include=works**

在 `src/app/api/douyin/bloggers/[id]/route.ts` 中扩展 GET 逻辑：

```typescript
// src/app/api/douyin/bloggers/[id]/route.ts
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const blogger = await getBloggerById(parseInt(id, 10));
  if (!blogger) {
    return Response.json({ error: "Blogger not found" }, { status: 404 });
  }

  // 支持 ?include=works 返回作品列表
  const { searchParams } = new URL(request.url);
  if (searchParams.get("include") === "works") {
    const worksList = db
      .select()
      .from(works)
      .where(eq(works.bloggerId, parseInt(id, 10)))
      .orderBy(desc(works.publishedAt))
      .limit(50)
      .all();
    return Response.json({ ...blogger, works: worksList });
  }

  return Response.json(blogger);
}
```

- [ ] **Step 4: 验证编译通过**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/sentiment/douyin/\[id\]/page.tsx src/app/api/douyin/bloggers/\[id\]/route.ts
git commit -m "feat: add works tab to blogger detail page with transcript status"
```

---

### Task 12: 更新 .env.example 文档

**Files:**
- Modify: `.env.example`

**Interfaces:**
- 新增 `ASR_API_KEY`, `ASR_API_SECRET`, `VIDEO_RETENTION_DAYS` 的文档说明

- [ ] **Step 1: 更新 .env.example**

```bash
# .env.example
# ... 现有内容不变 ...

# 讯飞语音识别 API（语音听写 + 语音转写）
# 控制台：https://console.xfyun.cn/services/iat
ASR_API_KEY=
ASR_API_SECRET=

# 视频/音频文件本地保留天数，默认 7
VIDEO_RETENTION_DAYS=7
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add ASR and video retention env vars to .env.example"
```

---

## 验证流程（全链路测试）

所有 Task 完成后，端到端验证：

```bash
# 1. 启动 dev server
npm run dev

# 2. 扫描（触发新作品入库，含 video_url）
curl -X POST http://localhost:3000/api/douyin/scan

# 3. 确认 works 表有 pending 作品
node -e "
const Database = require('better-sqlite3');
const db = new Database('./data/douyin.db');
const rows = db.prepare(\"SELECT id, aweme_id, video_url, transcript_status FROM works WHERE transcript_status IN ('pending','failed') LIMIT 5\").all();
console.log(rows);
"

# 4. 触发转写
curl -X POST http://localhost:3000/api/douyin/transcribe \
  -H "Content-Type: application/json" \
  -d '{"maxTasks": 3}'

# 5. 检查结果
node -e "
const Database = require('better-sqlite3');
const db = new Database('./data/douyin.db');
const rows = db.prepare(\"SELECT aweme_id, transcript_status, substr(transcript || '', 1, 100) as snippet FROM works ORDER BY id DESC LIMIT 5\").all();
console.log(rows);
"

# 6. 验证文件存在
ls -la data/videos/ data/audio/

# 7. 验证前端
# 打开 http://localhost:3000/sentiment/douyin
# - 点击"开始转写"按钮
# - 点击博主卡片 → "作品列表"Tab
# - 查看转写状态 Badge 和文本
```
