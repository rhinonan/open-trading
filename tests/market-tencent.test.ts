// tests/market-tencent.test.ts
// 腾讯财经实时报价：代码前缀 + 响应解析（纯函数，不打网）
import { describe, it, expect } from "vitest";
import {
  toTencentPrefixed,
  parseTencentQuoteBody,
} from "@/lib/market/tencent-quote";

describe("toTencentPrefixed", () => {
  it("上证 6/9 开头 → sh", () => {
    expect(toTencentPrefixed("600519")).toBe("sh600519");
    expect(toTencentPrefixed("000001")).toBe("sz000001"); // 深市个股 0 开头
  });

  it("已带 sh/sz/bj 前缀则原样小写返回", () => {
    expect(toTencentPrefixed("sh000001")).toBe("sh000001");
    expect(toTencentPrefixed("SZ399006")).toBe("sz399006");
  });

  it("北交所 8 开头 → bj", () => {
    expect(toTencentPrefixed("830799")).toBe("bj830799");
  });

  it("指数：显式 market 或常见指数码", () => {
    // 上证指数需 sh 前缀；纯 000001 默认按深市个股处理，调用方应传 sh000001
    expect(toTencentPrefixed("sh000001")).toBe("sh000001");
    expect(toTencentPrefixed("399006")).toBe("sz399006");
  });
});

describe("parseTencentQuoteBody", () => {
  it("解析单条 ~ 分隔行情行", () => {
    // 字段索引按 a-stock-data 实测：1 名称 3 现价 4 昨收 5 开 31 涨跌额 32 涨跌幅 33 高 34 低
    const vals = Array.from({ length: 53 }, () => "");
    vals[1] = "贵州茅台";
    vals[3] = "1500.50";
    vals[4] = "1480.00";
    vals[5] = "1490.00";
    vals[31] = "20.50";
    vals[32] = "1.39";
    vals[33] = "1510.00";
    vals[34] = "1485.00";
    const body = `v_sh600519="${vals.join("~")}";`;

    const quotes = parseTencentQuoteBody(body);
    expect(quotes["600519"]).toMatchObject({
      symbol: "600519",
      name: "贵州茅台",
      price: 1500.5,
      lastClose: 1480,
      open: 1490,
      changeAmount: 20.5,
      changePercent: 1.39,
      high: 1510,
      low: 1485,
      source: "tencent",
    });
    expect(typeof quotes["600519"].fetchedAt).toBe("string");
  });

  it("忽略空行与字段不足的行", () => {
    const body = `v_sh600519="";\nv_sz000001="too~few";`;
    expect(parseTencentQuoteBody(body)).toEqual({});
  });
});
