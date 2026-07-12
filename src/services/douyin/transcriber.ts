// src/services/douyin/transcriber.ts
// 讯飞 ASR 适配器：语音听写 IAT（≤60s） + 语音转写 LFASR（>60s）
import * as fs from "fs";
import * as crypto from "crypto";
import WebSocket from "ws";

const ASR_API_KEY = process.env.ASR_API_KEY || "";
const ASR_API_SECRET = process.env.ASR_API_SECRET || "";

// Parse actual data chunk offset from RIFF header (handles extended chunks)
function findWavDataOffset(buffer: Buffer): number {
  // RIFF header: "RIFF" (4) + fileSize (4) + "WAVE" (4) = 12 bytes
  // Then chunks: "fmt " (4) + chunkSize (4) + data
  // We need to find the "data" chunk
  let offset = 12;
  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "data") return offset + 8;
    offset += 8 + chunkSize;
  }
  return 44; // fallback to standard
}

// ============================================================
// 鉴权工具（通用）
// ============================================================

function rfc1123Date(): string {
  return new Date().toUTCString();
}

function buildSignature(
  host: string,
  date: string,
  httpMethod: string,
  httpPath: string
): string {
  const origin = `host: ${host}\ndate: ${date}\n${httpMethod} ${httpPath} HTTP/1.1`;
  const hmac = crypto.createHmac("sha256", ASR_API_SECRET);
  hmac.update(origin);
  return hmac.digest("base64");
}

function buildAuthorization(
  host: string,
  date: string,
  httpMethod: string,
  httpPath: string
): string {
  const signature = buildSignature(host, date, httpMethod, httpPath);
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
    // 关键：authorization 必须使用与 URL 参数相同的 date，否则签名验证失败
    const authorization = buildAuthorization(host, date, "GET", "/v2/iat");

    const url =
      `wss://${host}/v2/iat?` +
      `host=${encodeURIComponent(host)}&` +
      `date=${encodeURIComponent(date)}&` +
      `authorization=${encodeURIComponent(authorization)}`;

    const ws = new WebSocket(url);
    const results: string[] = [];
    let finished = false;

    ws.onopen = () => {
      // Step 1: 发送参数帧（metadata）— IAT 协议要求首帧为 JSON 参数
      const metaFrame = JSON.stringify({
        common: { app_id: ASR_API_KEY },
        business: {
          language: "zh_cn",
          domain: "iat",
          accent: "mandarin",
          vad_eos: 3000,
        },
        data: {
          status: 0, // 0=首帧, 1=中间帧, 2=尾帧
          format: "audio/L16;rate=16000",
          encoding: "raw",
          audio: "", // 首帧不含音频数据
        },
      });
      ws.send(metaFrame);

      // Step 2: 分帧发送音频数据，每帧 ≤1280 bytes
      // 音频文件为 WAV 格式，需跳过 44 字节头，只发送原始 PCM 数据
      const fileBuf = fs.readFileSync(audioPath);
      const audioBuf = fileBuf.subarray(findWavDataOffset(fileBuf));
      const frameSize = 1280;
      for (let i = 0; i < audioBuf.length; i += frameSize) {
        const chunk = audioBuf.subarray(i, i + frameSize);
        const isLast = i + frameSize >= audioBuf.length;
        const dataFrame = JSON.stringify({
          data: {
            status: isLast ? 2 : 1,
            format: "audio/L16;rate=16000",
            encoding: "raw",
            audio: Buffer.from(chunk).toString("base64"),
          },
        });
        ws.send(dataFrame);
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        // event.data: 文本帧为 string，二进制帧为 Buffer（Node.js 默认 binaryType）
        const raw =
          typeof event.data === "string"
            ? event.data
            : Buffer.isBuffer(event.data)
              ? event.data.toString()
              : String(event.data);
        const msg = JSON.parse(raw);
        if (msg.code !== 0) {
          ws.close();
          reject(new Error(`IAT error: code=${msg.code}, ${msg.message}`));
          return;
        }
        if (msg.data?.result) {
          // 解析识别结果
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const text = msg.data.result
            .map(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (wsItem: any) =>
                (wsItem.cw || [])
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .map((cw: any) => cw.w || "")
                  .join("")
            )
            .join("");
          if (text) results.push(text);
        }
        // code === 0 && data.status === 2 表示最后一帧
        if (msg.code === 0 && msg.data?.status === 2) {
          finished = true;
          ws.close();
        }
      } catch {
        // 非 JSON 帧（binary ACK）忽略
      }
    };

    ws.onclose = () => {
      if (finished) {
        resolve(results.join(""));
      } else {
        reject(new Error("IAT WebSocket closed unexpectedly"));
      }
    };

    ws.onerror = () => {
      reject(new Error("IAT WebSocket error"));
    };

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

async function transcribeLong(audioPath: string): Promise<string> {
  const host = "raasr.xfyun.cn";

  // Step 1: 提交音频文件
  const date = rfc1123Date();
  const authorization = buildAuthorization(host, date, "POST", "/v2/api/submit");
  const submitUrl = `https://${host}/v2/api/submit`;

  const audioBuffer = fs.readFileSync(audioPath);
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer]), "audio.wav");

  const submitRes = await fetch(submitUrl, {
    method: "POST",
    headers: {
      Host: host,
      Date: date,
      Authorization: authorization,
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

  console.log(`  [asr] LFASR 提交成功, task_id=${taskId}, 开始轮询...`);

  // Step 2: 轮询结果（间隔 10s，最多等 5 分钟）
  const resultUrl = `https://${host}/v2/api/result`;
  const maxAttempts = 30;
  let consecutiveFailures = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(10_000);

    // 每次轮询需要新的 date 和签名（GET 请求）
    const resultDate = rfc1123Date();
    const resultAuth = buildAuthorization(host, resultDate, "GET", "/v2/api/result");

    const resultRes = await fetch(
      `${resultUrl}?task_id=${encodeURIComponent(taskId)}`,
      {
        headers: {
          Host: host,
          Date: resultDate,
          Authorization: resultAuth,
        },
      }
    );

    if (!resultRes.ok) {
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        throw new Error(
          `LFASR poll failed after ${consecutiveFailures} consecutive errors: HTTP ${resultRes.status}`
        );
      }
      continue;
    }

    const resultJson = await resultRes.json();
    if (resultJson.code !== 0) {
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        throw new Error(
          `LFASR poll failed after ${consecutiveFailures} consecutive errors: code=${resultJson.code}`
        );
      }
      continue;
    }

    consecutiveFailures = 0;

    // status: 1=处理中, 2=完成, 3=失败
    if (resultJson.data?.status === 2) {
      const segments = resultJson.data.result || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = segments.map((seg: any) => seg.onebest || "").join("");
      console.log(`  [asr] LFASR 完成 → ${text.length} 字符`);
      return text;
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
 * @param audioPath 本地音频文件路径（WAV 格式，PCM 16KHz 16bit mono）
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
    console.log(`  [asr] 使用 IAT 短音频接口 (${durationSec.toFixed(0)}s)`);
    return transcribeShort(audioPath);
  }
  console.log(`  [asr] 使用 LFASR 长音频接口 (${durationSec.toFixed(0)}s)`);
  return transcribeLong(audioPath);
}

/**
 * 批量转写。保留旧签名以兼容可能的调用方。
 *
 * 注意：旧接口传入的是 videoUrl（CDN 链接），不是 audioPath。
 * 实际批量转写应走 pipeline-service（Task 6），此函数仅为签名兼容保留。
 * 如果直接调用此函数且未经过下载/提取音频步骤，会抛出错误。
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
