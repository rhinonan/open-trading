"use client";

import { CheckCircle2, XCircle, Clock } from "lucide-react";
import type { LogItem } from "@/hooks/use-agent-logs";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-danger text-sm">
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
      <Table>
        <TableHeader>
          <TableRow className="text-left text-muted-foreground hover:bg-transparent">
            <TableHead className="w-36">时间</TableHead>
            <TableHead className="w-40">Agent / 工作流</TableHead>
            <TableHead className="w-16">类型</TableHead>
            <TableHead className="w-12">状态</TableHead>
            <TableHead className="w-20 text-right">耗时</TableHead>
            <TableHead>输入摘要</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            const isSelected = log.traceId === selectedTraceId;
            const hasError = log.error != null;
            const isRunning = log.endedAt == null && !hasError;
            return (
              <TableRow
                key={log.traceId}
                onClick={() => onSelect(log.traceId)}
                data-state={isSelected ? "selected" : undefined}
                className="cursor-pointer"
              >
                <TableCell className="text-xs">
                  {formatTime(log.startedAt)}
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate max-w-[180px]">
                      {log.entityName}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs bg-secondary px-1.5 py-0.5 rounded whitespace-nowrap">
                    {CALL_SOURCE_LABEL[log.callSource] ?? log.callSource}
                  </span>
                </TableCell>
                <TableCell>
                  {hasError ? (
                    <XCircle className="h-4 w-4 text-danger" />
                  ) : isRunning ? (
                    <Clock className="h-4 w-4 text-warning" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  )}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {formatDuration(log.startedAt, log.endedAt)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                  {log.inputPreview}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {pagination.total > 0 && (
        <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
          <span>
            共 {pagination.total} 条，第 {pagination.page + 1} /{" "}
            {Math.max(1, Math.ceil(pagination.total / pagination.perPage))} 页
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 0}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={!pagination.hasMore}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
