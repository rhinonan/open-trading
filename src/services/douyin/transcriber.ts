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
// 鉴权工具
// ============================================================

// IAT (语音听写) 鉴权：HMAC-SHA256
function rfc1123Date(): string {
  return new Date().toUTCString();
}

function buildIatSignature(
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

function buildIatAuthorization(
  host: string,
  date: string,
  httpMethod: string,
  httpPath: string
): string {
  const signature = buildIatSignature(host, date, httpMethod, httpPath);
  const authObj = {
    api_key: ASR_API_KEY,
    algorithm: "hmac-sha256",
    signature,
  };
  return Buffer.from(JSON.stringify(authObj)).toString("base64");
}

// LFASR (语音转写) 鉴权：Base64(HmacSHA1(MD5(appId + ts), secretKey))
// 注意：MD5 结果必须是 32 位小写十六进制字符串，不是 raw bytes！
function buildLfasrSigna(appId: string, ts: number): string {
  const md5Hex = crypto.createHash("md5").update(appId + String(ts)).digest("hex");
  const hmac = crypto.createHmac("sha1", ASR_API_SECRET).update(md5Hex).digest();
  return hmac.toString("base64");
}

// ============================================================
// 内部：讯飞语音听写 IAT（≤60s 短音频）
// ============================================================

function transcribeShort(audioPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const host = "iat-api.xfyun.cn";
    const date = rfc1123Date();
    // 关键：authorization 必须使用与 URL 参数相同的 date，否则签名验证失败
    const authorization = buildIatAuthorization(host, date, "GET", "/v2/iat");

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
// 接口文档：https://www.xfyun.cn/doc/asr/ifasr_new/API.html
// ============================================================

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** LFASR 状态常量 */
const LFASR_STATUS = {
  CREATED: 0,      // 任务创建成功
  EXTRACTING: 1,   // 音频特征提取中
  EXTRACTED: 2,    // 音频特征提取完成
  PROCESSING: 3,   // 转写处理中
  COMPLETED: 4,    // 转写完成
  FAILED: 5,       // 转写失败
} as const;

async function transcribeLong(audioPath: string, durationMs: number): Promise<string> {
  const host = "raasr.xfyun.cn";
  const appId = ASR_API_KEY;

  const audioBuffer = fs.readFileSync(audioPath);
  const fileSize = audioBuffer.length;

  // ============================================================
  // Step 1: 上传音频文件
  // POST https://raasr.xfyun.cn/v2/api/upload
  // 鉴权参数通过 URL query string 传递
  // ============================================================
  const uploadTs = Math.floor(Date.now() / 1000);
  const uploadSigna = buildLfasrSigna(appId, uploadTs);

  const uploadParams = new URLSearchParams({
    appId,
    signa: uploadSigna,
    ts: String(uploadTs),
    fileSize: String(fileSize),
    fileName: "audio.wav",
    duration: String(durationMs),
    language: "cn",
  });

  const uploadUrl = `https://${host}/v2/api/upload?${uploadParams}`;

  console.log(`  [asr] LFASR 上传中, fileSize=${fileSize}, duration=${durationMs}ms`);

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: audioBuffer,
  });

  if (!uploadRes.ok) {
    throw new Error(
      `LFASR upload failed: HTTP ${uploadRes.status} ${uploadRes.statusText}`
    );
  }

  const uploadJson = await uploadRes.json();

  // LFASR API: code 可能是字符串 "000000" 或数字 0
  const uploadOk = uploadJson.code === "000000" || uploadJson.code === 0;
  if (!uploadOk) {
    const errMsg = uploadJson.descInfo || uploadJson.message || "unknown";
    throw new Error(
      `LFASR upload error: code=${uploadJson.code}, message=${errMsg}`
    );
  }

  // 响应体：content.orderId（新版）或 data.orderId（部分实现）
  const orderId: string =
    uploadJson.content?.orderId ||
    uploadJson.data?.orderId ||
    uploadJson.data?.task_id;
  if (!orderId) {
    throw new Error(
      `LFASR upload returned no orderId: ${JSON.stringify(uploadJson)}`
    );
  }

  console.log(`  [asr] LFASR 上传成功, orderId=${orderId}, 开始轮询...`);

  // ============================================================
  // Step 2: 轮询结果（间隔 10s，最多等 8 分钟）
  // GET https://raasr.xfyun.cn/v2/api/getResult
  // ============================================================
  const resultUrl = `https://${host}/v2/api/getResult`;
  const maxAttempts = 48;
  let consecutiveFailures = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(10_000);

    // 每次轮询需要新的 ts 和签名
    const resultTs = Math.floor(Date.now() / 1000);
    const resultSigna = buildLfasrSigna(appId, resultTs);

    const resultParams = new URLSearchParams({
      appId,
      signa: resultSigna,
      ts: String(resultTs),
      orderId,
    });

    const resultRes = await fetch(`${resultUrl}?${resultParams}`);

    if (!resultRes.ok) {
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        throw new Error(
          `LFASR poll failed after ${consecutiveFailures} consecutive HTTP errors: ${resultRes.status}`
        );
      }
      continue;
    }

    const resultJson = await resultRes.json();

    // code: "000000" (string) 或 0 (integer) 表示成功
    const resultOk = resultJson.code === "000000" || resultJson.code === 0;
    if (!resultOk) {
      consecutiveFailures++;
      const errMsg = resultJson.descInfo || resultJson.message || "unknown";
      if (consecutiveFailures >= 3) {
        throw new Error(
          `LFASR poll failed after ${consecutiveFailures} consecutive API errors: code=${resultJson.code}, message=${errMsg}`
        );
      }
      continue;
    }

    consecutiveFailures = 0;

    // 响应结构：content.orderInfo（LFASR v2）或 data（旧版）
    const orderInfo = resultJson.content?.orderInfo || resultJson.data;
    const status = orderInfo?.status;
    const statusDesc = orderInfo?.statusDesc || orderInfo?.desc || "";

    // status 4 = 转写完成
    if (status === LFASR_STATUS.COMPLETED) {
      // orderResult 是 JSON 字符串
      const orderResultRaw: string =
        resultJson.content?.orderResult || resultJson.data?.result || "";

      if (!orderResultRaw) {
        console.log("  [asr] LFASR 完成但结果为空");
        return "";
      }

      // 解析 lattice 结构：{ lattice: [{ json_1best: "{...}" }] }
      const parts: string[] = [];
      try {
        const orderResult = JSON.parse(orderResultRaw);
        const lattice = orderResult.lattice || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const item of lattice) {
          try {
            const json1best = JSON.parse(item.json_1best);
            const rt = json1best?.st?.rt || [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const rtItem of rt) {
              const ws = rtItem.ws || [];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              for (const w of ws) {
                const cw = w.cw || [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const c of cw) {
                  if (c.w) parts.push(c.w);
                }
              }
            }
          } catch {
            // 跳过无法解析的片段
          }
        }
      } catch {
        // 如果 orderResult 不是 JSON，直接返回
        return orderResultRaw;
      }

      const text = parts.join("");
      console.log(`  [asr] LFASR 完成 → ${text.length} 字符`);
      return text;
    }

    // status 5 = 转写失败
    if (status === LFASR_STATUS.FAILED) {
      throw new Error(
        `LFASR task failed: ${JSON.stringify(orderInfo)}`
      );
    }

    // status 0-3 继续轮询，输出进度
    console.log(`  [asr] LFASR 轮询 ${attempt + 1}/${maxAttempts}, status=${status}${statusDesc ? ` (${statusDesc})` : ""}`);
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
  return transcribeLong(audioPath, durationMs);
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
