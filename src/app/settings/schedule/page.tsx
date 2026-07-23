"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, Save, Clock, ExternalLink, Mic, Search, User, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";

interface ScheduleJob {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  cron: string;
  lastRunAt: number | null;
  lastError: string | null;
  nextRun: string;
}

const JOB_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  profile: User,
  scan: Search,
  pipeline: Mic,
  eval: TrendingUp,
};

const PRESETS: Record<string, Array<{ label: string; cron: string }>> = {
  profile: [
    { label: "每日 08:00", cron: "0 8 * * *" },
    { label: "工作日 08:00", cron: "0 8 * * 1-5" },
  ],
  scan: [
    { label: "每日 08:30", cron: "30 8 * * *" },
    { label: "每 6 小时", cron: "0 */6 * * *" },
  ],
  pipeline: [
    { label: "每 15 分钟", cron: "*/15 * * * *" },
    { label: "每 5 分钟", cron: "*/5 * * * *" },
  ],
  eval: [
    { label: "工作日收盘后", cron: "5 17 * * 1-5" },
    { label: "每日收盘后", cron: "5 17 * * *" },
  ],
};

function formatLastRun(ts: number | null): string {
  if (ts == null) return "从未运行";
  return new Date(ts * 1000).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function ScheduleSettingsPage() {
  const [jobs, setJobs] = useState<ScheduleJob[]>([]);
  const [cronDrafts, setCronDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const applyJobs = useCallback((list: ScheduleJob[]) => {
    setJobs(list);
    setCronDrafts(Object.fromEntries(list.map((j) => [j.id, j.cron])));
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/settings/schedules");
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || "加载调度配置失败");
    }
    applyJobs(data.jobs as ScheduleJob[]);
  }, [applyJobs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) {
          setMessage(e instanceof Error ? e.message : "加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  function patchJob(updated: ScheduleJob) {
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
    setCronDrafts((prev) => ({ ...prev, [updated.id]: updated.cron }));
  }

  async function putJob(
    id: string,
    body: { enabled?: boolean; cron?: string },
  ): Promise<ScheduleJob | null> {
    setSavingId(id);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/schedules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setMessage(data.error || "保存失败");
        return null;
      }
      const job = data.job as ScheduleJob;
      patchJob(job);
      return job;
    } catch {
      setMessage("保存失败，请检查网络");
      return null;
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggle(job: ScheduleJob) {
    const next = !job.enabled;
    // 乐观更新
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, enabled: next } : j)),
    );
    const saved = await putJob(job.id, { enabled: next });
    if (!saved) {
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, enabled: job.enabled } : j)),
      );
    }
  }

  async function handleSaveCron(job: ScheduleJob) {
    const cron = (cronDrafts[job.id] ?? job.cron).trim();
    if (!cron) {
      setMessage("cron 不能为空");
      return;
    }
    if (cron === job.cron) return;
    const saved = await putJob(job.id, { cron });
    if (saved) setMessage(`已保存「${job.label}」cron`);
  }

  async function handlePreset(job: ScheduleJob, cron: string) {
    setCronDrafts((prev) => ({ ...prev, [job.id]: cron }));
    if (cron === job.cron) return;
    const saved = await putJob(job.id, { cron });
    if (saved) setMessage(`已应用预设：${cron}`);
  }

  async function handleRun(job: ScheduleJob) {
    setRunningId(job.id);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/schedules/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setMessage(data.error || "运行失败");
      } else {
        setMessage(
          data.summary
            ? `「${job.label}」完成：${data.summary}`
            : `「${job.label}」已触发`,
        );
      }
      try {
        await refresh();
      } catch {
        /* 忽略刷新错误，已有运行结果提示 */
      }
    } catch {
      setMessage("运行失败，请检查网络");
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-medium flex items-center gap-2">
          <Clock className="h-4 w-4" />
          定时调度
        </h2>
        <p className="text-sm text-muted-foreground">
          单实例进程内调度（约每 60 秒 tick 一次）。多副本部署请勿开启，否则任务会重复执行。
        </p>
      </div>

      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Spinner className="h-4 w-4" /> 加载中...
        </p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无调度任务</p>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => {
            const draft = cronDrafts[job.id] ?? job.cron;
            const dirty = draft.trim() !== job.cron;
            const busy = savingId === job.id || runningId === job.id;
            const presets = PRESETS[job.id] ?? [];

            return (
              <Card key={job.id}>
                <CardHeader className="border-b">
                  <CardTitle className="flex items-center gap-1.5">
                    {(() => {
                      const Icon = JOB_ICONS[job.id];
                      return Icon ? <Icon className="h-4 w-4" /> : null;
                    })()}
                    {job.label}
                  </CardTitle>
                  <CardDescription>{job.description}</CardDescription>
                  <CardAction>
                    <div className="flex items-center gap-2 text-sm">
                      <Label
                        htmlFor={`job-enabled-${job.id}`}
                        className="text-muted-foreground cursor-pointer"
                      >
                        {job.enabled ? "已启用" : "已关闭"}
                      </Label>
                      <Switch
                        id={`job-enabled-${job.id}`}
                        checked={job.enabled}
                        disabled={busy}
                        onCheckedChange={() => handleToggle(job)}
                      />
                    </div>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        className="font-mono max-w-xs"
                        value={draft}
                        disabled={busy}
                        spellCheck={false}
                        placeholder="分 时 日 月 周"
                        onChange={(e) =>
                          setCronDrafts((prev) => ({
                            ...prev,
                            [job.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleSaveCron(job);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || !dirty}
                        onClick={() => void handleSaveCron(job)}
                      >
                        {savingId === job.id ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        保存
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => void handleRun(job)}
                      >
                        {runningId === job.id ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        立即运行
                      </Button>
                    </div>
                    {presets.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {presets.map((p) => (
                          <Button
                            key={p.cron}
                            type="button"
                            variant="ghost"
                            size="xs"
                            disabled={busy}
                            className={
                              job.cron === p.cron
                                ? "bg-muted text-foreground"
                                : undefined
                            }
                            onClick={() => void handlePreset(job, p.cron)}
                          >
                            {p.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>

                  <dl className="grid gap-1 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground shrink-0">下次运行</dt>
                      <dd className="font-mono text-xs sm:text-sm">
                        {job.enabled ? job.nextRun || "—" : "（已关闭）"}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground shrink-0">上次运行</dt>
                      <dd className="font-mono text-xs sm:text-sm">
                        {formatLastRun(job.lastRunAt)}
                      </dd>
                    </div>
                  </dl>

                  {job.lastError ? (
                    <p className="text-sm text-destructive break-words">
                      上次错误：{job.lastError}
                    </p>
                  ) : null}

                  <div className="border-t pt-3">
                    <a
                      href="/settings/schedule/history"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      查看完整运行历史
                    </a>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
