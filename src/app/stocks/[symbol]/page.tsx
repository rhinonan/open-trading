import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, TrendingUp } from "lucide-react";
import Link from "next/link";

interface StockDetailPageProps {
  params: Promise<{ symbol: string }>;
}

export default async function StockDetailPage({ params }: StockDetailPageProps) {
  const { symbol } = await params;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/stocks"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{symbol.toUpperCase()}</h1>
        <Badge variant="secondary">分析中</Badge>
      </div>

      <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">多 Agent 分析面板即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示 K 线图表与各 Agent 的独立分析结论
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
