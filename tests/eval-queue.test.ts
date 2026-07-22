import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "./helpers/test-db";
import { bloggers, works } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  claimNextEval,
  recoverStaleEval,
  markEvalFailed,
  enqueueForEvaluation,
  getEvalProgress,
  EVAL_STALE_SECONDS,
} from "@/services/douyin/eval-queue";

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
  overrides: Partial<typeof works.$inferInsert> = {},
): number {
  seq += 1;
  const r = dbi
    .insert(works)
    .values({
      awemeId: `aweme-eq-${seq}`,
      bloggerId,
      videoUrl: "https://example.com/v.mp4",
      transcriptStatus: "done",
      transcript: "测试转录文本",
      opinionSummary: "测试观点",
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

describe("enqueueForEvaluation", () => {
  it("将 transcript=done 且 evalStatus=none 的作品入队为 pending", () => {
    const b = seedBlogger();
    const w = seedWork(b, { evalStatus: "none" });
    const count = enqueueForEvaluation({}, dbi);
    expect(count).toBe(1);
    expect(getWork(w).evalStatus).toBe("pending");
  });

  it("跳过已评判、转写中、失败转写的作品", () => {
    const b = seedBlogger();
    seedWork(b, { evalStatus: "done" });
    seedWork(b, { evalStatus: "processing" });
    seedWork(b, { transcriptStatus: "pending", evalStatus: "none" });
    const count = enqueueForEvaluation({}, dbi);
    expect(count).toBe(0);
  });

  it("按 bloggerId 过滤", () => {
    const b1 = seedBlogger("b1");
    const b2 = seedBlogger("b2");
    seedWork(b1, { evalStatus: "none" });
    seedWork(b2, { evalStatus: "none" });
    const count = enqueueForEvaluation({ bloggerId: b1 }, dbi);
    expect(count).toBe(1);
    // b2 should still be none
    const b2Works = dbi
      .select()
      .from(works)
      .where(eq(works.bloggerId, b2))
      .all();
    expect(b2Works.every((w) => w.evalStatus === "none")).toBe(true);
  });
});

describe("claimNextEval", () => {
  it("原子认领 — 两次并发调用拿走不同作品", () => {
    const b = seedBlogger();
    enqueueForEvaluation({}, dbi);
    seedWork(b, { evalStatus: "none" });
    // Manually set one to pending
    dbi
      .update(works)
      .set({ evalStatus: "pending" })
      .where(eq(works.evalStatus, "none"))
      .run();

    const a = claimNextEval(dbi, 5000);
    const c = claimNextEval(dbi, 5000);
    expect(a).not.toBeNull();
    expect(c).toBeNull(); // Only one work was pending
    expect(a!.id).toBeGreaterThan(0);
    expect(getWork(a!.id).evalStatus).toBe("processing");
    expect(getWork(a!.id).evalClaimedAt).toBe(5000);
  });

  it("连续认领互不重复，认领完返回 null", () => {
    const b = seedBlogger();
    // Add 2 eligible works
    const w1 = seedWork(b, { evalStatus: "none" });
    const w2 = seedWork(b, { evalStatus: "none" });
    enqueueForEvaluation({}, dbi);
    expect(getWork(w1).evalStatus).toBe("pending");
    expect(getWork(w2).evalStatus).toBe("pending");

    const a = claimNextEval(dbi, 6000);
    const c = claimNextEval(dbi, 6000);
    expect(a!.id).not.toBe(c!.id);
    expect(getWork(a!.id).evalStatus).toBe("processing");
    expect(getWork(c!.id).evalStatus).toBe("processing");
    expect(claimNextEval(dbi, 6000)).toBeNull();
  });

  it("空队列返回 null", () => {
    const b = seedBlogger();
    seedWork(b, { evalStatus: "done" });
    seedWork(b, { evalStatus: "none" });
    expect(claimNextEval(dbi, 5000)).toBeNull();
  });
});

describe("recoverStaleEval", () => {
  it("重置超时与无 evalClaimedAt 的 processing，保留新鲜的", () => {
    const b = seedBlogger();
    const now = 100_000;
    const stale = seedWork(b, {
      evalStatus: "processing",
      evalClaimedAt: now - EVAL_STALE_SECONDS - 1,
    });
    const legacy = seedWork(b, {
      evalStatus: "processing",
      evalClaimedAt: null,
    });
    const fresh = seedWork(b, {
      evalStatus: "processing",
      evalClaimedAt: now - 60,
    });
    const n = recoverStaleEval(dbi, now);
    expect(n).toBe(2);
    expect(getWork(stale).evalStatus).toBe("pending");
    expect(getWork(legacy).evalStatus).toBe("pending");
    expect(getWork(fresh).evalStatus).toBe("processing");
  });

  it("无超时行返回 0", () => {
    const b = seedBlogger();
    seedWork(b, { evalStatus: "processing", evalClaimedAt: Date.now() / 1000 });
    expect(recoverStaleEval(dbi, Date.now() / 1000)).toBe(0);
  });
});

describe("markEvalFailed", () => {
  it("将 processing 置为 failed", () => {
    const b = seedBlogger();
    const w = seedWork(b, { evalStatus: "processing" });
    markEvalFailed(w, undefined, dbi);
    expect(getWork(w).evalStatus).toBe("failed");
  });
});

describe("getEvalProgress", () => {
  it("返回各状态计数", () => {
    const b = seedBlogger();
    seedWork(b, { evalStatus: "none" });
    seedWork(b, { evalStatus: "pending" });
    seedWork(b, { evalStatus: "processing" });
    seedWork(b, { evalStatus: "done" });
    seedWork(b, { evalStatus: "failed" });
    // 5th work: transcript not done, should not count
    seq += 1;
    dbi
      .insert(works)
      .values({
        awemeId: `aweme-eq-${seq}`,
        bloggerId: b,
        videoUrl: "https://example.com/v.mp4",
        transcriptStatus: "pending",
        publishedAt: 1000 + seq,
        scannedAt: 1000 + seq,
      })
      .run();

    const progress = getEvalProgress(dbi);
    expect(progress.none).toBe(1);
    expect(progress.pending).toBe(1);
    expect(progress.processing).toBe(1);
    expect(progress.done).toBe(1);
    expect(progress.failed).toBe(1);
    expect(progress.total).toBe(5);
  });
});
