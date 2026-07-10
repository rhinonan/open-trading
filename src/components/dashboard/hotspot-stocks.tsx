import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, TrendingUp } from "lucide-react";

const MOCK_STOCKS = [
  { symbol: "AAPL", name: "苹果", price: 198.52, change: 2.34 },
  { symbol: "NVDA", name: "英伟达", price: 128.44, change: 5.67 },
  { symbol: "TSLA", name: "特斯拉", price: 246.38, change: -1.23 },
  { symbol: "600519", name: "贵州茅台", price: 1682.50, change: 0.85 },
  { symbol: "000858", name: "五粮液", price: 156.20, change: -0.45 },
];

export function HotspotStocks() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">个股热点</CardTitle>
        <Link
          href="/stocks"
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          查看全部 →
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {MOCK_STOCKS.map((stock) => (
            <Link
              key={stock.symbol}
              href={`/stocks/${stock.symbol}`}
              className="flex items-center justify-between rounded-lg p-2 hover:bg-muted/50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium">{stock.symbol}</p>
                <p className="text-xs text-muted-foreground">{stock.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{stock.price.toFixed(2)}</p>
                <Badge
                  variant={stock.change >= 0 ? "default" : "destructive"}
                  className="text-xs h-5"
                >
                  {stock.change >= 0 ? (
                    <ArrowUp className="mr-0.5 h-3 w-3" />
                  ) : (
                    <ArrowDown className="mr-0.5 h-3 w-3" />
                  )}
                  {stock.change > 0 ? "+" : ""}
                  {stock.change}%
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
