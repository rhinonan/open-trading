// tests/pipeline-runner.test.ts
import { describe, it, expect, vi } from "vitest";
import { createTestDb, type TestDb } from "./helpers/test-db";
import { bloggers, works } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createRunner } from "@/services/douyin/pipeline-runner";
import type { ClaimedWork } from "@/services/douyin/pipeline-queue";

let seq = 0;

function seedBlogger(dbi: TestDb): number {
  const r = dbi
    .insert(bloggers)
    .values({ slug: "b", douyinUid: "u", nickname: "n" })
    .run();
  return Number(r.lastInsertRowid);
}

function seedWork(
  dbi: TestDb,
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

function markDone(dbi: TestDb, id: number) {
  dbi
    .update(works)
    .set({ transcriptStatus: "done" })
    .where(eq(works.id, id))
    .run();
}

async function waitIdle(runner: { isRunning(): boolean }) {
  await vi.waitFor(() => expect(runner.isRunning()).toBe(false));
}

describe("createRunner", () => {
  it("kick 后清空全部 pending，并发不超上限", async () => {
    const dbi = createTestDb();
    const b = seedBlogger(dbi);
    for (let i = 0; i < 5; i++) seedWork(dbi, b);

    let active = 0;
    let maxActive = 0;
    const processed: number[] = [];
    const runner = createRunner({
      dbi,
      concurrency: 2,
      processWork: async (w: ClaimedWork) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        processed.push(w.id);
        markDone(dbi, w.id);
        active--;
        return { ok: true };
      },
    });

    runner.kick();
    expect(runner.isRunning()).toBe(true);
    await waitIdle(runner);

    expect(processed).toHaveLength(5);
    expect(new Set(processed).size).toBe(5); // 无重复处理
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("processWork 抛异常时该作品置 failed，其余继续", async () => {
    const dbi = createTestDb();
    const b = seedBlogger(dbi);
    const bad = seedWork(dbi, b, { scannedAt: 1 });
    const good = seedWork(dbi, b, { scannedAt: 2 });

    const runner = createRunner({
      dbi,
      concurrency: 1,
      processWork: async (w: ClaimedWork) => {
        if (w.id === bad) throw new Error("boom");
        markDone(dbi, w.id);
        return { ok: true };
      },
    });

    runner.kick();
    await waitIdle(runner);

    const badRow = dbi.select().from(works).where(eq(works.id, bad)).get()!;
    const goodRow = dbi.select().from(works).where(eq(works.id, good)).get()!;
    expect(badRow.transcriptStatus).toBe("failed");
    expect(goodRow.transcriptStatus).toBe("done");
  });

  it("运行中重复 kick 不会并行起第二个循环（无重复处理）", async () => {
    const dbi = createTestDb();
    const b = seedBlogger(dbi);
    for (let i = 0; i < 3; i++) seedWork(dbi, b);

    const processed: number[] = [];
    const runner = createRunner({
      dbi,
      concurrency: 1,
      processWork: async (w: ClaimedWork) => {
        processed.push(w.id);
        await new Promise((r) => setTimeout(r, 5));
        markDone(dbi, w.id);
        return { ok: true };
      },
    });

    runner.kick();
    runner.kick();
    runner.kick();
    await waitIdle(runner);
    expect(processed).toHaveLength(3);
    expect(new Set(processed).size).toBe(3);
  });

  it("空跑后可再次 kick 处理新任务", async () => {
    const dbi = createTestDb();
    const b = seedBlogger(dbi);
    const runner = createRunner({
      dbi,
      concurrency: 1,
      processWork: async (w: ClaimedWork) => { markDone(dbi, w.id); return { ok: true }; },
    });

    runner.kick();
    await waitIdle(runner);

    const w = seedWork(dbi, b);
    runner.kick();
    await waitIdle(runner);
    const row = dbi.select().from(works).where(eq(works.id, w)).get()!;
    expect(row.transcriptStatus).toBe("done");
  });

  it("last-microtask kick 不丢唤醒", async () => {
    const dbi = createTestDb();
    const b = seedBlogger(dbi);
    const runner = createRunner({
      dbi,
      concurrency: 1,
      processWork: async (w: ClaimedWork) => {
        if (w.id === 1) {
          // worker 完成后在 .finally() 触达前用 microtask 塞新任务
          queueMicrotask(() => {
            const w3 = seedWork(dbi, b);
            runner.kick();
          });
        }
        markDone(dbi, w.id);
        return { ok: true };
      },
    });

    // 放两条任务后 kick
    seedWork(dbi, b, { scannedAt: 1 });
    seedWork(dbi, b, { scannedAt: 2 });
    runner.kick();
    await vi.waitFor(() => expect(runner.isRunning()).toBe(false));

    // 全表 done
    const all = dbi.select().from(works).all();
    expect(all.every((r) => r.transcriptStatus === "done")).toBe(true);
    expect(all).toHaveLength(3); // 2 original + 1 injected
  });

  it("kick 时顺带恢复僵尸 processing", async () => {
    const dbi = createTestDb();
    const b = seedBlogger(dbi);
    const zombie = seedWork(dbi, b, {
      transcriptStatus: "processing",
      claimedAt: null, // 历史遗留卡死
    });

    const runner = createRunner({
      dbi,
      concurrency: 1,
      processWork: async (w: ClaimedWork) => { markDone(dbi, w.id); return { ok: true }; },
    });
    runner.kick();
    await waitIdle(runner);
    const row = dbi.select().from(works).where(eq(works.id, zombie)).get()!;
    expect(row.transcriptStatus).toBe("done");
  });
});
