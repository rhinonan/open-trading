import { createHash } from "crypto";
import { db } from "@/db";
import { bloggers } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { fetchUserProfile } from "@/lib/douyin-api";
import type { DouyinBlogger } from "@/types";

function computeSlug(douyinUid: string): string {
  return createHash("sha256").update(douyinUid).digest("hex").slice(0, 12);
}

export async function listBloggers(): Promise<DouyinBlogger[]> {
  return db
    .select()
    .from(bloggers)
    .orderBy(desc(bloggers.followerCount))
    .all();
}

export async function listEnabledBloggers(): Promise<DouyinBlogger[]> {
  return db
    .select()
    .from(bloggers)
    .where(eq(bloggers.disabled, 0))
    .orderBy(desc(bloggers.followerCount))
    .all();
}

export async function setBloggerDisabled(
  slug: string,
  disabled: boolean
): Promise<DouyinBlogger> {
  const updated = db
    .update(bloggers)
    .set({
      disabled: disabled ? 1 : 0,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(bloggers.slug, slug))
    .returning()
    .get();
  if (!updated) throw new Error(`博主 ${slug} 不存在`);
  return updated;
}

export async function getBloggerBySlug(
  slug: string
): Promise<DouyinBlogger | null> {
  const result = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.slug, slug))
    .get();
  return result ?? null;
}

export async function addBlogger(douyinUid: string): Promise<DouyinBlogger> {
  const existing = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.douyinUid, douyinUid))
    .get();
  if (existing) {
    throw new Error(`博主 ${douyinUid} 已存在`);
  }

  const profile = await fetchUserProfile(douyinUid);
  if (!profile) {
    throw new Error(`无法获取博主 ${douyinUid} 的信息，请检查 ID 是否正确`);
  }

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
      slug: computeSlug(douyinUid),
      douyinUid: douyinUid,
      nickname: profile.nickname || "",
      avatarUrl: avatar,
      signature: profile.signature || "",
      followerCount: profile.follower_count || 0,
    })
    .returning()
    .get();

  return blogger;
}

export async function deleteBlogger(id: number): Promise<void> {
  db.delete(bloggers).where(eq(bloggers.id, id)).run();
}

export async function updateBloggerProfile(
  slug: string
): Promise<DouyinBlogger> {
  const blogger = db
    .select()
    .from(bloggers)
    .where(eq(bloggers.slug, slug))
    .get();
  if (!blogger) throw new Error(`博主 ${slug} 不存在`);

  const profile = await fetchUserProfile(blogger.douyinUid);
  if (!profile) throw new Error(`无法获取博主 ${blogger.douyinUid} 的信息`);

  const pickAvatarUrl = (urls?: string[]): string => {
    if (!urls?.length) return "";
    return urls.find((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u)) || urls[0];
  };
  const avatar =
    pickAvatarUrl(profile.avatar_medium?.url_list) ||
    pickAvatarUrl(profile.avatar_thumb?.url_list) ||
    "";

  const updated = db
    .update(bloggers)
    .set({
      nickname: profile.nickname || "",
      avatarUrl: avatar,
      signature: profile.signature || "",
      followerCount: profile.follower_count || 0,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(bloggers.slug, slug))
    .returning()
    .get();
  if (!updated) throw new Error(`博主 ${slug} 更新失败`);

  return updated;
}
