// src/services/douyin/market-snapshot.ts
import type { MarketSnapshot } from "@/types";

/**
 * Get market snapshot for a given date.
 *
 * PLACEHOLDER: Returns minimal mock data. Replace with real market
 * data API (Sina / EastMoney / TuShare / etc.) when ready.
 */
export async function getMarketSnapshot(
  date?: string
): Promise<MarketSnapshot> {
  const today = date || new Date().toISOString().slice(0, 10);

  return {
    date: today,
    indices: {
      shanghai: { close: 0, change: 0, changePercent: 0 },
      shenzhen: { close: 0, change: 0, changePercent: 0 },
      chinext: { close: 0, change: 0, changePercent: 0 },
    },
    topSectors: [],
    bottomSectors: [],
  };
}
