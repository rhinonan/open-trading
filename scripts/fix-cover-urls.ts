// 用缓存数据修复现有作品的 cover_url
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// 从 url_list 中挑浏览器兼容的格式：优先 jpeg > webp > png > 其他
function pickCover(urlList: string[]): string {
  for (const ext of [".jpeg", ".jpg", ".png", ".webp"]) {
    const match = urlList.find((u) => u.includes(ext));
    if (match) return match;
  }
  return urlList[0] || "";
}

const db = new Database(path.join(process.cwd(), "data", "douyin.db"));

const cacheDir = path.join(process.cwd(), "data", "api-cache");
const files = fs.readdirSync(cacheDir).filter((f) => f.includes("post_videos"));
if (files.length === 0) { console.log("No cache found."); process.exit(0); }

const cache = JSON.parse(fs.readFileSync(path.join(cacheDir, files[0]), "utf-8"));

let updated = 0;
for (const a of cache.data.aweme_list) {
  const isImage = a.media_type === 2;
  const isVideo = a.media_type === 4;

  let coverUrl = "";
  if (isVideo) {
    // origin_cover 最后一项通常是 JPEG
    coverUrl = pickCover(a.video?.origin_cover?.url_list || []) ||
               pickCover(a.video?.cover?.url_list || []);
  } else if (isImage && a.images?.length) {
    coverUrl = pickCover(a.images[0].url_list || []);
  }
  if (!coverUrl) coverUrl = a.video?.cover?.url_list?.[0] || "";

  const result = db
    .prepare("UPDATE works SET cover_url = ? WHERE aweme_id = ?")
    .run(coverUrl, a.aweme_id);

  if (result.changes > 0) {
    const isJpeg = coverUrl.includes(".jpeg") ? "✅ JPEG" : "⚠️ HEIC";
    console.log(`${isJpeg}  ${a.aweme_id} → ${coverUrl.substring(0, 80)}...`);
    updated += result.changes;
  }
}

console.log(`\nUpdated ${updated} works`);
db.close();
