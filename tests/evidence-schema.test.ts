// tests/evidence-schema.test.ts
// P0-3：evidence schema 收紧 + 旧数据兼容
import { describe, it, expect } from "vitest";
import { evidenceSchema } from "@/mastra/workflows/evaluate-work-workflow";

describe("evidenceSchema", () => {
  it("接受明确字段", () => {
    const parsed = evidenceSchema.parse({
      symbol: "000001",
      rangeStart: "2026-06-01",
      rangeEnd: "2026-06-10",
      openPrice: 3100.5,
      closePrice: 3200.1,
      changePercent: 3.2,
      source: "tencent",
      fetchedAt: "2026-07-19T10:00:00Z",
      notes: "ok",
    });
    expect(parsed.symbol).toBe("000001");
    expect(parsed.changePercent).toBe(3.2);
  });

  it("允许有限扩展字段（catchall）", () => {
    const parsed = evidenceSchema.parse({
      symbol: "上证指数",
      customMetric: 1.23,
      nested: { a: 1 },
    });
    expect(parsed.customMetric).toBe(1.23);
    expect(parsed.nested).toEqual({ a: 1 });
  });

  it("空对象可通过（兼容旧/稀疏 evidence）", () => {
    expect(evidenceSchema.parse({})).toEqual({});
  });

  it("展示侧：非法 JSON 字符串不炸——调用方应 try/catch", () => {
    // 模拟 EvalDetailPanel：evidence 存的是 JSON 文本，直接展示原文
    const raw = "not-json{{{";
    let display = raw;
    try {
      display = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      display = raw; // 降级
    }
    expect(display).toBe(raw);
  });
});
