// tests/market-tools.test.ts
// Typed tools 契约：mock fetch，不打外网
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getStockQuoteTool,
  getIndexKlineTool,
  getSectorRankTool,
} from "@/mastra/tools/market-tools";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getStockQuoteTool", () => {
  it("execute 解析腾讯响应为 quotes 数组", async () => {
    const vals = Array.from({ length: 53 }, () => "");
    vals[1] = "平安银行";
    vals[3] = "12.5";
    vals[4] = "12.0";
    vals[5] = "12.1";
    vals[31] = "0.5";
    vals[32] = "4.17";
    vals[33] = "12.6";
    vals[34] = "12.0";
    const body = `v_sz000001="${vals.join("~")}";`;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(body).buffer,
      })),
    );

    const result = await getStockQuoteTool.execute!(
      { symbols: ["000001"] },
      {} as never,
    );
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0]).toMatchObject({
      symbol: "000001",
      name: "平安银行",
      price: 12.5,
      changePercent: 4.17,
      source: "tencent",
    });
  });
});

describe("getIndexKlineTool", () => {
  it("execute 返回 bars", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            klines: [
              "2026-06-01,3100,3120,3130,3090,1,1,0,0.6,20,0",
            ],
          },
        }),
      })),
    );

    const result = await getIndexKlineTool.execute!(
      { symbol: "sh000001", beg: "2026-06-01", end: "2026-06-02" },
      {} as never,
    );
    expect(result.bars).toHaveLength(1);
    expect(result.bars[0]).toMatchObject({
      symbol: "000001",
      date: "2026-06-01",
      open: 3100,
      close: 3120,
      source: "eastmoney",
    });
  });
});

describe("getSectorRankTool", () => {
  it("execute 返回 top/bottom", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            diff: [
              { f12: "BK1", f14: "半导体", f3: 5, f104: 10, f105: 2, f140: "A", f136: 1 },
              { f12: "BK2", f14: "银行", f3: -1, f104: 1, f105: 8, f140: "B", f136: -0.5 },
            ],
          },
        }),
      })),
    );

    const result = await getSectorRankTool.execute!({ topN: 1 }, {} as never);
    expect(result.total).toBe(2);
    expect(result.top[0].name).toBe("半导体");
    expect(result.bottom[0].name).toBe("银行");
    expect(result.source).toBe("eastmoney");
  });
});
