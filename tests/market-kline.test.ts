// tests/market-kline.test.ts
// 东财日 K 解析 + secid 映射（纯函数）
import { describe, it, expect } from "vitest";
import {
  toEastmoneySecid,
  parseEastmoneyKlineBody,
} from "@/lib/market/eastmoney-kline";

describe("toEastmoneySecid", () => {
  it("上证 6 开头 / sh 前缀 → 1.xxxxxx", () => {
    expect(toEastmoneySecid("600519")).toBe("1.600519");
    expect(toEastmoneySecid("sh000001")).toBe("1.000001");
  });

  it("深市 0/3 开头 / sz 前缀 → 0.xxxxxx", () => {
    expect(toEastmoneySecid("000001")).toBe("0.000001");
    expect(toEastmoneySecid("sz399006")).toBe("0.399006");
    expect(toEastmoneySecid("300750")).toBe("0.300750");
  });
});

describe("parseEastmoneyKlineBody", () => {
  it("解析 klines 字符串数组为日 K 行", () => {
    const body = {
      data: {
        code: "000001",
        klines: [
          "2026-06-01,3100.5,3120.0,3130.0,3090.0,100000,1.2e10,0.63,0.5,10.0,1.0",
          "2026-06-02,3120.0,3150.5,3160.0,3110.0,110000,1.3e10,0.98,1.0,12.0,1.1",
        ],
      },
    };
    const bars = parseEastmoneyKlineBody(body, "000001");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toMatchObject({
      symbol: "000001",
      date: "2026-06-01",
      open: 3100.5,
      close: 3120,
      high: 3130,
      low: 3090,
      source: "eastmoney",
    });
    expect(bars[1].close).toBe(3150.5);
  });

  it("data 为空时返回 []", () => {
    expect(parseEastmoneyKlineBody({ data: null }, "600519")).toEqual([]);
    expect(parseEastmoneyKlineBody({}, "600519")).toEqual([]);
  });
});
