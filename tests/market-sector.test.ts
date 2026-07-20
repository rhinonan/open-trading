// tests/market-sector.test.ts
// 东财行业板块排名解析
import { describe, it, expect } from "vitest";
import { parseIndustryComparisonBody } from "@/lib/market/eastmoney-sector";

describe("parseIndustryComparisonBody", () => {
  it("按列表顺序切片 top/bottom", () => {
    const diff = Array.from({ length: 5 }, (_, i) => ({
      f12: `BK${i}`,
      f14: `行业${i}`,
      f3: 10 - i,
      f104: i,
      f105: 5 - i,
      f140: `龙头${i}`,
      f136: 1 + i,
    }));
    const result = parseIndustryComparisonBody(
      { data: { diff } },
      { topN: 2 },
    );
    expect(result.total).toBe(5);
    expect(result.top).toHaveLength(2);
    expect(result.top[0]).toMatchObject({
      rank: 1,
      name: "行业0",
      code: "BK0",
      changePercent: 10,
      source: "eastmoney",
    });
    expect(result.bottom).toHaveLength(2);
    expect(result.bottom[0].name).toBe("行业3");
    expect(result.bottom[1].name).toBe("行业4");
  });

  it("空 diff 返回空列表", () => {
    expect(parseIndustryComparisonBody({ data: { diff: [] } }, { topN: 10 })).toEqual({
      top: [],
      bottom: [],
      total: 0,
      source: "eastmoney",
      fetchedAt: expect.any(String),
    });
  });
});
