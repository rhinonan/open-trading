import { db } from "@/db";
import { bloggers, works } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchUserPosts } from "@/lib/douyin-api";
import type { DouyinBlogger } from "@/types";

const CUTOFF_DATE = process.env.DOUYIN_SCAN_CUTOFF_DATE || "2026-06-01";
const MAX_PAGES = 50;
const PER_PAGE = 20;

export interface ScanResult {
  bloggerId: number;
  nickname: string;
  newWorks: number;
  errors: string[];
}

export async function scanAllBloggers(): Promise<ScanResult[]> {
  const allBloggers = db.select().from(bloggers).all();

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

  const cutoffTimestamp = Math.floor(
    new Date(CUTOFF_DATE).getTime() / 1000
  );

  try {
    let cursor = 0;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < MAX_PAGES) {
      const { awemeList, nextCursor, hasMore: more } = await fetchUserPosts(
        blogger.douyinUid,
        cursor,
        PER_PAGE
      );

      const newPosts = [];
      for (const post of awemeList) {
        // Stop if we've reached the cutoff date.
        // 置顶视频（is_top=1）可能是很早的作品且排在第一页最前面，
        // 跳过它继续往后翻，不能因此提前停止扫描。
        if (post.create_time < cutoffTimestamp) {
          if (post.is_top === 1) continue;
          hasMore = false;
          break;
        }

        const existing = db
          .select({ id: works.id })
          .from(works)
          .where(eq(works.awemeId, post.aweme_id))
          .get();
        if (!existing) {
          newPosts.push(post);
        }
      }

      if (newPosts.length > 0) {
        result.newWorks += newPosts.length;

        for (const post of newPosts) {
          const isImage = post.media_type === 2;
          const isVideo = post.media_type === 4;

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

          // 图集最多存 10 张图片（每张取 url_list 首个 URL）
          let imageUrls: string[] = [];
          if (isImage && post.images?.length) {
            imageUrls = post.images
              .slice(0, 10)
              .map((img: { url_list: string[] }) => img.url_list[0])
              .filter(Boolean);
          }

          await db.insert(works)
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
              transcriptStatus: "pending", // 图集与视频均入队
              mediaType: post.media_type,
              imageUrls: JSON.stringify(imageUrls),
            })
            .run();
        }
      }

      if (!more) hasMore = false;
      cursor = nextCursor;
      pageCount++;
    }
  } catch (err) {
    result.errors.push(
      err instanceof Error ? err.message : "Unknown error"
    );
  }

  return result;
}
