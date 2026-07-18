// src/services/douyin/image-downloader.ts
import * as fs from "fs";
import * as path from "path";
import { dataPath } from "@/lib/data-root";

const IMAGES_DIR = dataPath("images");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 下载图集图片到本地。
 * @param awemeId - 抖音作品 aweme_id
 * @param imageUrls - 图片 CDN URL 列表（最多 10 张）
 * @returns 本地文件路径数组 data/images/{awemeId}/0.jpg, 1.jpg, ...
 */
export async function downloadImages(
  awemeId: string,
  imageUrls: string[]
): Promise<string[]> {
  const dir = path.join(IMAGES_DIR, awemeId);
  ensureDir(dir);

  const localPaths: string[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const ext = imageUrls[i].match(/\.(jpe?g|png|webp)(\?|$)/i)?.[1] || "jpg";
    const filePath = path.join(dir, `${i}.${ext}`);

    // 幂等：已存在直接跳过
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      localPaths.push(filePath);
      continue;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);

        const res = await fetch(imageUrls[i], {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        clearTimeout(timeout);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        localPaths.push(filePath);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < 2) {
          await sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    if (localPaths.length <= i) {
      console.error(
        `[image-download] ${awemeId} 第 ${i} 张下载失败: ${lastError?.message}`
      );
    }
  }

  return localPaths;
}
