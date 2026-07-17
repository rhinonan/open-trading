// tests/test-db.test.ts
import { describe, it, expect } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { bloggers, works } from "@/db/schema";

describe("test-db helper", () => {
  it("从 drizzle 迁移文件构建出可用的内存库", () => {
    const dbi = createTestDb();
    const r = dbi
      .insert(bloggers)
      .values({ slug: "s", douyinUid: "u", nickname: "n" })
      .run();
    const bloggerId = Number(r.lastInsertRowid);
    dbi.insert(works).values({ awemeId: "a1", bloggerId, publishedAt: 1 }).run();
    const rows = dbi.select().from(works).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].transcriptStatus).toBe("pending");
  });
});
