import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";

const MOCK_SENTIMENTS = [
  { keyword: "AI 芯片", score: 82, sentiment: "positive" as const },
  { keyword: "降息预期", score: 75, sentiment: "positive" as const },
  { keyword: "新能源补贴", score: 68, sentiment: "positive" as const },
  { keyword: "贸易摩擦", score: 35, sentiment: "negative" as const },
  { keyword: "地产政策", score: 48, sentiment: "neutral" as const },
];

const sentimentConfig = {
  positive: { icon: TrendingUp, className: "text-success bg-success/10" },
  negative: { icon: TrendingDown, className: "text-danger bg-danger/10" },
  neutral: { icon: Minus, className: "text-warning bg-warning/10" },
};

export function SentimentPreview() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">舆情速览</CardTitle>
        <Link
          href="/sentiment"
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          查看全部 →
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {MOCK_SENTIMENTS.map((item) => {
            const config = sentimentConfig[item.sentiment];
            const Icon = config.icon;
            return (
              <div
                key={item.keyword}
                className="flex items-center justify-between rounded-lg p-2 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded-md p-1 ${config.className}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-sm font-medium">{item.keyword}</span>
                </div>
                <Badge variant="secondary" className="text-xs h-5 tabular-nums">
                  热度 {item.score}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
