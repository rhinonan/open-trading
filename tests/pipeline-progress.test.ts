// tests/pipeline-progress.test.ts
import { describe, it, expect } from "vitest";
import { createTestDb } from "./helpers/test-db";
import { bloggers, works } from "@/db/schema";
import {
  setWorkProgress,
  markWorkQueued,
  markWorkDone,
  stageLabel,
} from "@/services/douyin/pipeline-progress";
import { eq } from "drizzle-orm";

describe("pipeline-progress", () => {
  it("stageLabel 返回中文", () => {
    expect(stageLabel("download_video")).toBe("下载视频");
    expect(stageLabel("asr_poll")).toBe("识别中");
  });

  it("写入 pipeline 字段", async () => {
    const dbi = createTestDb();
    dbi
      .insert(bloggers)
      .values({ slug: "s", douyinUid: "u", nickname: "n" })
      .run();
    const b = dbi.select().from(bloggers).get()!;
    dbi
      .insert(works)
      .values({ awemeId: "a1", bloggerId: b.id, publishedAt: 1 })
      .run();
    const w = dbi.select().from(works).get()!;

    await markWorkQueued(w.id, dbi);
    let row = dbi.select().from(works).where(eq(works.id, w.id)).get()!;
    expect(row.transcriptStatus).toBe("pending");
    expect(row.pipelineStage).toBe("queued");
    expect(row.pipelineProgress).toBe(0);

    await setWorkProgress(w.id, "download_video", 15, { dbi });
    row = dbi.select().from(works).where(eq(works.id, w.id)).get()!;
    expect(row.pipelineStage).toBe("download_video");
    expect(row.pipelineProgress).toBe(15);
    expect(row.pipelineStageLabel).toBe("下载视频");

    await markWorkDone(w.id, { transcript: "hello", opinionSummary: "观点" }, dbi);
    row = dbi.select().from(works).where(eq(works.id, w.id)).get()!;
    expect(row.transcriptStatus).toBe("done");
    expect(row.pipelineProgress).toBe(100);
    expect(row.transcript).toBe("hello");
  });
});
