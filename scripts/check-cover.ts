// @ts-nocheck — pre-existing utility script, not part of app
import fs from "fs";
import path from "path";

const cacheDir = path.join(process.cwd(), "data", "api-cache");
const files = fs.readdirSync(cacheDir);

for (const f of files) {
  if (!f.includes("post_videos")) continue;
  const data = JSON.parse(fs.readFileSync(path.join(cacheDir, f), "utf-8"));

  // 只看一个视频作品，查看 video 对象有哪些字段
  for (const a of data.data.aweme_list) {
    if (a.media_type === 4) {
      // 视频类型 — 检查 video 对象的所有字段
      console.log("=== aweme_id:", a.aweme_id, "===");
      if (a.video) {
        for (const [k, v] of Object.entries(a.video)) {
          if (k.includes("cover") || k.includes("origin") || k.includes("dynamic") || k.includes("ai")) {
            if (typeof v === "object" && v?.url_list) {
              console.log(`  ${k}.url_list:`, (v.url_list as string[]).map((u: string) => u.substring(0, 100)));
            } else if (typeof v === "object") {
              console.log(`  ${k}:`, JSON.stringify(v).substring(0, 200));
            } else {
              console.log(`  ${k}:`, v);
            }
          }
        }
        // Also check play_addr and download_addr for more URL variants
        if (a.video.play_addr?.url_list) {
          console.log(`  play_addr.url_list[0]:`, (a.video.play_addr.url_list[0] as string).substring(0, 120));
        }
      }
      console.log();
      break; // 只检查一个
    }
  }
  // 同时检查一个图集作品
  for (const a of data.data.aweme_list) {
    if (a.media_type === 2) {
      console.log("=== 图集 aweme_id:", a.aweme_id, "===");
      if (a.images?.[0]) {
        console.log(`  images[0].url_list count:`, a.images[0].url_list?.length);
        if (a.images[0].url_list) {
          (a.images[0].url_list as string[]).forEach((u: string, i: number) => {
            console.log(`  images[0].url_list[${i}]:`, u.substring(0, 150));
          });
        }
      }
      break;
    }
  }
  break;
}
