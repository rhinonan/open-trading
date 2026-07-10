import { Card, CardContent } from "@/components/ui/card";
import { Bot } from "lucide-react";

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent 管理</h1>
        <p className="text-muted-foreground mt-1">
          多 Agent 状态监控、任务队列与日志查看
        </p>
      </div>
      <Card className="flex items-center justify-center min-h-[400px] border-dashed">
        <CardContent className="text-center py-12">
          <Bot className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg text-muted-foreground">Agent 管理功能即将上线</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            此页面将展示 Agent 状态卡片、任务队列与实时日志
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
