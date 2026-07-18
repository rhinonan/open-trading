import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { dataPath } from "@/lib/data-root";

const DB_PATH = dataPath("douyin.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// 供服务层做依赖注入（测试传内存库）
export type Db = typeof db;
