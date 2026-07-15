import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";

export default function SentimentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">舆情分析</h1>
        <p className="text-muted-foreground mt-1">
          社交媒体情绪监测与热点话题追踪
        </p>
      </div>


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
    </div>
  );
}
