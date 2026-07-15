// src/services/douyin/blogger-service.ts
import { db } from "@/db";
import { bloggers, works } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { fetchUserProfile, fetchUserPosts } from "@/lib/douyin-api";
import type { DouyinBlogger, BloggerCategory } from "@/types";

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

export async function addBlogger(
  douyinUid: string,
  category: BloggerCategory = "predictor"
): Promise<DouyinBlogger> {
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

  // url_list 中前几个通常是 .heic（浏览器不支持），优先取 jpeg/png/webp
  const pickAvatarUrl = (urls?: string[]): string => {
    if (!urls?.length) return "";
    return urls.find((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u)) || urls[0];
  };
  const avatar =
    pickAvatarUrl(profile.avatar_medium?.url_list) ||
    pickAvatarUrl(profile.avatar_thumb?.url_list) ||
    "";

  const blogger = db
    .insert(bloggers)
    .values({
      douyinUid: douyinUid,
      nickname: profile.nickname || "",
      avatarUrl: avatar,
      signature: profile.signature || "",
      followerCount: profile.follower_count || 0,
      category,
    })
    .returning()
    .get() as DouyinBlogger;

  return blogger;
}

export async function deleteBlogger(id: number): Promise<void> {
  db.delete(bloggers).where(eq(bloggers.id, id)).run();
}

