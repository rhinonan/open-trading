"use client";

import { useState } from "react";
import { useAgentLogs, useAgentLogDetail } from "@/hooks/use-agent-logs";
import { AgentLogList } from "@/components/agents/agent-log-list";
import { AgentLogDetail } from "@/components/agents/agent-log-detail";
import { ScrollText } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export default function AgentLogsPage() {
  const [page, setPage] = useState(0);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const { logs, pagination, loading, error } = useAgentLogs({
    page,
    perPage: 20,
  });
  const {
    spans,
    loading: detailLoading,
    error: detailError,
  } = useAgentLogDetail(selectedTraceId);

  const selectedLog = logs.find((l) => l.traceId === selectedTraceId) ?? null;

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-8rem)]">
      {/* 日志列表（铺满） */}
      <div className="flex-1 rounded-lg border bg-card overflow-hidden flex flex-col min-h-0 shadow-[var(--card-glow)] ring-1 ring-[var(--card-ring)]">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Agent 调用日志
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          <AgentLogList
            logs={logs}
            pagination={pagination}
            loading={loading}
            error={error}
            selectedTraceId={selectedTraceId}
            onSelect={setSelectedTraceId}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* 详情抽屉 */}
      <Sheet
        open={selectedTraceId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTraceId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-[min(90vw,880px)] max-w-[min(90vw,880px)] p-0 data-[side=right]:w-[min(90vw,880px)] data-[side=right]:sm:max-w-[880px]"
        >
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle>
              {selectedLog?.entityName ?? "日志详情"}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <AgentLogDetail
              spans={spans}
              loading={detailLoading}
              error={detailError}
              log={selectedLog}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
