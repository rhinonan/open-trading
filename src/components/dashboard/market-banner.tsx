import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, BarChart3, DollarSign } from "lucide-react";

const STATS = [
  { label: "上证指数", value: "3,245.18", change: "+0.62%", up: true, icon: TrendingUp },
  { label: "深证成指", value: "10,872.36", change: "+1.15%", up: true, icon: TrendingUp },
  { label: "涨跌家数", value: "2,856 / 1,092", change: "", up: true, icon: BarChart3 },
  { label: "成交额", value: "8,562 亿", change: "+12.3%", up: true, icon: DollarSign },
];

export function MarketBanner() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STATS.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{stat.value}</span>
              {stat.change && (
                <span
                  className={`text-sm font-medium tabular-nums ${
                    stat.up ? "text-market-up" : "text-market-down"
                  }`}
                >
                  {stat.up ? (
                    <TrendingUp className="inline h-3 w-3 mr-0.5" />
                  ) : (
                    <TrendingDown className="inline h-3 w-3 mr-0.5" />
                  )}
                  {stat.change}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
