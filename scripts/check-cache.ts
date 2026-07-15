// @ts-nocheck — pre-existing utility script, not part of app
import fs from "fs";
import path from "path";

// 检查 works 数据
import Database from "better-sqlite3";
const db = new Database(path.join(process.cwd(), "data", "douyin.db"));

// 看看有哪些作品是图集 vs 视频
const rows = db
  .prepare("SELECT id, aweme_id, video_url, cover_url, duration FROM works")
  .all();

console.log("=== 数据库现状 ===\n");
for (const r of rows) {
  const type = r.video_url ? "视频" : "图集（无 video_url）";
  console.log(`id=${r.id}  ${type}  duration=${r.duration}ms`);
  console.log(`  cover:  ${r.cover_url ? "✅ " + r.cover_url.substring(0, 80) : "❌ 无"}`);
  if (r.video_url) {
    console.log(`  video:  ${r.video_url.substring(0, 80)}...`);
  }
  console.log();
}

// 检查缓存
const cacheDir = path.join(process.cwd(), "data", "api-cache");
const files = fs.readdirSync(cacheDir);
console.log("=== API 缓存 ===");
for (const f of files) {
  const p = path.join(cacheDir, f);
  const data = JSON.parse(fs.readFileSync(p, "utf-8"));
  console.log(`\n📄 ${f}`);
  if (data.data?.aweme_list) {
    for (const a of data.data.aweme_list) {
      const mediaType = a.media_type === 2 ? "图集" : a.media_type === 4 ? "视频" : `type=${a.media_type}`;
      const hasVideo = !!a.video?.download_addr?.url_list?.[0];
      const hasCover = !!a.video?.cover?.url_list?.[0];
      const duration = a.duration || 0;
      console.log(`  ${a.aweme_id}  ${mediaType}  duration=${duration}ms`);
      if (a.video) {
        // 看看有哪些可用的 URL
        const urls: Record<string, string> = {};
        if (a.video.download_addr?.url_list?.[0]) urls["download"] = a.video.download_addr.url_list[0].substring(0, 80);
        if (a.video.play_addr?.url_list?.[0]) urls["play"] = a.video.play_addr.url_list[0].substring(0, 80);
        if (a.video.cover?.url_list?.[0]) urls["cover"] = a.video.cover.url_list[0].substring(0, 80);
        for (const [k, v] of Object.entries(urls)) {
          console.log(`    ${k}: ${v}...`);
        }
      }
      if (a.images) {
        console.log(`    images: ${a.images.length} 张, 封面=${a.images[0]?.url_list?.[0]?.substring(0, 80)}...`);
      }
    }
  }
}
db.close();
