import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingUp, Building2, MessageCircle, FileText } from "lucide-react";

const MOCK_ACTIVITIES = [
  {
    id: "1",
    type: "stock",
    target: "NVDA — 英伟达",
    description: "多 Agent 综合分析完成",
    time: "2 小时前",
    href: "/stocks/NVDA",
  },
  {
    id: "2",
    type: "industry",
    target: "半导体行业",
    description: "行业对比分析报告已生成",
    time: "5 小时前",
    href: "/industry",
  },
  {
    id: "3",
    type: "sentiment",
    target: "AI 芯片舆情",
    description: "社交媒体情绪指数更新",
    time: "8 小时前",
    href: "/sentiment",
  },
  {
    id: "4",
    type: "financials",
    target: "AAPL — 苹果",
    description: "Q2 财报数据已导入",
    time: "昨天",
    href: "/financials",
  },
];

const typeConfig = {
  stock: { icon: TrendingUp, color: "text-blue-500 bg-blue-500/10" },
  industry: { icon: Building2, color: "text-purple-500 bg-purple-500/10" },
  sentiment: { icon: MessageCircle, color: "text-green-500 bg-green-500/10" },
  financials: { icon: FileText, color: "text-orange-500 bg-orange-500/10" },
};

export function RecentActivity() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">最近分析记录</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {MOCK_ACTIVITIES.map((activity) => {
            const config = typeConfig[activity.type as keyof typeof typeConfig];
            const Icon = config.icon;
            return (
              <Link
                key={activity.id}
                href={activity.href}
                className="flex items-center gap-3 rounded-lg p-3 hover:bg-muted/50 transition-colors"
              >
                <span className={`rounded-md p-1.5 ${config.color}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{activity.target}</p>
                  <p className="text-xs text-muted-foreground">{activity.description}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  {activity.time}
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
