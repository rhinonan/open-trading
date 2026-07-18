// src/services/douyin/video-downloader.ts
import * as fs from "fs";
import * as path from "path";
import { fetchOneVideo } from "@/lib/douyin-api";
import { dataPath } from "@/lib/data-root";

const VIDEOS_DIR = dataPath("videos");

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
    console.log(`  [download] ${awemeId} 已存在，跳过`);
    return filePath;
  }

  let lastError: Error | null = null;
  let currentUrl = videoUrl;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`  [download] ${awemeId} 尝试 ${attempt + 1}/3...`);
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
          try {
            const fresh = await fetchOneVideo(awemeId);
            const newUrl =
              fresh?.video?.download_addr?.url_list?.[0];
            if (newUrl && newUrl !== currentUrl) {
              currentUrl = newUrl;
              continue; // 用新地址重试
            }
          } catch {
            // fetchOneVideo failed — don't retry, this is terminal
            throw new Error(`CDN link expired and failed to fetch fresh URL for ${awemeId}`);
          }
        }
        throw new Error(
          `Download failed: HTTP ${res.status} ${res.statusText}`
        );
      }

      // Stream response body directly to disk to avoid full-buffer in RAM
      const fileStream = fs.createWriteStream(filePath);
      const reader = res.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(Buffer.from(value));
      }
      fileStream.end();
      // Wait for write to finish
      await new Promise<void>((resolve, reject) => {
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });
      const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(1);
      console.log(`  [download] ${awemeId} 完成 → ${sizeMB}MB`);
      return filePath;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`  [download] ${awemeId} 尝试 ${attempt + 1} 失败: ${lastError.message}`);
      if (attempt < 2) {
        await sleep(Math.pow(2, attempt) * 1000); // 1s / 2s / 4s
      }
    }
  }

  throw new Error(
    `Failed to download video ${awemeId} after 3 attempts: ${lastError?.message}`
  );
}
