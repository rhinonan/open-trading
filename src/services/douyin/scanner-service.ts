// src/services/douyin/scanner-service.ts
import { db } from "@/db";
import { bloggers, works } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchUserPosts } from "@/lib/douyin-api";
import type { DouyinBlogger } from "@/types";

export interface ScanResult {
  bloggerId: number;
  nickname: string;
  newWorks: number;
  errors: string[];
}

export async function scanAllBloggers(): Promise<ScanResult[]> {
  // 扫描所有博主，不区分 category（pending 和 predictor 都扫）
  const allBloggers = db
    .select()
    .from(bloggers)
    .all() as DouyinBlogger[];

  const results: ScanResult[] = [];
  for (const blogger of allBloggers) {
    results.push(await scanBlogger(blogger));
  }

  return results;
}

export async function scanBlogger(
  blogger: DouyinBlogger
): Promise<ScanResult> {
  const result: ScanResult = {
    bloggerId: blogger.id,
    nickname: blogger.nickname,
    newWorks: 0,
    errors: [],
  };

  try {
    const posts = await fetchUserPosts(blogger.douyinUid, 10);
    if (posts.length === 0) return result;

    // Find new works not yet in DB
    const newPosts = [];
    for (const post of posts) {
      const existing = db
        .select({ id: works.id })
        .from(works)
        .where(eq(works.awemeId, post.aweme_id))
        .get();
      if (!existing) {
        newPosts.push(post);
      }
    }

    if (newPosts.length === 0) return result;
    result.newWorks = newPosts.length;

    // Insert new works (raw data only, no downstream processing)
    for (const post of newPosts) {
      const isImage = post.media_type === 2;
      const isVideo = post.media_type === 4;

      // 从 url_list 中挑浏览器兼容格式：jpeg > webp > png > 第一项
      const pickCover = (urlList: string[]) =>
        urlList.find((u) => u.includes(".jpeg") || u.includes(".jpg")) ||
        urlList.find((u) => u.includes(".webp")) ||
        urlList.find((u) => u.includes(".png")) ||
        urlList[0] ||
        "";

      let coverUrl = "";
      if (isVideo) {
        const originCover = (post.video as any)?.origin_cover?.url_list || [];
        coverUrl = pickCover(originCover) || pickCover(post.video?.cover?.url_list || []);
      } else if (isImage && post.images?.length) {
        coverUrl = pickCover(post.images[0].url_list || []);
      }
      if (!coverUrl) {
        coverUrl = post.video?.cover?.url_list?.[0] || "";
      }

      db.insert(works)
        .values({
          awemeId: post.aweme_id,
          bloggerId: blogger.id,
          desc: post.desc || "",
          videoUrl: isVideo
            ? post.video?.download_addr?.url_list?.[0] || null
            : null,
          duration: post.video?.duration || 0,
          coverUrl,
          shareUrl: post.share_url || "",
          statistics: JSON.stringify(post.statistics || {}),
          publishedAt: post.create_time,
          transcriptStatus: isVideo ? "pending" : "done",
        })
        .run();
    }

    // =====================================================================
    // TODO: 下游处理 pipeline（逐个实现）：
    //   1. 下载视频文件 (download_addr.url_list[0])
    //   2. ffmpeg 提取音轨
    //   3. 云端 ASR 转文本 → 更新 works.transcript / transcriptStatus
    // =====================================================================
  } catch (err) {
    result.errors.push(
      err instanceof Error ? err.message : "Unknown error"
    );
  }

  return result;
}
