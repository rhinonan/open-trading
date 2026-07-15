import { createHash } from "crypto";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "douyin.db");
const db = new Database(DB_PATH);

function computeSlug(douyinUid: string): string {
  return createHash("sha256").update(douyinUid).digest("hex").slice(0, 12);
}

const bloggers = db.prepare("SELECT id, douyin_uid, slug FROM bloggers").all() as Array<{
  id: number;
  douyin_uid: string;
  slug: string;
}>;

const update = db.prepare("UPDATE bloggers SET slug = ? WHERE id = ?");

for (const b of bloggers) {
  if (!b.slug) {
    update.run(computeSlug(b.douyin_uid), b.id);
    console.log(`Updated blogger ${b.id}: slug=${computeSlug(b.douyin_uid)}`);
  }
}

console.log("Done.");
