// scripts/test-transcriber.ts
// 测试讯飞 LFASR 语音转写 API 修复

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// 加载 .env（必须在 import transcriber 之前）
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

async function main() {
  const audioDir = path.resolve(__dirname, "..", "data", "audio");

  if (!fs.existsSync(audioDir)) {
    console.error("audio dir not found:", audioDir);
    process.exit(1);
  }

  const files = fs
    .readdirSync(audioDir)
    .filter((f) => f.endsWith(".wav"))
    .sort((a, b) => {
      // 选最小的先测试
      return fs.statSync(path.join(audioDir, a)).size -
        fs.statSync(path.join(audioDir, b)).size;
    });

  if (files.length === 0) {
    console.error("no WAV files found");
    process.exit(1);
  }

  // 测试最短的音频
  const testFile = files[0];
  const audioPath = path.join(audioDir, testFile);

  // 从 WAV header 读取时长
  const buf = fs.readFileSync(audioPath);
  const byteRate = buf.readUInt32LE(28);
  let offset = 12;
  let dataSize = 0;
  while (offset < buf.length - 8) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
  }
  const durationMs = Math.floor((dataSize / byteRate) * 1000);

  console.log("=".repeat(60));
  console.log(`测试文件: ${testFile}`);
  console.log(`文件大小: ${buf.length} bytes`);
  console.log(`时长: ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`使用接口: ${durationMs / 1000 <= 60 ? "IAT" : "LFASR"}`);
  console.log(`ASR_API_KEY: ${process.env.ASR_API_KEY || "(not set)"}`);
  console.log("=".repeat(60));

  try {
    // 动态 import 确保 .env 已加载
    const { transcribeAudio } = await import("../src/services/douyin/transcriber");

    const startTime = Date.now();
    const text = await transcribeAudio(audioPath, durationMs);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n✅ 转写成功!");
    console.log(`耗时: ${elapsed}s`);
    console.log(`字数: ${text.length}`);
    console.log("结果预览:");
    console.log(text.substring(0, 500) + (text.length > 500 ? "..." : ""));
  } catch (err) {
    console.error("\n❌ 转写失败:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
