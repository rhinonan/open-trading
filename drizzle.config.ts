import path from "node:path";
import { defineConfig } from "drizzle-kit";

// 与 src/lib/data-root.ts 一致：DATA_ROOT 优先，否则 ./data
const dataRoot = process.env.DATA_ROOT || path.join(process.cwd(), "data");
const dbUrl = path.join(dataRoot, "douyin.db");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbUrl,
  },
});
