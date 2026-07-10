import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Building2 } from "lucide-react";

const MOCK_INDUSTRIES = [
  { name: "半导体", change: 3.42 },
  { name: "新能源汽车", change: 2.18 },
  { name: "人工智能", change: 1.95 },
  { name: "生物医药", change: -0.87 },
  { name: "食品饮料", change: -1.32 },
];

export function IndustrySnapshot() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">行业板块</CardTitle>
        <Link
          href="/industry"
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          查看全部 →
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {MOCK_INDUSTRIES.map((industry) => (
            <div
              key={industry.name}
              className="flex items-center justify-between rounded-lg p-2 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{industry.name}</span>
              </div>
              <Badge
                variant={industry.change >= 0 ? "default" : "destructive"}
                className="text-xs h-5"
              >
                {industry.change >= 0 ? (
                  <ArrowUp className="mr-0.5 h-3 w-3" />
                ) : (
                  <ArrowDown className="mr-0.5 h-3 w-3" />
                )}
                {industry.change > 0 ? "+" : ""}
                {industry.change}%
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
