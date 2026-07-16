# Workflow 编排转写流水线 实现计划（子项目 2/4）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把抖音单作品转写流水线（下载→提取音频→ASR→观点提取→写库）改为 Mastra Workflow 编排：每步自动重试 2 次、运行记录持久化到 LibSQL；批量调度与对外 API 行为完全不变。

**Architecture:** 新增 `transcribe-work-workflow`（4 步链式，复用现有服务函数，末步写库）；Mastra 实例挂 `LibSQLStore`（`data/mastra.db` 绝对路径）并注册 workflow；`pipeline-service.processOneWork` 内部改为启动 workflow run，查询/信号量/返回结构不动。

**Tech Stack:** @mastra/core 1.51（已装）、@mastra/libsql（新增）、zod、Next.js 16.2.10、drizzle + better-sqlite3（业务库不变）。

**Spec:** `docs/superpowers/specs/2026-07-16-mastra-workflow-pipeline-design.md`

## Global Constraints

- **Mastra API 以本地安装版为准**：本计划代码已对照 `node_modules/@mastra/core@1.51/dist/workflows/*.d.ts` 核实（`createStep` 的 `retries?: number`、execute 参数含 `inputData`/`getInitData`/`getStepResult`、`createWorkflow().then().commit()`、run 结果 `status: 'success' | 'failed' | 'suspended'`）。若仍有类型不匹配，以 `.d.ts` 为准做最小调整并在报告中说明——`@mastra/libsql` 的 `LibSQLStore` 构造参数同理（文档形态 `{ id, url }`）。
- 项目**没有测试框架**，不新增。每任务验证 = `npx tsc --noEmit` + `npm run lint` 通过 + 指定冒烟。
- 现有服务函数文件**一律不改**：`video-downloader.ts`、`audio-extractor.ts`、`transcriber.ts`、`opinion-service.ts`。
- `transcribePendingWorks` 签名、`PipelineConfig`/`TaskResult`/`PipelineResult` 类型、返回结构 `{total, done, failed, results}`、并发信号量语义全部不变；API 层零改动。
- works 状态机不变：入 run 前置 `processing`；run 成功由末步写 `done`；run 失败/异常回写 `failed`。
- 每步 `retries: 2`；`duration=0` 视为未知按 `61_000ms`（沿用现有 LFASR 兜底）；观点提取非致命（`extractOpinion` 自身兜底返回 `""`）。
- Windows 环境：LibSQL 的 `file:` URL 中反斜杠要替换为正斜杠。
- 中文注释与日志风格与现有代码一致（保留 `[awemeId]` 前缀日志习惯）。

---

### Task 1: 依赖与配置（@mastra/libsql + 遗留 Minor 清理）

**Files:**
- Modify: `package.json`（npm 命令 + engines 字段）
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: 无
- Produces: `@mastra/libsql` 可 import；`engines.node >=22.13.0`；`serverExternalPackages` 含显式包名

- [ ] **Step 1: 安装依赖**

Run: `npm install @mastra/libsql@latest`
Expected: 安装成功。

- [ ] **Step 2: 升级 @types/node 并加 engines**

Run: `npm install -D @types/node@^22`

然后在 `package.json` 顶层（`"private": true,` 之后）加：

```json
  "engines": {
    "node": ">=22.13.0"
  },
```

- [ ] **Step 3: next.config.ts 补显式包名**

`next.config.ts` 中：

```ts
  serverExternalPackages: ["@mastra/*"],
```

改为：

```ts
  serverExternalPackages: ["@mastra/*", "@mastra/core", "@mastra/libsql"],
```

（glob 在当前 Next 版本属于"碰巧生效"，显式列出两个实际用到的包更稳妥。）

- [ ] **Step 4: 验证**

Run: `node --version && npx tsc --noEmit && npm run build`
Expected: node ≥22.13；tsc 无错误；build 通过。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json next.config.ts
git commit -m "chore: 引入 @mastra/libsql，显式 engines 与 serverExternalPackages"
```

---

### Task 2: transcribe-work workflow + Mastra 实例挂 storage

**Files:**
- Create: `src/mastra/workflows/transcribe-work-workflow.ts`
- Modify: `src/mastra/index.ts`（整文件重写，见 Step 2）

**Interfaces:**
- Consumes: `downloadVideo(awemeId: string, videoUrl: string): Promise<string>`（`@/services/douyin/video-downloader`）；`extractAudio(videoPath: string, awemeId: string): Promise<string>`（`@/services/douyin/audio-extractor`）；`transcribeAudio(audioPath: string, durationMs: number): Promise<string>`（`@/services/douyin/transcriber`）；`extractOpinion(transcript: string): Promise<string>`（`@/services/douyin/opinion-service`）；`db`/`works`（drizzle）；`createStep`/`createWorkflow`（`@mastra/core/workflows`）；`LibSQLStore`（`@mastra/libsql`）
- Produces（Task 3 依赖）:
  - `transcribeWorkWorkflow`，注册键 `transcribeWorkWorkflow`，workflow id `"transcribe-work"`
  - 输入 schema：`{ workId: number, awemeId: string, videoUrl: string, duration: number }`
  - run 成功输出：`{ transcript: string, opinionSummary: string }`
  - `mastra.getWorkflow("transcribeWorkWorkflow")` 可用

- [ ] **Step 1: 创建 workflow 文件**

创建 `src/mastra/workflows/transcribe-work-workflow.ts`：

```ts
// src/mastra/workflows/transcribe-work-workflow.ts
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq } from "drizzle-orm";
import { downloadVideo } from "@/services/douyin/video-downloader";
import { extractAudio } from "@/services/douyin/audio-extractor";
import { transcribeAudio } from "@/services/douyin/transcriber";
import { extractOpinion } from "@/services/douyin/opinion-service";

// 单作品转写工作流输入
const workflowInputSchema = z.object({
  workId: z.number(),
  awemeId: z.string(),
  videoUrl: z.string(),
  duration: z.number(),
});

type WorkflowInput = z.infer<typeof workflowInputSchema>;

// 1. 下载视频
const downloadStep = createStep({
  id: "download-video",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({ videoPath: z.string() }),
  retries: 2,
  execute: async ({ inputData }) => {
    const { awemeId, videoUrl } = inputData;
    console.log(`[${awemeId}] 开始下载视频...`);
    const videoPath = await downloadVideo(awemeId, videoUrl);
    console.log(`[${awemeId}] 视频下载完成 → ${videoPath}`);
    return { videoPath };
  },
});

// 2. 提取音频
const extractAudioStep = createStep({
  id: "extract-audio",
  inputSchema: z.object({ videoPath: z.string() }),
  outputSchema: z.object({ audioPath: z.string() }),
  retries: 2,
  execute: async ({ inputData, getInitData }) => {
    const { awemeId } = getInitData<WorkflowInput>();
    console.log(`[${awemeId}] 开始提取音频...`);
    const audioPath = await extractAudio(inputData.videoPath, awemeId);
    console.log(`[${awemeId}] 音频提取完成 → ${audioPath}`);
    return { audioPath };
  },
});

// 3. ASR 转写
const transcribeStep = createStep({
  id: "transcribe-audio",
  inputSchema: z.object({ audioPath: z.string() }),
  outputSchema: z.object({ transcript: z.string() }),
  retries: 2,
  execute: async ({ inputData, getInitData }) => {
    const { awemeId, duration } = getInitData<WorkflowInput>();
    // duration=0 表示未知 — 按长音频（LFASR）兜底
    const effectiveDuration = duration > 0 ? duration : 61_000;
    const method = effectiveDuration / 1000 <= 60 ? "IAT (短音频)" : "LFASR (长音频)";
    console.log(`[${awemeId}] 开始语音转写 (${method}, duration=${effectiveDuration}ms)...`);
    const transcript = await transcribeAudio(inputData.audioPath, effectiveDuration);
    console.log(`[${awemeId}] 语音转写完成 → ${transcript.length} 字符`);
    return { transcript };
  },
});

// 4. 观点提取 + 回写业务库
const opinionAndSaveStep = createStep({
  id: "opinion-and-save",
  inputSchema: z.object({ transcript: z.string() }),
  outputSchema: z.object({
    transcript: z.string(),
    opinionSummary: z.string(),
  }),
  retries: 2,
  execute: async ({ inputData, getInitData }) => {
    const { workId, awemeId } = getInitData<WorkflowInput>();
    console.log(`[${awemeId}] 开始提取观点摘要...`);
    // extractOpinion 内部已捕获所有异常并返回 ""（非致命）
    const opinionSummary = await extractOpinion(inputData.transcript);
    console.log(`[${awemeId}] 观点摘要 → ${opinionSummary.slice(0, 50)}...`);

    db.update(works)
      .set({
        transcript: inputData.transcript,
        transcriptStatus: "done",
        opinionSummary,
      })
      .where(eq(works.id, workId))
      .run();

    return { transcript: inputData.transcript, opinionSummary };
  },
});

export const transcribeWorkWorkflow = createWorkflow({
  id: "transcribe-work",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    transcript: z.string(),
    opinionSummary: z.string(),
  }),
})
  .then(downloadStep)
  .then(extractAudioStep)
  .then(transcribeStep)
  .then(opinionAndSaveStep)
  .commit();
```

- [ ] **Step 2: Mastra 实例挂 storage 并注册 workflow**

`src/mastra/index.ts` 整文件改为：

```ts
// src/mastra/index.ts
import path from "path";
import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { opinionAgent } from "@/mastra/agents/opinion-agent";
import { transcribeWorkWorkflow } from "@/mastra/workflows/transcribe-work-workflow";

// 绝对路径 + 正斜杠：与业务库 data/douyin.db 分离，
// 避免多进程相对路径解析不一致（Windows 反斜杠在 file: URL 中无效）
const storageUrl =
  "file:" + path.join(process.cwd(), "data", "mastra.db").replace(/\\/g, "/");

export const mastra = new Mastra({
  agents: { opinionAgent },
  workflows: { transcribeWorkWorkflow },
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: storageUrl,
  }),
});
```

（若 `LibSQLStore` 构造签名与 `{ id, url }` 不符，按 Global Constraints 以 `node_modules/@mastra/libsql` 的 `.d.ts` 为准最小调整并报告。）

- [ ] **Step 3: 类型检查与 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误（Mastra 类型不匹配时按约定调整并记录）。

- [ ] **Step 4: Commit**

```bash
git add src/mastra/
git commit -m "feat: transcribe-work workflow 与 LibSQL 运行持久化"
```

---

### Task 3: pipeline-service 切换到 workflow run

**Files:**
- Modify: `src/services/douyin/pipeline-service.ts`（只改 import 区与 `processOneWork`，其余不动）

**Interfaces:**
- Consumes: `mastra`（`@/mastra`）；`mastra.getWorkflow("transcribeWorkWorkflow").createRun()` → `run.start({ inputData: { workId, awemeId, videoUrl, duration } })` → 结果 `status === "success"` 时 `result.result: { transcript: string, opinionSummary: string }`，`status === "failed"` 时含 `error`
- Produces: `transcribePendingWorks` 与 `processOneWork` 对外行为不变（签名、返回类型、状态回写）

- [ ] **Step 1: 改 import 区**

`src/services/douyin/pipeline-service.ts` 顶部 import 改为（删去四个服务函数导入，新增 mastra）：

```ts
// src/services/douyin/pipeline-service.ts
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import { mastra } from "@/mastra";
```

- [ ] **Step 2: 重写 processOneWork**

`processOneWork` 整函数替换为：

```ts
async function processOneWork(row: WorkRow): Promise<TaskResult> {
  const { id, awemeId, videoUrl, duration } = row;

  const logPrefix = `[${awemeId}]`;
  console.log(`${logPrefix} 开始处理 (duration=${duration}ms)`);

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

    // 3. 启动单作品转写 workflow（每步自动重试 2 次，运行记录持久化到 data/mastra.db）
    const run = await mastra
      .getWorkflow("transcribeWorkWorkflow")
      .createRun();
    const result = await run.start({
      inputData: { workId: id, awemeId, videoUrl, duration },
    });

    if (result.status !== "success") {
      const errorMsg =
        result.status === "failed"
          ? result.error instanceof Error
            ? result.error.message
            : String(result.error)
          : `workflow ended with status: ${result.status}`;
      throw new Error(errorMsg);
    }

    // done 状态与 transcript/opinionSummary 已由 workflow 末步回写 DB
    console.log(`${logPrefix} ✅ 全部完成`);
    return { awemeId, status: "done", transcript: result.result.transcript };
  } catch (err) {
    // 失败回写
    const errorMsg =
      err instanceof Error ? err.message : String(err);
    console.error(`${logPrefix} ❌ 失败: ${errorMsg}`);
    try {
      db.update(works)
        .set({ transcriptStatus: "failed" })
        .where(eq(works.id, id))
        .run();
    } catch (dbErr) {
      console.error(`Failed to update status for work ${awemeId}:`, dbErr);
    }

    return { awemeId, status: "failed", error: errorMsg };
  }
}
```

（`createRun()` 若为同步返回，`await` 同样安全；若 `.d.ts` 显示 `start` 的结果字段名与上述不符，按 Global Constraints 最小调整并报告。）

其余部分（类型定义、`Semaphore`、`transcribePendingWorks`）**一行不改**。

- [ ] **Step 3: 类型检查、lint、构建**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 均通过。

- [ ] **Step 4: Commit**

```bash
git add src/services/douyin/pipeline-service.ts
git commit -m "feat: 转写流水线切换到 Mastra workflow（步骤级重试+运行持久化）"
```

---

### Task 4: 端到端验证

**Files:** 无新增/修改（纯验证；dev server 需运行）

- [ ] **Step 1: API 冒烟**

```bash
curl -s -X POST http://localhost:3000/api/douyin/transcribe -H "Content-Type: application/json" -d '{"maxTasks":1}'
```

Expected: 返回 `{"total":...,"done":...,"failed":...,"results":[...]}` 结构不变。若 `total: 0`（无待转写作品），先 `curl -s -X POST http://localhost:3000/api/douyin/scan` 再重试；仍为 0 则记录"无可用测试数据，结构验证通过"，跳到 Step 2 的存储文件检查。

- [ ] **Step 2: 持久化验证**

```bash
ls -la data/mastra.db
node -e "const D=require('better-sqlite3');const db=new D('data/mastra.db');console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all());try{console.log(db.prepare('SELECT COUNT(*) c FROM mastra_workflow_snapshot').get())}catch(e){console.log('snapshot table not found')}"
```

Expected: `data/mastra.db` 存在；表列表含 `mastra_workflow_snapshot` 等；若 Step 1 真跑过 run，则 snapshot 计数 ≥1。

- [ ] **Step 3: 失败路径验证（有测试数据时）**

若库中存在作品，可临时把一条 pending 作品的 `video_url` 改成无效地址验证重试与 failed 回写：

```bash
node -e "const D=require('better-sqlite3');const db=new D('data/douyin.db');const row=db.prepare(\"SELECT id,video_url FROM works WHERE transcript_status='pending' LIMIT 1\").get();if(!row){console.log('no pending work, skip');process.exit(0)};db.prepare(\"UPDATE works SET video_url='https://invalid.example.com/x.mp4' WHERE id=?\").run(row.id);console.log('poisoned work',row.id,'orig:',row.video_url)"
```

然后 `curl -s -X POST http://localhost:3000/api/douyin/transcribe -d '{"maxTasks":1}' -H "Content-Type: application/json"`。

Expected: dev server 日志可见 download-video 步重试（共 3 次尝试）后失败；API 返回 `failed: 1`；该作品 `transcript_status = 'failed'`。验证后把 `video_url` 改回原值并把状态改回 `pending`（用上一命令输出的 orig 值）：

```bash
node -e "const D=require('better-sqlite3');const db=new D('data/douyin.db');db.prepare(\"UPDATE works SET video_url=?, transcript_status='pending' WHERE id=?\").run(process.argv[1],Number(process.argv[2]))" "<orig video_url>" <id>
```

无 pending 作品时记录跳过原因。

- [ ] **Step 4: 收尾**

`git status` 干净；如 Step 3 做过数据改动已还原。
