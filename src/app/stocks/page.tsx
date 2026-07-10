import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

export default function StocksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">个股分析</h1>
        <p className="text-muted-foreground mt-1">
          多 Agent 协作分析个股基本面、技术面与市场情绪
        </p>
      </div>
      <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">个股分析功能即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示股票搜索、筛选与多 Agent 分析面板
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
