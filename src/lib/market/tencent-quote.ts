// src/lib/market/tencent-quote.ts
// 腾讯财经实时报价：纯解析 + 可选 fetch（逻辑对齐 a-stock-data tencent_quote）

export interface TencentQuote {
  symbol: string;
  name: string;
  price: number;
  lastClose: number;
  open: number;
  changeAmount: number;
  changePercent: number;
  high: number;
  low: number;
  source: "tencent";
  fetchedAt: string;
}

function num(v: string | undefined): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 裸代码 / 已带前缀 → 腾讯 qt 前缀（sh/sz/bj） */
export function toTencentPrefixed(code: string): string {
  const raw = code.trim();
  const lower = raw.toLowerCase();
  if (lower.startsWith("sh") || lower.startsWith("sz") || lower.startsWith("bj")) {
    return lower;
  }
  if (raw.startsWith("6") || raw.startsWith("9")) return `sh${raw}`;
  if (raw.startsWith("8")) return `bj${raw}`;
  return `sz${raw}`;
}

/** 解析 qt.gtimg.cn 的 GBK 文本体为 { 裸代码: quote } */
export function parseTencentQuoteBody(
  body: string,
  fetchedAt: string = new Date().toISOString(),
): Record<string, TencentQuote> {
  const result: Record<string, TencentQuote> = {};
  for (const line of body.trim().split(";")) {
    if (!line.trim() || !line.includes("=") || !line.includes('"')) continue;
    const key = line.split("=")[0].split("_").pop() ?? "";
    const quoted = line.split('"')[1];
    if (!quoted) continue;
    const vals = quoted.split("~");
    if (vals.length < 53) continue;
    // key 形如 sh600519 → 裸代码 600519
    const symbol = key.length > 2 ? key.slice(2) : key;
    result[symbol] = {
      symbol,
      name: vals[1] ?? "",
      price: num(vals[3]),
      lastClose: num(vals[4]),
      open: num(vals[5]),
      changeAmount: num(vals[31]),
      changePercent: num(vals[32]),
      high: num(vals[33]),
      low: num(vals[34]),
      source: "tencent",
      fetchedAt,
    };
  }
  return result;
}

export type FetchText = (url: string) => Promise<string>;

const defaultFetchText: FetchText = async (url) => {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) {
    throw new Error(`tencent quote HTTP ${res.status}`);
  }
  // 腾讯返回 gbk；Node fetch 默认按 utf-8 会乱码名称，用 arrayBuffer + TextDecoder
  const buf = await res.arrayBuffer();
  // 腾讯 qt 实为 GBK；单测 mock 常注入 UTF-8。先 fatal UTF-8，失败再 GBK。
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder("gbk").decode(buf);
    } catch {
      return new TextDecoder("utf-8").decode(buf);
    }
  }
};

/** 批量拉腾讯实时行情；fetchText 可注入便于单测 */
export async function fetchTencentQuotes(
  codes: string[],
  fetchText: FetchText = defaultFetchText,
): Promise<Record<string, TencentQuote>> {
  if (codes.length === 0) return {};
  const prefixed = codes.map(toTencentPrefixed);
  const url = "https://qt.gtimg.cn/q=" + prefixed.join(",");
  const body = await fetchText(url);
  return parseTencentQuoteBody(body);
}
