import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function FinancialsPage() {
  return (
    <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">财报 & 研报功能即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示财报数据表格与研报列表
          </p>
        </CardContent>
      </Card>
  );
}
