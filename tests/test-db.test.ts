// tests/test-db.test.ts
import { describe, it, expect } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { bloggers, works } from "@/db/schema";
import { sql } from "drizzle-orm";

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

  it("works 表有 claimedAt 列和查询索引", () => {
    const dbi = createTestDb();
    const r = dbi
      .insert(bloggers)
      .values({ slug: "s2", douyinUid: "u2", nickname: "n2" })
      .run();
    const bloggerId = Number(r.lastInsertRowid);
    dbi
      .insert(works)
      .values({ awemeId: "a2", bloggerId, publishedAt: 1, claimedAt: 123 })
      .run();
    const row = dbi.select().from(works).all()[0];
    expect(row.claimedAt).toBe(123);

    const idxRows = dbi.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'index'`
    );
    expect(idxRows.map((x) => x.name)).toEqual(
      expect.arrayContaining([
        "works_blogger_id_idx",
        "works_transcript_status_idx",
      ])
    );
  });
});
