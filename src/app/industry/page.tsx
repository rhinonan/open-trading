import { Card, CardContent } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export default function IndustryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">行业分析</h1>
        <p className="text-muted-foreground mt-1">
          行业对比、板块热度与资金流向分析
        </p>
      </div>
      <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">行业分析功能即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示行业对比表格与板块热度图
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
