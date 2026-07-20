// src/lib/market/eastmoney-sector.ts
// 东财行业板块涨跌排名解析（push2 clist）

export interface SectorRow {
  rank: number;
  name: string;
  code: string;
  changePercent: number;
  upCount: number;
  downCount: number;
  leader: string;
  leaderChange: number;
  source: "eastmoney";
}

export interface IndustryComparison {
  top: SectorRow[];
  bottom: SectorRow[];
  total: number;
  source: "eastmoney";
  fetchedAt: string;
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function parseIndustryComparisonBody(
  body: unknown,
  opts: { topN?: number; fetchedAt?: string } = {},
): IndustryComparison {
  const topN = opts.topN ?? 20;
  const fetchedAt = opts.fetchedAt ?? new Date().toISOString();
  const diff =
    (body as { data?: { diff?: Record<string, unknown>[] } })?.data?.diff ?? [];
  if (!Array.isArray(diff) || diff.length === 0) {
    return { top: [], bottom: [], total: 0, source: "eastmoney", fetchedAt };
  }

  const rows: SectorRow[] = diff.map((item, i) => ({
    rank: i + 1,
    name: String(item.f14 ?? ""),
    code: String(item.f12 ?? ""),
    changePercent: num(item.f3),
    upCount: num(item.f104),
    downCount: num(item.f105),
    leader: String(item.f140 ?? ""),
    leaderChange: num(item.f136),
    source: "eastmoney" as const,
  }));

  return {
    top: rows.slice(0, topN),
    bottom: rows.slice(-topN),
    total: rows.length,
    source: "eastmoney",
    fetchedAt,
  };
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
  if (!res.ok) throw new Error(`eastmoney sector HTTP ${res.status}`);
  return res.json();
};

/** 全行业涨跌幅排名（~100 行业，fid=f3 按涨跌幅排序） */
export async function fetchIndustryComparison(
  topN = 20,
  fetchJson: FetchJson = defaultFetchJson,
): Promise<IndustryComparison> {
  const params = new URLSearchParams({
    pn: "1",
    pz: "100",
    po: "1",
    np: "1",
    fltt: "2",
    invt: "2",
    fid: "f3",
    fs: "m:90+t:2",
    fields: "f2,f3,f4,f12,f13,f14,f104,f105,f128,f136,f140,f141,f207",
  });
  const url = `https://push2.eastmoney.com/api/qt/clist/get?${params}`;
  const body = await fetchJson(url);
  return parseIndustryComparisonBody(body, { topN });
}
