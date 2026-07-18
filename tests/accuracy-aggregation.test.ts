import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "./helpers/test-db";
import { bloggers, works, predictionItems } from "@/db/schema";
import { eq, and, ne, sql } from "drizzle-orm";

type JudgmentRow = { judgment: string };

let dbi: TestDb;
let seq = 0;

function seedBlogger(slug = "b1"): number {
  const r = dbi
    .insert(bloggers)
    .values({ slug, douyinUid: `uid-${slug}`, nickname: slug })
    .run();
  return Number(r.lastInsertRowid);
}

function seedWork(bloggerId: number, overrides: Partial<typeof works.$inferInsert> = {}): number {
  seq += 1;
  const r = dbi
    .insert(works)
    .values({
      awemeId: `aweme-ac-${seq}`,
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

function seedPrediction(workId: number, judgment: string) {
  dbi
    .insert(predictionItems)
    .values({
      workId,
      predictedContent: "预测内容",
      judgment: judgment as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      judgedAt: Math.floor(Date.now() / 1000),
    })
    .run();
}

/**
 * Simulates the accuracy calculation logic from bloggers route.ts:
 * - Filters prediction_items excluding not_applicable and not_yet
 * - accuracy = (correct + 0.5 * mostly_correct) / evaluable * 100
 */
function calculateAccuracy(bloggerId: number): number | null {
  const judgmentRows = dbi
    .select({ judgment: predictionItems.judgment })
    .from(predictionItems)
    .innerJoin(works, eq(predictionItems.workId, works.id))
    .where(
      and(
        eq(works.bloggerId, bloggerId),
        ne(predictionItems.judgment, "not_applicable"),
        ne(predictionItems.judgment, "not_yet"),
      ),
    )
    .all() as JudgmentRow[];

  if (judgmentRows.length === 0) return null;

  const correct = judgmentRows.filter((r) => r.judgment === "correct").length;
  const mostlyCorrect = judgmentRows.filter((r) => r.judgment === "mostly_correct").length;
  return Math.round(((correct + 0.5 * mostlyCorrect) / judgmentRows.length) * 100);
}

beforeEach(() => {
  dbi = createTestDb();
  seq = 0;
});

describe("accuracy aggregation formula", () => {
  it("(correct + 0.5 * mostly_correct) / evaluable — 标准场景", () => {
    const b = seedBlogger();
    const w1 = seedWork(b);
    const w2 = seedWork(b);
    const w3 = seedWork(b);
    const w4 = seedWork(b);
    const w5 = seedWork(b);
    const w6 = seedWork(b);
    const w7 = seedWork(b);
    const w8 = seedWork(b);

    // 4 correct
    seedPrediction(w1, "correct");
    seedPrediction(w2, "correct");
    seedPrediction(w3, "correct");
    seedPrediction(w4, "correct");
    // 2 mostly_correct
    seedPrediction(w5, "mostly_correct");
    seedPrediction(w6, "mostly_correct");
    // 2 incorrect
    seedPrediction(w7, "incorrect");
    seedPrediction(w8, "incorrect");

    // evaluable = 8, accuracy = (4 + 2*0.5) / 8 = 5/8 = 0.625 = 62.5%
    const accuracy = calculateAccuracy(b);
    expect(accuracy).toBe(63); // Math.round(62.5) = 63
  });

  it("全部 correct 则 100%", () => {
    const b = seedBlogger();
    const w = seedWork(b);
    seedPrediction(w, "correct");

    expect(calculateAccuracy(b)).toBe(100);
  });

  it("全部 mostly_correct 则 50%", () => {
    const b = seedBlogger();
    const w = seedWork(b);
    seedPrediction(w, "mostly_correct");

    expect(calculateAccuracy(b)).toBe(50);
  });

  it("全部 incorrect 则 0%", () => {
    const b = seedBlogger();
    const w = seedWork(b);
    seedPrediction(w, "incorrect");

    expect(calculateAccuracy(b)).toBe(0);
  });

  it("全部 not_yet → null（无可评判项）", () => {
    const b = seedBlogger();
    const w = seedWork(b);
    seedPrediction(w, "not_yet");

    expect(calculateAccuracy(b)).toBeNull();
  });

  it("全部 not_applicable → null（无可评判项）", () => {
    const b = seedBlogger();
    const w = seedWork(b);
    seedPrediction(w, "not_applicable");

    expect(calculateAccuracy(b)).toBeNull();
  });

  it("not_yet 和 not_applicable 不计入分母", () => {
    const b = seedBlogger();
    const w1 = seedWork(b);
    const w2 = seedWork(b);
    const w3 = seedWork(b);
    const w4 = seedWork(b);
    seedPrediction(w1, "correct");
    seedPrediction(w2, "not_yet");
    seedPrediction(w3, "not_applicable");
    seedPrediction(w4, "incorrect");

    // evaluable = 2 (correct + incorrect, excluding not_yet and not_applicable)
    // accuracy = (1 + 0) / 2 = 0.5 = 50%
    expect(calculateAccuracy(b)).toBe(50);
  });

  it("混合 mostly_correct 与 correct", () => {
    const b = seedBlogger();
    const w1 = seedWork(b);
    const w2 = seedWork(b);
    seedPrediction(w1, "correct");
    seedPrediction(w2, "mostly_correct");

    // evaluable = 2, accuracy = (1 + 0.5) / 2 = 0.75 = 75%
    expect(calculateAccuracy(b)).toBe(75);
  });

  it("无预测项返回 null", () => {
    const b = seedBlogger();
    seedWork(b);
    expect(calculateAccuracy(b)).toBeNull();
  });

  it("无作品返回 null", () => {
    const b = seedBlogger();
    expect(calculateAccuracy(b)).toBeNull();
  });
});
