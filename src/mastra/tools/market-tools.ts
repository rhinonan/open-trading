// src/mastra/tools/market-tools.ts
// 评判高频行情 Typed Tools（第一批）：报价 / 日 K / 行业排名
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchTencentQuotes } from "@/lib/market/tencent-quote";
import { fetchEastmoneyKline } from "@/lib/market/eastmoney-kline";
import { fetchIndustryComparison } from "@/lib/market/eastmoney-sector";

const quoteSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  price: z.number(),
  lastClose: z.number(),
  open: z.number(),
  changeAmount: z.number(),
  changePercent: z.number(),
  high: z.number(),
  low: z.number(),
  source: z.literal("tencent"),
  fetchedAt: z.string(),
});

/** 腾讯财经实时/日级报价（个股、指数、ETF；不封 IP） */
export const getStockQuoteTool = createTool({
  id: "get-stock-quote",
  description:
    "批量获取 A 股/指数/ETF 实时报价（腾讯财经）。传入裸代码如 600519、000001，或 sh000001/sz399006。返回现价、昨收、开高低、涨跌幅。",
  inputSchema: z.object({
    symbols: z
      .array(z.string().min(1))
      .min(1)
      .max(30)
      .describe("股票/指数代码列表，如 ['600519','sh000001']"),
  }),
  outputSchema: z.object({
    quotes: z.array(quoteSchema),
  }),
  execute: async ({ symbols }) => {
    const map = await fetchTencentQuotes(symbols);
    return { quotes: Object.values(map) };
  },
});

const klineBarSchema = z.object({
  symbol: z.string(),
  date: z.string(),
  open: z.number(),
  close: z.number(),
  high: z.number(),
  low: z.number(),
  volume: z.number().optional(),
  source: z.literal("eastmoney"),
});

/** 东财日 K（前复权），用于发布日前后区间涨跌验证 */
export const getIndexKlineTool = createTool({
  id: "get-index-kline",
  description:
    "获取个股或指数日 K 线（东财，前复权）。用于评判发布日前后开收价与涨跌幅。symbol 可用 600519、sh000001、sz399006。beg/end 为 YYYY-MM-DD。",
  inputSchema: z.object({
    symbol: z.string().min(1).describe("代码，如 sh000001 或 600519"),
    beg: z
      .string()
      .optional()
      .describe("起始日期 YYYY-MM-DD，可选"),
    end: z
      .string()
      .optional()
      .describe("结束日期 YYYY-MM-DD，可选"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe("最多返回根数，默认 120"),
  }),
  outputSchema: z.object({
    bars: z.array(klineBarSchema),
  }),
  execute: async ({ symbol, beg, end, limit }) => {
    const bars = await fetchEastmoneyKline(symbol, {
      beg,
      end,
      lmt: limit,
    });
    return { bars };
  },
});

const sectorRowSchema = z.object({
  rank: z.number(),
  name: z.string(),
  code: z.string(),
  changePercent: z.number(),
  upCount: z.number(),
  downCount: z.number(),
  leader: z.string(),
  leaderChange: z.number(),
  source: z.literal("eastmoney"),
});

/** 东财行业板块涨跌排名 */
export const getSectorRankTool = createTool({
  id: "get-sector-rank",
  description:
    "获取 A 股行业板块涨跌幅排名（东财）。返回涨幅 topN 与跌幅 bottomN，用于板块轮动类预测验证。",
  inputSchema: z.object({
    topN: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("取前/后 N 个行业，默认 20"),
  }),
  outputSchema: z.object({
    top: z.array(sectorRowSchema),
    bottom: z.array(sectorRowSchema),
    total: z.number(),
    source: z.literal("eastmoney"),
    fetchedAt: z.string(),
  }),
  execute: async (input) => {
    const topN = input?.topN ?? 20;
    return fetchIndustryComparison(topN);
  },
});

export const marketTools = {
  getStockQuote: getStockQuoteTool,
  getIndexKline: getIndexKlineTool,
  getSectorRank: getSectorRankTool,
};
