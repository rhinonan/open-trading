import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";

export default function SentimentPage() {
  return (
    <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <MessageCircle className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">
            舆情分析功能即将上线
          </p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示舆情时间线、情绪仪表盘与来源分布
          </p>
        </CardContent>
      </Card>
  );
}
