"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, History, Mic, Search, User, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface JobRun {
  id: number;
  jobId: string;
  trigger: string;
  startedAt: number;
  finishedAt: number | null;
  status: string;
  summary: string;
  error: string;
}

const JOB_LABELS: Record<string, string> = {
  profile: "资料更新",
  scan: "作品扫描",
  pipeline: "处理队列",
  eval: "观点评判",
};

const JOB_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  profile: User,
  scan: Search,
  pipeline: Mic,
  eval: TrendingUp,
};

const JOB_FILTER_OPTIONS = [
  { value: "all", label: "全部任务" },
  { value: "profile", label: "资料更新" },
  { value: "scan", label: "作品扫描" },
  { value: "pipeline", label: "处理队列" },
  { value: "eval", label: "观点评判" },
] as const;

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDuration(start: number, end: number | null): string {
  if (end == null) return "—";
  const s = end - start;
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter && filter !== "all") params.set("jobId", filter);
      const res = await fetch(`/api/settings/schedules/runs?${params}`);
      const data = await res.json();
      if (data.success) setRuns(data.runs ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={filter} onValueChange={(v) => setFilter(v ?? "all")}>
            <SelectTrigger size="sm" className="min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOB_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void fetchRuns()}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`}
            />
            刷新
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {runs.length > 0 ? `共 ${runs.length} 条（最近 50 条）` : ""}
        </p>
      </div>

      {loading && runs.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <Spinner className="h-4 w-4" />
          加载中...
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground py-12">
          <History className="h-8 w-8 opacity-40" />
          <p>暂无运行记录</p>
          <p className="text-xs">
            前往「调度配置」点击&quot;立即运行&quot;触发一次任务
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-36 text-muted-foreground">时间</TableHead>
                <TableHead className="w-20 text-muted-foreground">任务</TableHead>
                <TableHead className="w-16 text-muted-foreground">触发</TableHead>
                <TableHead className="w-16 text-muted-foreground">状态</TableHead>
                <TableHead className="text-muted-foreground">结果</TableHead>
                <TableHead className="w-16 text-right text-muted-foreground">
                  耗时
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    {formatTime(r.startedAt)}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1">
                      {(() => {
                        const Icon = JOB_ICONS[r.jobId];
                        return Icon ? (
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : null;
                      })()}
                      {JOB_LABELS[r.jobId] ?? r.jobId}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {r.trigger === "manual" ? "手动" : "定时"}
                  </TableCell>
                  <TableCell>
                    {r.status === "success" ? (
                      <Badge variant="success" className="text-xs">
                        成功
                      </Badge>
                    ) : r.status === "failed" ? (
                      <Badge variant="destructive" className="text-xs">
                        失败
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs inline-flex items-center gap-1">
                        <Spinner className="h-3 w-3" />
                        运行中
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-0 whitespace-normal">
                    <span
                      className={
                        r.status === "failed"
                          ? "text-destructive break-words"
                          : "break-words"
                      }
                    >
                      {r.status === "failed"
                        ? r.error || r.summary || "—"
                        : r.summary || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {formatDuration(r.startedAt, r.finishedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
