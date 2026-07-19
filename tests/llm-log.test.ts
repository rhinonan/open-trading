// tests/llm-log.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { llmLog, llmLogError, startTimer } from "@/lib/llm-log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("llmLog", () => {
  it("输出一行 JSON，含 ts/level/event 与业务字段", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    llmLog("info", {
      event: "workflow.run.start",
      runId: "r1",
      workId: 42,
      awemeId: "aweme-x",
      workflowId: "transcribeWorkWorkflow",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    const obj = JSON.parse(line);
    expect(obj.level).toBe("info");
    expect(obj.event).toBe("workflow.run.start");
    expect(obj.runId).toBe("r1");
    expect(obj.workId).toBe(42);
    expect(obj.awemeId).toBe("aweme-x");
    expect(typeof obj.ts).toBe("string");
  });

  it("error 级走 console.error，并序列化 Error.message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    llmLogError({
      event: "workflow.run.failed",
      workId: 1,
      error: new Error("boom"),
    });
    const obj = JSON.parse(spy.mock.calls[0][0] as string);
    expect(obj.level).toBe("error");
    expect(obj.error).toBe("boom");
  });

  it("剥离疑似密钥字段", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    llmLog("info", {
      event: "model.resolve",
      model: "gpt-x",
      apiKey: "sk-secret",
      NEWAPI_API_KEY: "nope",
    } as never);
    const obj = JSON.parse(spy.mock.calls[0][0] as string);
    expect(obj.model).toBe("gpt-x");
    expect(obj.apiKey).toBeUndefined();
    expect(obj.NEWAPI_API_KEY).toBeUndefined();
  });

  it("startTimer 返回非负毫秒", async () => {
    const t = startTimer();
    await new Promise((r) => setTimeout(r, 5));
    expect(t.elapsedMs()).toBeGreaterThanOrEqual(0);
  });
});
