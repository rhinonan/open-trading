// src/services/douyin/audio-extractor.ts
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

const AUDIO_DIR = path.join(process.cwd(), "data", "audio");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function findFfmpeg(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

/**
 * Use system ffmpeg binary to extract audio track, output PCM 16KHz mono WAV.
 */
export async function extractAudio(
  videoPath: string,
  awemeId: string
): Promise<string> {
  ensureDir(AUDIO_DIR);
  const outputPath = path.join(AUDIO_DIR, `${awemeId}.wav`);

  // Idempotent: skip if output already exists and is non-empty
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    console.log(`  [audio] ${awemeId} 已存在，跳过`);
    return outputPath;
  }

  const videoSizeMB = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
  console.log(`  [audio] ${awemeId} 转码中 (${videoSizeMB}MB)...`);

  const ffmpegBin = findFfmpeg();

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, [
      "-y",                     // overwrite output
      "-i", videoPath,
      "-vn",                    // strip video
      "-acodec", "pcm_s16le",   // PCM 16bit
      "-ar", "16000",           // 16kHz sample rate
      "-ac", "1",               // mono
      outputPath,
    ]);

    let stderr = "";
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        const audioSizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0);
        console.log(`  [audio] ${awemeId} 完成 → ${audioSizeKB}KB`);
        resolve(outputPath);
      } else {
        // Extract last meaningful line from ffmpeg stderr
        const lines = stderr.trim().split("\n");
        const lastLine = lines[lines.length - 1] || stderr.trim();
        reject(new Error(`ffmpeg exit ${code}: ${lastLine}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });
  });
}
