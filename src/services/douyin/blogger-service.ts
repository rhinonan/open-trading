// src/services/douyin/blogger-service.ts
import { db } from "@/db";
import { bloggers, works } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { fetchUserProfile, fetchUserPosts } from "@/lib/douyin-api";
import type { DouyinBlogger, BloggerCategory } from "@/types";

// ============================================================================
// TODO: classifyBlogger — 需要先实现音频转文本 + LLM 分析后再启用
// 当前阶段仅入库原始 API 数据，category 保持 "pending"
//
// 完整流程：
//   1. 下载视频 → 提取音频 → ASR 转文本（见 transcriber.ts）
//   2. 汇总文案 → LLM 定位（predictor / non_predictor）
//   3. 更新 blogger.category / classifiedAt / classificationNote
// ============================================================================

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

  // Fetch user profile from TikHub
  const profile = await fetchUserProfile(douyinUid);
  if (!profile) {
    throw new Error(`无法获取博主 ${douyinUid} 的信息，请检查 ID 是否正确`);
  }

  const avatar =
    profile.avatar_medium?.url_list?.[0] ||
    profile.avatar_thumb?.url_list?.[0] ||
    "";

  const blogger = db
    .insert(bloggers)
    .values({
      douyinUid: douyinUid,
      nickname: profile.nickname || "",
      avatarUrl: avatar,
      signature: profile.signature || "",
      followerCount: profile.follower_count || 0,
      category: "pending",
    })
    .returning()
    .get() as DouyinBlogger;

  // TODO: classifyBlogger — 等 ASR + LLM 就绪后，取消下行注释
  // classifyBlogger(blogger.id).catch(console.error);

  return blogger;
}

export async function deleteBlogger(id: number): Promise<void> {
  db.delete(bloggers).where(eq(bloggers.id, id)).run();
}

// ============================================================================
// TODO: 重新启用 classifyBlogger
//
// 该函数在 addBlogger 之后异步执行，流程：
//   1. 拉取博主最近 N 条作品
//   2. 新作品入库（按 awemeId 去重）
//   3. 下载视频 → 提取音频 → ASR 转文本
//   4. 汇总所有文案 → LLM 分类
//   5. 更新 blogger.category / classifiedAt / classificationNote
//
// export async function classifyBlogger(bloggerId: number): Promise<void> {
//   const blogger = await getBloggerById(bloggerId);
//   if (!blogger) throw new Error(`Blogger ${bloggerId} not found`);
//
//   const posts = await fetchUserPosts(blogger.douyinUid, 20);
//   if (posts.length === 0) return;
//
//   // 入库新作品 ...
//   // 下载 + 提取音频 + ASR ...
//   // LLM 分类 ...
// }
// ============================================================================
