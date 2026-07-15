import fs from "fs";
import path from "path";

const cacheDir = path.join(process.cwd(), "data", "api-cache");
const files = fs.readdirSync(cacheDir);
for (const f of files) {
  if (!f.includes("post_videos")) continue;
  const data = JSON.parse(fs.readFileSync(path.join(cacheDir, f), "utf-8"));
  for (const a of data.data.aweme_list) {
    if (a.media_type !== 4) continue;
    console.log(`=== ID=${a.aweme_id} ===`);
    const v = a.video;
    console.log(`  origin_cover: ${(v.origin_cover?.url_list || []).join("\n                ")}`);
    console.log(`  cover:        ${(v.cover?.url_list || []).join("\n                ")}`);
    console.log(`  dynamic_cover:${(v.dynamic_cover?.url_list || []).slice(0, 1).join("\n                ")}`);
    console.log();
  }
}
