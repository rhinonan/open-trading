// src/services/douyin/transcriber.ts
// 阿里云百炼 Paraformer-v2 ASR 适配器
// 流程：上传音频 → 文件服务 → 提交百炼任务 → 轮询 → 下载识别结果 → 清理远端文件
import * as fs from "fs";
import * as path from "path";

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "";
const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL || "http://localhost:3002"
).replace(/\/+$/, "");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const WORKSPACE_HOST =
  process.env.DASHSCOPE_ASR_HOST ||
  "ws-3o4sdfif6hn9wg6s.cn-beijing.maas.aliyuncs.com";

// ============================================================
// 工具
// ============================================================

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 构造简单 multipart form-data 请求体（避免 Node FormData 兼容问题） */
function buildMultipartBody(
  fileBuffer: Buffer,
  fileName: string,
): { body: Buffer; boundary: string } {
  const boundary = `----FormBoundary${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
    `Content-Type: application/octet-stream`,
    ``,
  ].join("\r\n");
  const footer = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(header + "\r\n"),
    fileBuffer,
    Buffer.from(footer),
  ]);
  return { body, boundary };
}

/** 构造带可选 admin 鉴权的请求头 */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (ADMIN_TOKEN) {
    h["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
  }
  return h;
}

// ============================================================
// 文件服务操作
// ============================================================

async function uploadToFileService(
  audioPath: string,
): Promise<{ id: string; url: string }> {
  const fileBuffer = fs.readFileSync(audioPath);
  const fileName = path.basename(audioPath);
  const { body, boundary } = buildMultipartBody(fileBuffer, fileName);

  const res = await fetch(`${PUBLIC_BASE_URL}/api/files/upload`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    }),
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `File service upload failed: HTTP ${res.status} — ${text}`,
    );
  }

  const json = await res.json();
  console.log(
    `  [asr] 音频已上传 id=${json.id} size=${fileBuffer.length}`,
  );
  return json;
}

async function deleteFromFileService(id: string): Promise<void> {
  try {
    const res = await fetch(`${PUBLIC_BASE_URL}/api/files/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) {
      console.log(`  [asr] 远端文件已清理 id=${id}`);
    } else {
      console.warn(`  [asr] 清理远端文件失败 id=${id} HTTP ${res.status}`);
    }
  } catch (e) {
    console.warn(`  [asr] 清理远端文件异常 id=${id}: ${e}`);
  }
}

// ============================================================
// 百炼 Paraformer-v2 API
// ============================================================

async function submitTask(fileUrl: string): Promise<string> {
  const res = await fetch(
    `https://${WORKSPACE_HOST}/api/v1/services/audio/asr/transcription`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model: "paraformer-v2",
        input: { file_urls: [fileUrl] },
        parameters: {
          channel_id: [0],
          language_hints: ["zh", "en"],
        },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bailian submitTask HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  const taskId: string | undefined = json?.output?.task_id;
  if (!taskId) {
    throw new Error(
      `Bailian submitTask: no task_id — ${JSON.stringify(json)}`,
    );
  }

  console.log(`  [asr] 百炼任务已提交 taskId=${taskId}`);
  return taskId;
}

async function pollTask(taskId: string, timeoutMs: number): Promise<string> {
  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < timeoutMs) {
    await sleep(2_000);
    attempt++;

    const res = await fetch(
      `https://${WORKSPACE_HOST}/api/v1/tasks/${taskId}`,
      {
        headers: { Authorization: `Bearer ${DASHSCOPE_API_KEY}` },
      },
    );

    if (!res.ok) {
      console.log(`  [asr] 轮询 HTTP ${res.status}, 重试中...`);
      continue;
    }

    const json = await res.json();
    const status: string | undefined = json?.output?.task_status;

    if (status === "SUCCEEDED") {
      const results: Array<Record<string, unknown>> =
        json?.output?.results || [];
      const transcriptionUrl: string | undefined =
        results[0]?.transcription_url as string | undefined;
      if (!transcriptionUrl) {
        throw new Error(
          "Bailian pollTask: task SUCCEEDED but no transcription_url",
        );
      }
      console.log(
        `  [asr] 百炼任务完成 attempt=${attempt} elapsed=${((Date.now() - start) / 1000).toFixed(0)}s`,
      );
      return transcriptionUrl;
    }

    if (status === "FAILED") {
      const results: Array<Record<string, unknown>> =
        json?.output?.results || [];
      const errCode = results[0]?.code || "UNKNOWN";
      const errMsg = results[0]?.message || "No message";
      throw new Error(
        `Bailian task FAILED: code=${errCode}, message=${errMsg}`,
      );
    }

    // PENDING / RUNNING — 继续轮询
    if (attempt % 10 === 1) {
      console.log(
        `  [asr] 轮询中... attempt=${attempt} status=${status || "?"}`,
      );
    }
  }

  throw new Error(
    `Bailian pollTask timed out after ${timeoutMs}ms (${attempt} attempts)`,
  );
}

async function fetchTranscript(transcriptionUrl: string): Promise<string> {
  const res = await fetch(transcriptionUrl);
  if (!res.ok) {
    throw new Error(
      `Bailian fetchTranscript HTTP ${res.status}: ${await res.text()}`,
    );
  }

  const json = await res.json();
  const transcripts: Array<{ text?: string }> = json?.transcripts || [];
  const text = transcripts.map((t) => t.text || "").join("\n");

  if (!text) {
    console.warn(
      `  [asr] 识别结果为空 — transcription JSON: ${JSON.stringify(json).slice(0, 200)}`,
    );
  }

  return text;
}

// ============================================================
// 对外统一接口
// ============================================================

/**
 * 使用百炼 Paraformer-v2 转写音频。
 *
 * @param audioPath 本地音频文件路径（WAV, PCM 16KHz 16bit mono）
 * @param durationMs 视频时长（毫秒），保留签名兼容，百炼接口统一处理不区分长短
 */
export async function transcribeAudio(
  audioPath: string,
  durationMs: number,
): Promise<string> {
  // ---- 前置检查 ----
  if (!DASHSCOPE_API_KEY) {
    throw new Error(
      "ASR not configured. Set DASHSCOPE_API_KEY env var (阿里云百炼 API Key).",
    );
  }

  const durationSec = durationMs / 1000;
  console.log(
    `  [asr] 开始转写 duration=${durationSec.toFixed(0)}s file=${path.basename(audioPath)}`,
  );

  // ---- 1. 上传音频到文件服务 → 获取公网 URL ----
  const { id: fileId, url: fileUrl } =
    await uploadToFileService(audioPath);

  let taskId: string | undefined;
  try {
    // ---- 2. 提交百炼 ASR 任务 ----
    taskId = await submitTask(fileUrl);

    // ---- 3. 轮询任务直到完成（最长等 8 分钟） ----
    const transcriptionUrl = await pollTask(taskId, 8 * 60_000);

    // ---- 4. 下载并解析识别结果 ----
    const transcript = await fetchTranscript(transcriptionUrl);

    const chars = transcript.length;
    console.log(
      `  [asr] 转写完成 → ${chars} 字符 (${durationSec.toFixed(0)}s 音频)`,
    );
    return transcript;
  } finally {
    // ---- 5. 清理远端文件（无论成败） ----
    await deleteFromFileService(fileId);
  }
}

/**
 * 批量转写。保留旧签名以兼容可能的调用方。
 *
 * 注意：实际批量转写应走 pipeline-service，此函数仅为签名兼容保留。
 */
export async function transcribeBatch(
  videos: Array<{ awemeId: string; videoUrl: string }>,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  for (const { awemeId, videoUrl } of videos) {
    try {
      const text = await transcribeAudio(videoUrl, 0);
      results.set(awemeId, text);
    } catch {
      results.set(awemeId, "");
    }
  }
  return results;
}
