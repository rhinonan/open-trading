import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function FinancialsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">财报 & 研报</h1>
        <p className="text-muted-foreground mt-1">
          历史财报数据查询与机构研报汇总
        </p>
      </div>
      <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">财报 & 研报功能即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示财报数据表格与研报列表
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
