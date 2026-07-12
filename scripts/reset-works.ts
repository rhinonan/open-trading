import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "douyin.db");
const db = new Database(dbPath);

const result = db
  .prepare(
    "UPDATE works SET transcript_status = 'pending', transcript = NULL WHERE transcript_status != 'pending'"
  )
  .run();
console.log("Reset", result.changes, "works to pending");
db.close();
