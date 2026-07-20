// src/lib/market/eastmoney-kline.ts
// 东财日 K：secid 映射 + klines 解析（push2his kline/get）

export interface KlineBar {
  symbol: string;
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume?: number;
  source: "eastmoney";
}

function stripPrefix(code: string): string {
  const lower = code.trim().toLowerCase();
  if (lower.startsWith("sh") || lower.startsWith("sz") || lower.startsWith("bj")) {
    return lower.slice(2);
  }
  return code.trim();
}

/** 东财 secid：市场.代码 —— 1=上证 0=深证 */
export function toEastmoneySecid(code: string): string {
  const raw = code.trim();
  const lower = raw.toLowerCase();
  if (lower.startsWith("sh") || lower.startsWith("bj")) {
    return `1.${stripPrefix(raw)}`;
  }
  if (lower.startsWith("sz")) {
    return `0.${stripPrefix(raw)}`;
  }
  if (raw.startsWith("6") || raw.startsWith("9") || raw.startsWith("5")) {
    return `1.${raw}`;
  }
  return `0.${raw}`;
}

function num(v: string | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 东财 kline 行格式（逗号分隔，常见）：
 * date,open,close,high,low,volume,amount,amplitude,changePercent,changeAmount,turnover
 */
export function parseEastmoneyKlineBody(
  body: unknown,
  symbol: string,
): KlineBar[] {
  const data = (body as { data?: { klines?: string[] } | null })?.data;
  if (!data || !Array.isArray(data.klines)) return [];
  const bare = stripPrefix(symbol);
  const bars: KlineBar[] = [];
  for (const line of data.klines) {
    if (typeof line !== "string" || !line) continue;
    const p = line.split(",");
    if (p.length < 5) continue;
    bars.push({
      symbol: bare,
      date: p[0],
      open: num(p[1]),
      close: num(p[2]),
      high: num(p[3]),
      low: num(p[4]),
      volume: p[5] != null && p[5] !== "" ? num(p[5]) : undefined,
      source: "eastmoney",
    });
  }
  return bars;
}

export type FetchJson = (url: string) => Promise<unknown>;

const defaultFetchJson: FetchJson = async (url) => {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Referer: "https://quote.eastmoney.com/",
    },
  });
  if (!res.ok) throw new Error(`eastmoney kline HTTP ${res.status}`);
  return res.json();
};

export interface FetchKlineOptions {
  /** 开始日期 YYYYMMDD，可选 */
  beg?: string;
  /** 结束日期 YYYYMMDD，默认 20500101 */
  end?: string;
  /** 根数上限，默认 120 */
  lmt?: number;
  fetchJson?: FetchJson;
}

/** 拉取日 K（fqt=1 前复权）；beg/end 为 YYYY-MM-DD 或 YYYYMMDD */
export async function fetchEastmoneyKline(
  symbol: string,
  opts: FetchKlineOptions = {},
): Promise<KlineBar[]> {
  const secid = toEastmoneySecid(symbol);
  const end = (opts.end ?? "20500101").replace(/-/g, "");
  const beg = (opts.beg ?? "0").replace(/-/g, "");
  const lmt = opts.lmt ?? 120;
  const params = new URLSearchParams({
    secid,
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
    klt: "101", // 日 K
    fqt: "1",
    beg,
    end,
    lmt: String(lmt),
  });
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?${params}`;
  const fetchJson = opts.fetchJson ?? defaultFetchJson;
  const body = await fetchJson(url);
  return parseEastmoneyKlineBody(body, symbol);
}
