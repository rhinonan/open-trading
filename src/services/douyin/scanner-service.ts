// src/services/douyin/scanner-service.ts
import { db } from "@/db";
import { bloggers, works } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchDouyinUserPosts } from "@/lib/douyin-api";
import { transcribeBatch } from "./transcriber";
import type { DouyinBlogger } from "@/types";

export interface ScanResult {
  bloggerId: number;
  nickname: string;
  newWorks: number;
  transcribedWorks: number;
  errors: string[];
}

export async function scanAllBloggers(): Promise<ScanResult[]> {
  const predictorBloggers = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.category, "predictor"))
    .all() as DouyinBlogger[];

  const results: ScanResult[] = [];
  for (const blogger of predictorBloggers) {
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
    transcribedWorks: 0,
    errors: [],
  };

  try {
    const posts = await fetchDouyinUserPosts(blogger.douyinUid, 10);
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

    // Insert new works
    const videosToTranscribe: Array<{ awemeId: string; videoUrl: string }> =
      [];
    for (const post of newPosts) {
      db.insert(works)
        .values({
          awemeId: post.aweme_id,
          bloggerId: blogger.id,
          desc: post.desc || "",
          duration: post.video?.duration || 0,
          coverUrl: post.video?.cover?.url_list?.[0] || "",
          shareUrl: post.share_url || "",
          statistics: JSON.stringify(post.statistics || {}),
          publishedAt: post.create_time,
          transcriptStatus: "pending",
        })
        .run();

      const videoUrl =
        post.video?.download_addr?.url_list?.[0] ||
        post.video?.play_addr?.url_list?.[0] ||
        "";
      if (videoUrl) {
        videosToTranscribe.push({ awemeId: post.aweme_id, videoUrl });
      }
    }

    // Transcribe
    if (videosToTranscribe.length > 0) {
      const transcripts = await transcribeBatch(videosToTranscribe);
      for (const [awemeId, text] of transcripts) {
        if (text) {
          db.update(works)
            .set({ transcript: text, transcriptStatus: "done" })
            .where(eq(works.awemeId, awemeId))
            .run();
          result.transcribedWorks++;
        } else {
          db.update(works)
            .set({ transcriptStatus: "failed" })
            .where(eq(works.awemeId, awemeId))
            .run();
        }
      }
    }
  } catch (err) {
    result.errors.push(
      err instanceof Error ? err.message : "Unknown error"
    );
  }

  return result;
}
