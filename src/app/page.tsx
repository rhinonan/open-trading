import { MarketBanner } from "@/components/dashboard/market-banner";
import { HotspotStocks } from "@/components/dashboard/hotspot-stocks";
import { IndustrySnapshot } from "@/components/dashboard/industry-snapshot";
import { SentimentPreview } from "@/components/dashboard/sentiment-preview";
import { RecentActivity } from "@/components/dashboard/recent-activity";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
        <p className="text-muted-foreground mt-1">
          市场概览与各模块摘要，点击卡片进入对应分析页面
        </p>
      </div>

      <MarketBanner />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <HotspotStocks />
        <IndustrySnapshot />
        <SentimentPreview />
      </div>

      <RecentActivity />
    </div>
  );
}
