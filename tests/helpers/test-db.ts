// tests/helpers/test-db.ts
// 内存 SQLite + 全量 drizzle 迁移，供单元测试使用。
// 迁移文件天然覆盖 schema 变更（含后续新增列/索引），无需手写 DDL。
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import fs from "node:fs";
import path from "node:path";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  const dir = path.join(process.cwd(), "drizzle");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), "utf-8");
    // drizzle-kit 用 "--> statement-breakpoint" 分隔多条语句
    for (const stmt of raw.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }

  return drizzle(sqlite, { schema });
}

export type TestDb = ReturnType<typeof createTestDb>;
