import Database from "better-sqlite3";
import path from "path";

const db = new Database(path.join(process.cwd(), "data", "douyin.db"));
const rows = db
  .prepare("SELECT id, aweme_id, video_url, cover_url, duration, transcript_status FROM works")
  .all();
for (const r of rows) console.log(JSON.stringify(r));
db.close();
