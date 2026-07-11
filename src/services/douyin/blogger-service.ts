// src/services/douyin/blogger-service.ts
import { db } from "@/db";
import { bloggers, works } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { fetchDouyinVideo, fetchDouyinUserPosts } from "@/lib/douyin-api";
import { callClaude, parseClaudeJson } from "@/lib/llm";
import { transcribeBatch } from "./transcriber";
import type { DouyinBlogger, BloggerCategory, PredictionMix } from "@/types";

const BLOGGER_CLASSIFY_PROMPT = `你是A股市场分析专家。以下是一个抖音博主最近发布的视频文案汇总。请判断该博主是否在做A股市场的行情预测。

判断标准：
- 行情预测包括：大盘涨跌方向、指数具体点位、板块或行业走势、个股推荐
- 模糊的市场情绪表达（如"最近行情不好"）不算预测
- 需要有明确的判断方向或结论

返回严格JSON（不要markdown代码块包裹）：
{
  "category": "predictor",
  "prediction_mix": { "marketDirection": 0.4, "indexLevel": 0.2, "sector": 0.3, "stockPick": 0.1 },
  "hasReasoning": true,
  "note": "该博主以大盘方向判断为主，兼有板块分析，具备明确的逻辑框架"
}

如果博主不做行情预测，category 填 "non_predictor"，prediction_mix 全部为 0。`;

interface ClassifyResult {
  category: "predictor" | "non_predictor";
  prediction_mix: PredictionMix;
  hasReasoning: boolean;
  note: string;
}

export async function listBloggers(
  category?: BloggerCategory
): Promise<DouyinBlogger[]> {
  if (category) {
    return db
      .select()
      .from(bloggers)
      .where(eq(bloggers.category, category))
      .orderBy(desc(bloggers.createdAt))
      .all() as DouyinBlogger[];
  }
  return db
    .select()
    .from(bloggers)
    .orderBy(desc(bloggers.createdAt))
    .all() as DouyinBlogger[];
}

export async function getBloggerById(
  id: number
): Promise<DouyinBlogger | null> {
  const result = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.id, id))
    .get();
  return (result as DouyinBlogger) ?? null;
}

export async function addBlogger(douyinUid: string): Promise<DouyinBlogger> {
  // Check for duplicates
  const existing = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.douyinUid, douyinUid))
    .get();
  if (existing) {
    throw new Error(`博主 ${douyinUid} 已存在`);
  }

  // Fetch a video to get author info (the douyin API returns author data on any video fetch)
  // Use fetchDouyinUserPosts to get author + recent works in one call
  const posts = await fetchDouyinUserPosts(douyinUid, 1);
  if (posts.length === 0) {
    throw new Error(`无法获取博主 ${douyinUid} 的信息，请检查 ID 是否正确`);
  }

  const author = posts[0].author;
  const avatar = author.avatar_medium?.url_list?.[0]
    || author.avatar_thumb?.url_list?.[0]
    || "";

  const blogger = db
    .insert(bloggers)
    .values({
      douyinUid: douyinUid,
      nickname: author.nickname,
      avatarUrl: avatar,
      signature: author.signature || "",
      followerCount: author.follower_count || 0,
      category: "pending",
    })
    .returning()
    .get() as DouyinBlogger;

  // Trigger classification in background (don't await — caller gets immediate response)
  classifyBlogger(blogger.id).catch(console.error);

  return blogger;
}

export async function deleteBlogger(id: number): Promise<void> {
  db.delete(bloggers).where(eq(bloggers.id, id)).run();
}

export async function classifyBlogger(bloggerId: number): Promise<void> {
  const blogger = await getBloggerById(bloggerId);
  if (!blogger) throw new Error(`Blogger ${bloggerId} not found`);

  // Fetch recent works
  const posts = await fetchDouyinUserPosts(blogger.douyinUid, 20);
  if (posts.length === 0) return;

  // Insert works (skip existing by awemeId)
  const inserted: Array<{ id: number; awemeId: string }> = [];
  for (const post of posts) {
    const existing = db
      .select({ id: works.id })
      .from(works)
      .where(eq(works.awemeId, post.aweme_id))
      .get();
    if (!existing) {
      const w = db
        .insert(works)
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
        .returning()
        .get();
      inserted.push({ id: (w as any).id, awemeId: post.aweme_id });
    }
  }

  // Attempt ASR transcription for new works
  const videosToTranscribe = posts
    .filter((p) => inserted.some((iw) => iw.awemeId === p.aweme_id))
    .map((p) => ({
      awemeId: p.aweme_id,
      videoUrl: p.video?.download_addr?.url_list?.[0]
        || p.video?.play_addr?.url_list?.[0]
        || "",
    }))
    .filter((v) => v.videoUrl);

  const transcripts = await transcribeBatch(videosToTranscribe);

  // Update transcripts
  for (const [awemeId, text] of transcripts) {
    if (text) {
      db.update(works)
        .set({ transcript: text, transcriptStatus: "done" })
        .where(eq(works.awemeId, awemeId))
        .run();
    } else {
      db.update(works)
        .set({ transcriptStatus: "failed" })
        .where(eq(works.awemeId, awemeId))
        .run();
    }
  }

  // Build the content summary for LLM classification
  const allWorks = db
    .select()
    .from(works)
    .where(eq(works.bloggerId, bloggerId))
    .orderBy(desc(works.publishedAt))
    .limit(20)
    .all();

  const contentSummary = allWorks
    .map(
      (w) =>
        `[${new Date(w.publishedAt * 1000).toISOString().slice(0, 10)}] desc: ${
          w.desc
        }\ntranscript: ${w.transcript || "(未转写)"}`
    )
    .join("\n\n");

  if (!contentSummary.trim()) return;

  const llmResponse = await callClaude(
    contentSummary,
    BLOGGER_CLASSIFY_PROMPT
  );
  const result = parseClaudeJson<ClassifyResult>(llmResponse);

  const now = Math.floor(Date.now() / 1000);
  db.update(bloggers)
    .set({
      category: result.category,
      classifiedAt: now,
      classificationNote: result.note,
      updatedAt: now,
    })
    .where(eq(bloggers.id, bloggerId))
    .run();
}
