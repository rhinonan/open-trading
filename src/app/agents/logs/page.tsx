"use client";

import { useState } from "react";
import { useAgentLogs, useAgentLogDetail } from "@/hooks/use-agent-logs";
import { AgentLogList } from "@/components/agents/agent-log-list";
import { AgentLogDetail } from "@/components/agents/agent-log-detail";
import { ScrollText } from "lucide-react";

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

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* 左侧列表 */}
      <div className="w-96 shrink-0 rounded-lg border bg-card overflow-hidden flex flex-col">
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

      {/* 右侧详情 */}
      <div className="flex-1 min-w-0">
        <AgentLogDetail
          spans={spans}
          loading={detailLoading}
          error={detailError}
        />
      </div>
    </div>
  );
}
