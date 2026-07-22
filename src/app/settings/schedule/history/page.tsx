"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, History, Mic, Search, User, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

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

const JOB_IDS = ["", "profile", "scan", "pipeline", "eval"] as const;

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
  const [filter, setFilter] = useState<string>("");

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter) params.set("jobId", filter);
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
          <select
            className="border rounded px-2 py-1.5 text-sm bg-background"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">全部任务</option>
            {JOB_IDS.filter(Boolean).map((id) => (
              <option key={id} value={id}>
                {JOB_LABELS[id]}
              </option>
            ))}
          </select>
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
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中...
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground py-12">
          <History className="h-8 w-8 opacity-40" />
          <p>暂无运行记录</p>
          <p className="text-xs">
            前往「调度配置」点击"立即运行"触发一次任务
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-36">
                  时间
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-20">
                  任务
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-16">
                  触发
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-16">
                  状态
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  结果
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground w-16">
                  耗时
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr
                  key={r.id}
                  className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                    {formatTime(r.startedAt)}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      {(() => {
                        const Icon = JOB_ICONS[r.jobId];
                        return Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" /> : null;
                      })()}
                      {JOB_LABELS[r.jobId] ?? r.jobId}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs whitespace-nowrap">
                    {r.trigger === "manual" ? "手动" : "定时"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {r.status === "success" ? (
                      <span className="text-green-600 text-xs font-medium">
                        成功
                      </span>
                    ) : r.status === "failed" ? (
                      <span className="text-destructive text-xs font-medium">
                        失败
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        运行中
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 min-w-0">
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
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {formatDuration(r.startedAt, r.finishedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
