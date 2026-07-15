// src/lib/douyin-api.ts
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const TIKHUB_BASE = process.env.TIKHUB_BASE || "https://api.tikhub.io";
const TIKHUB_API_KEY = process.env.TIKHUB_API_KEY || "";
const CACHE_DIR = path.join(process.cwd(), "data", "api-cache");
const CACHE_MODE = process.env.DOUYIN_CACHE_MODE === "true";

function cacheKey(endpoint: string, options?: RequestInit): string {
  const raw = endpoint + (options?.body ? "_" + String(options.body) : "");
  const hash = crypto.createHash("md5").update(raw).digest("hex").slice(0, 12);
  // Sanitize endpoint into a readable filename prefix
  const prefix = endpoint
    .replace(/^\/api\/v1\/douyin\/app\/v3\//, "")
    .replace(/[?&]/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 60);
  return `${prefix}_${hash}.json`;
}

function readCache(filename: string): string | null {
  if (!CACHE_MODE) return null;
  const filepath = path.join(CACHE_DIR, filename);
  try {
    return fs.readFileSync(filepath, "utf-8");
  } catch {
    return null;
  }
}

function writeCache(filename: string, raw: string): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(path.join(CACHE_DIR, filename), raw, "utf-8");
}

async function tikHubFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const filename = cacheKey(endpoint, options);

  // 优先读缓存
  const cached = readCache(filename);
  if (cached !== null) {
    return JSON.parse(cached) as T;
  }

  // 调 API
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

  const raw = await res.text();

  // 原始响应落盘
  writeCache(filename, raw);

  return JSON.parse(raw) as T;
}

export interface DouyinVideoData {
  aweme_id: string;
  desc: string;
  create_time: number;
  aweme_type: number;
  media_type: number; // 2=图集, 4=视频
  is_top?: number; // 1=置顶作品（可能是很早的作品，扫描时不作为截止判断依据）
  images?: Array<{
    url_list: string[];
    width: number;
    height: number;
  }>;
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

export interface FetchPostsResult {
  awemeList: DouyinVideoData[];
  nextCursor: number;
  hasMore: boolean;
}

export async function fetchUserPosts(
  secUid: string,
  maxCursor = 0,
  count = 20
): Promise<FetchPostsResult> {
  try {
    const json = await tikHubFetch<any>(
      `/api/v1/douyin/app/v3/fetch_user_post_videos?sec_user_id=${encodeURIComponent(secUid)}&max_cursor=${maxCursor}&count=${count}`
    );
    return {
      awemeList: json.data?.aweme_list ?? [],
      nextCursor: json.data?.max_cursor ?? 0,
      hasMore: json.data?.has_more ?? false,
    };
  } catch {
    return { awemeList: [], nextCursor: 0, hasMore: false };
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
      `/api/v1/douyin/app/v3/handler_user_profile?sec_user_id=${encodeURIComponent(secUid)}`
    );
    return json.data?.user ?? null;
  } catch {
    return null;
  }
}
