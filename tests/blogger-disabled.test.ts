// tests/blogger-disabled.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { bloggers } from "@/db/schema";

// 注意：blogger-service 绑全局 db。本测试先直接验证 schema/迁移列存在；
// setBloggerDisabled 的完整测可在 service 注入 dbi 后补，或测 SQL 层。

describe("bloggers.disabled column", () => {
  it("迁移后可插入 disabled=1", () => {
    const db = createTestDb();
    const row = db
      .insert(bloggers)
      .values({
        slug: "abc123abc123",
        douyinUid: "uid-1",
        nickname: "测试",
        disabled: 1,
      })
      .returning()
      .get();
    expect(row.disabled).toBe(1);
  });
});
