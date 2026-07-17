// tests/pipeline-queue.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "./helpers/test-db";
import { bloggers, works } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  claimNextPending,
  recoverStaleProcessing,
  resetFailedForBlogger,
  enqueueWork,
  countByStatus,
  markWorkFailed,
  STALE_CLAIM_SECONDS,
} from "@/services/douyin/pipeline-queue";

let dbi: TestDb;
let seq = 0;

function seedBlogger(slug = "b1"): number {
  const r = dbi
    .insert(bloggers)
    .values({ slug, douyinUid: `uid-${slug}`, nickname: slug })
    .run();
  return Number(r.lastInsertRowid);
}

function seedWork(
  bloggerId: number,
  overrides: Partial<typeof works.$inferInsert> = {}
): number {
  seq += 1;
  const r = dbi
    .insert(works)
    .values({
      awemeId: `aweme-${seq}`,
      bloggerId,
      videoUrl: "https://example.com/v.mp4",
      publishedAt: 1000 + seq,
      scannedAt: 1000 + seq,
      ...overrides,
    })
    .run();
  return Number(r.lastInsertRowid);
}

function getWork(id: number) {
  return dbi.select().from(works).where(eq(works.id, id)).get()!;
}

beforeEach(() => {
  dbi = createTestDb();
  seq = 0;
});

describe("claimNextPending", () => {
  it("按 scannedAt 升序认领最早的 pending，置 processing 并记录 claimedAt", () => {
    const b = seedBlogger();
    const w1 = seedWork(b, { scannedAt: 100 });
    seedWork(b, { scannedAt: 200 });
    const claimed = claimNextPending(dbi, 5000);
    expect(claimed?.id).toBe(w1);
    const row = getWork(w1);
    expect(row.transcriptStatus).toBe("processing");
    expect(row.claimedAt).toBe(5000);
  });

  it("没有 pending 时返回 null", () => {
    const b = seedBlogger();
    seedWork(b, { transcriptStatus: "done" });
    seedWork(b, { transcriptStatus: "processing" });
    seedWork(b, { transcriptStatus: "failed" });
    expect(claimNextPending(dbi, 5000)).toBeNull();
  });

  it("连续认领互不重复，认领完返回 null", () => {
    const b = seedBlogger();
    seedWork(b);
    seedWork(b);
    const a = claimNextPending(dbi, 5000);
    const c = claimNextPending(dbi, 5000);
    expect(a!.id).not.toBe(c!.id);
    expect(claimNextPending(dbi, 5000)).toBeNull();
  });
});

describe("recoverStaleProcessing", () => {
  it("重置超时与无 claimedAt 的 processing，保留新鲜的", () => {
    const b = seedBlogger();
    const now = 100_000;
    const stale = seedWork(b, {
      transcriptStatus: "processing",
      claimedAt: now - STALE_CLAIM_SECONDS - 1,
    });
    const legacy = seedWork(b, {
      transcriptStatus: "processing",
      claimedAt: null,
    });
    const fresh = seedWork(b, {
      transcriptStatus: "processing",
      claimedAt: now - 60,
    });
    const n = recoverStaleProcessing(dbi, now);
    expect(n).toBe(2);
    expect(getWork(stale).transcriptStatus).toBe("pending");
    expect(getWork(stale).claimedAt).toBeNull();
    expect(getWork(legacy).transcriptStatus).toBe("pending");
    expect(getWork(fresh).transcriptStatus).toBe("processing");
  });
});

describe("resetFailedForBlogger", () => {
  it("只重置指定博主的 failed", () => {
    const b1 = seedBlogger("b1");
    const b2 = seedBlogger("b2");
    const f1 = seedWork(b1, { transcriptStatus: "failed" });
    const f2 = seedWork(b2, { transcriptStatus: "failed" });
    const d1 = seedWork(b1, { transcriptStatus: "done" });
    const n = resetFailedForBlogger(b1, dbi);
    expect(n).toBe(1);
    expect(getWork(f1).transcriptStatus).toBe("pending");
    expect(getWork(f2).transcriptStatus).toBe("failed");
    expect(getWork(d1).transcriptStatus).toBe("done");
  });
});

describe("enqueueWork", () => {
  it("作品不存在", () => {
    expect(enqueueWork(999, dbi)).toEqual({
      queued: false,
      reason: "作品不存在",
    });
  });

  it("没有视频链接", () => {
    const b = seedBlogger();
    const w = seedWork(b, { videoUrl: null });
    expect(enqueueWork(w, dbi)).toEqual({
      queued: false,
      reason: "该作品没有视频链接",
    });
  });

  it("正在转写中不重复入队", () => {
    const b = seedBlogger();
    const w = seedWork(b, { transcriptStatus: "processing" });
    expect(enqueueWork(w, dbi)).toEqual({
      queued: false,
      reason: "该作品正在转写中",
    });
  });

  it("failed / done / pending 都可入队（重转语义）", () => {
    const b = seedBlogger();
    for (const status of ["failed", "done", "pending"] as const) {
      const w = seedWork(b, { transcriptStatus: status, claimedAt: 42 });
      expect(enqueueWork(w, dbi)).toEqual({ queued: true });
      expect(getWork(w).transcriptStatus).toBe("pending");
      expect(getWork(w).claimedAt).toBeNull();
    }
  });
});

describe("countByStatus / markWorkFailed", () => {
  it("按状态与博主统计", () => {
    const b1 = seedBlogger("b1");
    const b2 = seedBlogger("b2");
    seedWork(b1);
    seedWork(b1, { transcriptStatus: "processing" });
    seedWork(b2);
    expect(countByStatus("pending", undefined, dbi)).toBe(2);
    expect(countByStatus("pending", b1, dbi)).toBe(1);
    expect(countByStatus("processing", b1, dbi)).toBe(1);
  });

  it("markWorkFailed 置 failed", () => {
    const b = seedBlogger();
    const w = seedWork(b, { transcriptStatus: "processing" });
    markWorkFailed(w, dbi);
    expect(getWork(w).transcriptStatus).toBe("failed");
  });
});
