// scripts/cleanup.ts
// 用法：npx tsx scripts/cleanup.ts
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(__dirname, "..", "data");
const RETENTION_MS =
  (parseInt(process.env.VIDEO_RETENTION_DAYS || "7", 10) || 7) *
  24 * 60 * 60 * 1000;

const dirsToCheck = ["videos", "audio"];

function cleanupDir(dirName: string): number {
  const dirPath = path.join(DATA_DIR, dirName);
  if (!fs.existsSync(dirPath)) {
    console.log(`[cleanup] ${dirName}/ does not exist, skip`);
    return 0;
  }

  const now = Date.now();
  const cutoff = now - RETENTION_MS;
  let deleted = 0;

  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.atimeMs < cutoff || stat.mtimeMs < cutoff) {
        fs.unlinkSync(fullPath);
        deleted++;
        console.log(`[cleanup] deleted ${fullPath}`);
      }
    } catch (err) {
      console.error(`[cleanup] error processing ${fullPath}:`, err);
    }
  }

  console.log(`[cleanup] ${dirName}/: deleted ${deleted} files`);
  return deleted;
}

let totalDeleted = 0;
for (const dir of dirsToCheck) {
  totalDeleted += cleanupDir(dir);
}
console.log(`[cleanup] done, total deleted: ${totalDeleted} files`);
