// src/lib/douyin-api.ts

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

export interface DouyinApiResponse {
  code: number;
  data: {
    status_code: number;
    aweme_detail: DouyinVideoData;
  };
}

const DOUYIN_API_BASE =
  process.env.DOUYIN_API_BASE || "http://localhost:8000/api/douyin";

export async function fetchDouyinVideo(
  awemeId: string
): Promise<DouyinVideoData | null> {
  const url = `${DOUYIN_API_BASE}/web/fetch_one_video?aweme_id=${awemeId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json: DouyinApiResponse = await res.json();
  if (json.code !== 200 || json.data.status_code !== 0) return null;
  return json.data.aweme_detail;
}

export async function fetchDouyinUserPosts(
  secUid: string,
  maxCount = 20
): Promise<DouyinVideoData[]> {
  const url = `${DOUYIN_API_BASE}/web/fetch_user_post?sec_uid=${secUid}&max_cursor=0&count=${maxCount}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  if (json.code !== 200 || !json.data?.aweme_list) return [];
  return json.data.aweme_list as DouyinVideoData[];
}
