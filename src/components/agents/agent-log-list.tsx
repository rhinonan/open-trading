"use client";

import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { LogItem } from "@/hooks/use-agent-logs";

interface Pagination {
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

interface AgentLogListProps {
  logs: LogItem[];
  pagination: Pagination;
  loading: boolean;
  error: string;
  selectedTraceId: string | null;
  onSelect: (traceId: string) => void;
  onPageChange: (page: number) => void;
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "—";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const CALL_SOURCE_LABEL: Record<string, string> = {
  chat: "聊天",
  workflow: "工作流",
  test: "测试",
};

export function AgentLogList({
  logs,
  pagination,
  loading,
  error,
  selectedTraceId,
  onSelect,
  onPageChange,
}: AgentLogListProps) {
  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-red-500 text-sm">
        {error}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        暂无日志记录
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium w-36">时间</th>
              <th className="py-2 pr-3 font-medium w-40">Agent / 工作流</th>
              <th className="py-2 pr-3 font-medium w-16">类型</th>
              <th className="py-2 pr-3 font-medium w-12">状态</th>
              <th className="py-2 pr-3 font-medium w-20 text-right">耗时</th>
              <th className="py-2 pr-3 font-medium">输入摘要</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const isSelected = log.traceId === selectedTraceId;
              const hasError = log.error != null;
              const isRunning = log.endedAt == null && !hasError;
              return (
                <tr
                  key={log.traceId}
                  onClick={() => onSelect(log.traceId)}
                  className={`border-b cursor-pointer transition-colors hover:bg-muted/50 ${
                    isSelected ? "bg-muted" : ""
                  }`}
                >
                  <td className="py-2 pr-3 text-xs whitespace-nowrap">
                    {formatTime(log.startedAt)}
                  </td>
                  <td className="py-2 pr-3 font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-[180px]">
                        {log.entityName}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="text-xs bg-secondary px-1.5 py-0.5 rounded whitespace-nowrap">
                      {CALL_SOURCE_LABEL[log.callSource] ?? log.callSource}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {hasError ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : isRunning ? (
                      <Clock className="h-4 w-4 text-yellow-500" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                    {formatDuration(log.startedAt, log.endedAt)}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground max-w-xs truncate">
                    {log.inputPreview}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination.total > 0 && (
        <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
          <span>
            共 {pagination.total} 条，第 {pagination.page + 1} /{" "}
            {Math.max(1, Math.ceil(pagination.total / pagination.perPage))} 页
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 0}
              className="px-2 py-1 rounded border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={!pagination.hasMore}
              className="px-2 py-1 rounded border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
