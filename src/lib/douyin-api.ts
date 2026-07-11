// src/lib/douyin-api.ts

const TIKHUB_BASE = "https://api.tikhub.io";
const TIKHUB_API_KEY = process.env.TIKHUB_API_KEY || "";

async function tikHubFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${TIKHUB_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      "Authorization": `Bearer ${TIKHUB_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`TikHub API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface DouyinVideoData {
  aweme_id: string;
  desc: string;
  create_time: number;
  aweme_type: number;
  author: {
    nickname: string;
    unique_id: string;
    uid: string;
    sec_uid: string;
    signature: string;
    avatar_thumb: { url_list: string[] };
    avatar_medium: { url_list: string[] };
    avatar_larger: { url_list: string[] };
    follower_count: number;
    total_favorited: number;
    aweme_count: number;
  };
  video: {
    duration: number;
    cover: { url_list: string[] };
    play_addr: { url_list: string[] };
    download_addr: { url_list: string[] };
  };
  statistics: {
    admire_count: number;
    comment_count: number;
    digg_count: number;
    play_count: number;
    share_count: number;
    collect_count: number;
    download_count: number;
  };
  share_url: string;
  text_extra: Array<{
    hashtag_id: string;
    hashtag_name: string;
    type: number;
  }>;
}

export async function fetchUserPosts(
  secUid: string,
  count = 10
): Promise<DouyinVideoData[]> {
  try {
    const json = await tikHubFetch<any>(
      "/api/v1/douyin/app/v3/fetch_user_post",
      {
        method: "POST",
        body: JSON.stringify({ sec_uid: secUid, cursor: "0", count }),
      }
    );
    return json.data?.aweme_list ?? [];
  } catch {
    return [];
  }
}

export async function fetchOneVideo(
  awemeId: string
): Promise<DouyinVideoData | null> {
  try {
    const json = await tikHubFetch<any>(
      `/api/v1/douyin/app/v3/fetch_one_video?aweme_id=${awemeId}`
    );
    return json.data?.aweme_detail ?? null;
  } catch {
    return null;
  }
}

export async function fetchUserProfile(
  secUid: string
): Promise<{
  nickname: string;
  unique_id: string;
  uid: string;
  sec_uid: string;
  signature: string;
  avatar_thumb: { url_list: string[] };
  avatar_medium: { url_list: string[] };
  avatar_larger: { url_list: string[] };
  follower_count: number;
  total_favorited: number;
  aweme_count: number;
} | null> {
  try {
    const json = await tikHubFetch<any>(
      `/api/v1/douyin/app/v3/fetch_user_profile?sec_uid=${secUid}`
    );
    return json.data?.user ?? null;
  } catch {
    return null;
  }
}
