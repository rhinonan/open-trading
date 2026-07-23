// src/services/douyin/transcriber.ts
// 阿里云百炼 Paraformer-v2 ASR 适配器
// 流程：压缩音频 → 上传文件服务 → 提交百炼任务 → 轮询 → 下载识别结果 → 清理远端文件
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import * as crypto from "crypto";
import { dataPath, ensureDataRoot } from "@/lib/data-root";

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
// 音频压缩（WAV → MP3，避免大文件触发 nginx 413）
// ============================================================

const TMP_DIR = dataPath("tmp");

function ensureTmpDir() {
  ensureDataRoot();
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function findFfmpeg(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

/**
 * 将 WAV 转为 MP3（64kbps mono），返回压缩后文件路径。
 * 163s WAV ≈ 5.2MB → MP3 ≈ 1.3MB，可过 nginx 1MB 限制的...
 * 不够，32kbps 才 ~650KB。用 32kbps 语音够用。
 */
export async function compressAudio(wavPath: string): Promise<string> {
  ensureTmpDir();
  const id = crypto.randomUUID();
  const outPath = path.join(TMP_DIR, `${id}.mp3`);

  const ffmpegBin = findFfmpeg();
  const wavSizeKB = (fs.statSync(wavPath).size / 1024).toFixed(0);

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, [
      "-y",
      "-i", wavPath,
      "-vn",
      "-acodec", "libmp3lame",
      "-b:a", "32k",
      "-ar", "16000",
      "-ac", "1",
      outPath,
    ]);

    let stderr = "";
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        const mp3SizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
        console.log(
          `  [asr] 音频压缩完成 ${wavSizeKB}KB → ${mp3SizeKB}KB`,
        );
        resolve(outPath);
      } else {
        const lines = stderr.trim().split("\n");
        const lastLine = lines[lines.length - 1] || stderr.trim();
        reject(new Error(`ffmpeg compress exit ${code}: ${lastLine}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`ffmpeg compress spawn failed: ${err.message}`));
    });
  });
}

// ============================================================
// 文件服务操作
// ============================================================

export async function uploadToFileService(
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
    body: new Uint8Array(body),
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

export async function deleteFromFileService(id: string): Promise<void> {
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

export async function submitAsrTask(fileUrl: string): Promise<string> {
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

/**
 * 轮询百炼任务。onTick 可选：elapsedMs/timeoutMs，用于写 pipeline 进度。
 */
export async function pollAsrTask(
  taskId: string,
  timeoutMs: number,
  onTick?: (info: { elapsedMs: number; timeoutMs: number; attempt: number }) => void | Promise<void>,
): Promise<string> {
  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < timeoutMs) {
    await sleep(2_000);
    attempt++;
    const elapsedMs = Date.now() - start;
    if (onTick) {
      await onTick({ elapsedMs, timeoutMs, attempt });
    }

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

export async function fetchAsrTranscript(transcriptionUrl: string): Promise<string> {
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

  // ---- 1. 压缩 WAV → MP3（避免大文件触发 nginx 413） ----
  const compressedPath = await compressAudio(audioPath);

  try {
    // ---- 2. 上传压缩后的音频到文件服务 → 获取公网 URL ----
    const { id: fileId, url: fileUrl } =
      await uploadToFileService(compressedPath);

    try {
      // ---- 3. 提交百炼 ASR 任务 ----
      const taskId = await submitAsrTask(fileUrl);

      // ---- 4. 轮询任务直到完成（最长等 8 分钟） ----
      const transcriptionUrl = await pollAsrTask(taskId, 8 * 60_000);

      // ---- 5. 下载并解析识别结果 ----
      const transcript = await fetchAsrTranscript(transcriptionUrl);

      const chars = transcript.length;
      console.log(
        `  [asr] 转写完成 → ${chars} 字符 (${durationSec.toFixed(0)}s 音频)`,
      );
      return transcript;
    } finally {
      // ---- 清理远端文件（无论成败） ----
      await deleteFromFileService(fileId);
    }
  } finally {
    // ---- 清理本地压缩临时文件 ----
    try {
      fs.unlinkSync(compressedPath);
    } catch {
      // 忽略清理错误
    }
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
