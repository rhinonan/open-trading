"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Radio } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BloggerToolbar } from "./BloggerToolbar";
import { BloggerTable } from "./BloggerTable";
import type {
  DouyinBlogger,
  WorkWithBlogger,
  WorksResponse,
} from "@/types";

type ToolbarAction =
  | "update-profile"
  | "scan"
  | "transcribe"
  | "summarize"
  | "evaluate";

const BLOGGERS_PER_PAGE = 15;

export default function DouyinSettingsPage() {
  // --- Blogger state ---
  const [bloggers, setBloggers] = useState<DouyinBlogger[]>([]);
  const [bloggerTotal, setBloggerTotal] = useState(0);
  const [bloggerPage, setBloggerPage] = useState(0);
  const [loadingBloggers, setLoadingBloggers] = useState(true);

  // --- Selection state ---
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // --- Expand state (accordion: one at a time) ---
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [worksCache, setWorksCache] = useState<Record<number, WorkWithBlogger[]>>({});
  const [loadingWorks, setLoadingWorks] = useState(false);

  // --- Processing state ---
  const [processingAction, setProcessingAction] = useState<ToolbarAction | null>(null);
  const [message, setMessage] = useState("");

  // --- Eval progress state ---
  const [evalProgress, setEvalProgress] = useState<Record<string, number>>({});
  const [evalCron, setEvalCron] = useState("5 17 * * 1-5");
  const [evalEnabled, setEvalEnabled] = useState(true);
  const [nextRun, setNextRun] = useState("");
  const [saving, setSaving] = useState(false);
  const [evalAllLoading, setEvalAllLoading] = useState(false);
  const evalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Fetch bloggers ---
  const fetchBloggers = useCallback(async () => {
    setLoadingBloggers(true);
    try {
      const res = await fetch("/api/douyin/bloggers?include=latest_opinion");
      if (res.ok) {
        const data = await res.json();
        // Client-side pagination for bloggers
        setBloggers(data);
        setBloggerTotal(data.length);
        // Clamp page into valid range in case the list shrank (e.g. after delete)
        setBloggerPage((p) =>
          Math.min(p, Math.max(0, Math.ceil(data.length / BLOGGERS_PER_PAGE) - 1))
        );
      }
    } catch {}
    setLoadingBloggers(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-then-setState data loading
    fetchBloggers();
  }, [fetchBloggers]);

  // --- Fetch works for expanded blogger ---
  useEffect(() => {
    if (expandedId === null) return;
    const blogger = bloggers.find((b) => b.id === expandedId);
    if (!blogger) return;

    // Skip if already cached
    if (worksCache[expandedId]) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-then-setState data loading
    setLoadingWorks(true);
    const fetchWorksForBlogger = async () => {
      try {
        const res = await fetch(
          `/api/douyin/works?blogger_slugs=${blogger.slug}&perPage=200`
        );
        if (res.ok) {
          const data: WorksResponse = await res.json();
          setWorksCache((prev) => ({
            ...prev,
            [expandedId]: data.works,
          }));
        }
      } catch {}
      setLoadingWorks(false);
    };
    fetchWorksForBlogger();
  }, [expandedId, bloggers, worksCache]);

  // --- Poll works while transcribing ---
  // 展开的作品列表里还有 processing 时，每 5 秒失效缓存触发重取；
  // 全部完成后自动停止。
  useEffect(() => {
    if (expandedId === null) return;
    const list = worksCache[expandedId];
    if (!list?.some((w) => w.transcriptStatus === "processing")) return;
    const timer = setInterval(() => {
      setWorksCache((prev) => {
        const next = { ...prev };
        delete next[expandedId];
        return next;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [expandedId, worksCache]);

  // --- Eval progress polling ---
  useEffect(() => {
    evalPollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/douyin/evaluate/progress");
        const data = await res.json();
        if (data.success) setEvalProgress(data);
      } catch { /* ignore */ }
    }, 3000);
    return () => {
      if (evalPollRef.current) clearInterval(evalPollRef.current);
    };
  }, []);

  // --- Fetch eval cron config ---
  useEffect(() => {
    fetch("/api/settings/eval-schedule")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setEvalCron(d.cron);
          setEvalEnabled(d.enabled);
          // Compute next run preview
          try {
            const { parseCron, describeCronNext } = require("@/lib/cron-matcher");
            const fields = parseCron(d.cron);
            setNextRun(describeCronNext(fields));
          } catch { setNextRun(""); }
        }
      })
      .catch(() => {});
  }, []);

  // --- Update next run preview when cron changes ---
  useEffect(() => {
    try {
      // Dynamic import to avoid SSR issues (pure browser-side computation)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { parseCron, describeCronNext } = require("@/lib/cron-matcher");
      const fields = parseCron(evalCron);
      setNextRun(describeCronNext(fields));
    } catch { setNextRun("cron 格式无效"); }
  }, [evalCron]);

  // --- Eval handlers ---
  const handleSaveSchedule = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/eval-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cron: evalCron, enabled: evalEnabled }),
      });
      setMessage("定时配置已保存");
    } catch {
      setMessage("保存失败");
    }
    setSaving(false);
  };

  const handleEvalAll = async () => {
    setEvalAllLoading(true);
    try {
      const res = await fetch("/api/douyin/evaluate", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setMessage(`评判入队完成，共 ${data.enqueued} 个作品`);
      } else {
        setMessage(`入队失败: ${data.error}`);
      }
    } catch {
      setMessage("请求失败");
    }
    setEvalAllLoading(false);
  };

  const CRON_PRESETS = [
    { value: "5 17 * * 1-5", label: "工作日收盘后" },
    { value: "5 17 * * *", label: "每日收盘后" },
    { value: "0 9 * * 1", label: "每周一" },
  ];

  // --- Selection ---
  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // --- Expand ---
  const handleExpand = (id: number | null) => {
    setExpandedId(id);
  };

  // --- Delete ---
  const handleDelete = async (slug: string) => {
    const deletedId = bloggers.find((b) => b.slug === slug)?.id;
    try {
      const res = await fetch(`/api/douyin/bloggers/${slug}`, { method: "DELETE" });
      if (res.ok) {
        setMessage("博主已删除");
        if (deletedId !== undefined) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(deletedId);
            return next;
          });
        }
        setExpandedId(null);
        setWorksCache({});
        fetchBloggers();
      } else {
        setMessage("删除失败");
      }
    } catch {
      setMessage("删除失败");
    }
  };

  // --- Single video operations ---
  const handleTranscribe = async (workId: number) => {
    setMessage("");
    try {
      const res = await fetch(`/api/douyin/works/${workId}/transcribe`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage("转写任务已加入队列，完成后自动刷新");
        // Invalidate cache for the expanded blogger to refresh
        if (expandedId) {
          setWorksCache((prev) => {
            const next = { ...prev };
            delete next[expandedId];
            return next;
          });
        }
      } else {
        setMessage(`转写失败: ${data.error}`);
      }
    } catch {
      setMessage("转写请求失败");
    }
  };

  const handleSummarize = async (workId: number) => {
    setMessage("");
    try {
      const res = await fetch(`/api/douyin/works/${workId}/summarize`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage("观点已提取");
        if (expandedId) {
          setWorksCache((prev) => {
            const next = { ...prev };
            delete next[expandedId];
            return next;
          });
        }
      } else {
        setMessage(`观点提取失败: ${data.error}`);
      }
    } catch {
      setMessage("观点提取请求失败");
    }
  };

  // --- Toolbar actions ---
  const getSelectedSlugs = (): string[] => {
    return bloggers
      .filter((b) => selectedIds.has(b.id))
      .map((b) => b.slug);
  };

  const handleToolbarAction = async (action: ToolbarAction) => {
    if (processingAction) return;
    setMessage("");
    setProcessingAction(action);

    const slugs =
      selectedIds.size > 0
        ? getSelectedSlugs()
        : bloggers.map((b) => b.slug);

    let succeeded = 0;
    let failed = 0;

    for (const slug of slugs) {
      try {
        let res: Response;
        switch (action) {
          case "update-profile":
            res = await fetch(`/api/douyin/bloggers/${slug}/update-profile`, {
              method: "POST",
            });
            break;
          case "scan":
            res = await fetch(`/api/douyin/bloggers/${slug}/scan`, {
              method: "POST",
            });
            break;
          case "transcribe":
            res = await fetch(`/api/douyin/bloggers/${slug}/transcribe`, {
              method: "POST",
            });
            break;
          case "summarize":
            res = await fetch(`/api/douyin/bloggers/${slug}/summarize`, {
              method: "POST",
            });
            break;
          case "evaluate":
            res = await fetch(`/api/douyin/bloggers/${slug}/evaluate`, {
              method: "POST",
            });
            break;
          default:
            continue;
        }
        if (res.ok) succeeded++;
        else failed++;
      } catch {
        failed++;
      }
    }

    const actionLabels: Record<ToolbarAction, string> = {
      "update-profile": "更新博主信息",
      scan: "更新博主视频",
      transcribe: "转写视频",
      summarize: "提取观点",
      evaluate: "评判",
    };

    setMessage(
      `「${actionLabels[action]}」完成：${succeeded} 成功${
        failed > 0 ? `，${failed} 失败` : ""
      }`
    );

    setSelectedIds(new Set());
    setExpandedId(null);
    setWorksCache({});

    // Refresh blogger list and data
    await fetchBloggers();
    setProcessingAction(null);
  };

  // --- Paginate bloggers on client side ---
  const pagedBloggers = bloggers.slice(
    bloggerPage * BLOGGERS_PER_PAGE,
    (bloggerPage + 1) * BLOGGERS_PER_PAGE
  );

  const handlePageChange = (newPage: number) => {
    setBloggerPage(newPage);
    setSelectedIds(new Set());
    setExpandedId(null);
    setWorksCache({});
  };

  const clearMessage = () => setMessage("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Radio className="h-4 w-4" />
          抖音雷达管理
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toolbar */}
        <BloggerToolbar
          selectedCount={selectedIds.size}
          totalCount={bloggers.length}
          onAction={handleToolbarAction}
          processingAction={processingAction}
          onBloggerAdded={() => {
            fetchBloggers();
            setExpandedId(null);
            setWorksCache({});
          }}
        />

        {/* 评判控制区 */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">准确度评判</h3>
            {evalAllLoading && (
              <span className="text-xs text-muted-foreground animate-pulse">入队中...</span>
            )}
          </div>

          {/* 进度条 */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">评判进度：</span>
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">完成 {evalProgress.done ?? 0}</span>
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">队列 {evalProgress.pending ?? 0}</span>
            <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">处理中 {evalProgress.processing ?? 0}</span>
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">失败 {evalProgress.failed ?? 0}</span>
            <span className="text-muted-foreground text-xs">共 {evalProgress.total ?? 0} 可评判作品</span>
          </div>

          {/* 按钮行 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleEvalAll}
              disabled={evalAllLoading}
              className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              立即评判全部
            </button>

            {/* Cron 配置 */}
            <div className="ml-0 sm:ml-4 flex flex-wrap items-center gap-2">
              <label className="text-sm text-muted-foreground">定时：</label>
              <input
                type="text"
                value={evalCron}
                onChange={(e) => setEvalCron(e.target.value)}
                className="border-input bg-background w-32 rounded-md border px-2 py-1 text-sm font-mono"
                placeholder="5 17 * * 1-5"
              />
              <select
                onChange={(e) => e.target.value && setEvalCron(e.target.value)}
                className="border-input bg-background rounded-md border px-2 py-1 text-sm"
                defaultValue=""
              >
                <option value="" disabled>快捷预设</option>
                {CRON_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <label className="inline-flex items-center gap-1 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={evalEnabled}
                  onChange={(e) => setEvalEnabled(e.target.checked)}
                  className="h-4 w-4 rounded accent-primary"
                />
                启用
              </label>
              <button
                onClick={handleSaveSchedule}
                disabled={saving}
                className="hover:bg-muted rounded-md px-2 py-1 text-sm border transition-colors disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
              <span className="text-muted-foreground text-xs">{nextRun ? `下次：${nextRun}` : ""}</span>
            </div>
          </div>
        </div>

        {/* Feedback message */}
        {message && (
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 text-sm">
            <span className="text-muted-foreground">{message}</span>
            <button
              onClick={clearMessage}
              className="text-muted-foreground hover:text-foreground ml-2 text-base leading-none"
            >
              ×
            </button>
          </div>
        )}

        {/* Blogger table */}
        <BloggerTable
          bloggers={pagedBloggers}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onDelete={handleDelete}
          onExpand={handleExpand}
          expandedId={expandedId}
          worksCache={worksCache}
          loadingWorks={loadingWorks}
          onTranscribe={handleTranscribe}
          onSummarize={handleSummarize}
          loading={loadingBloggers}
          page={bloggerPage}
          onPageChange={handlePageChange}
          total={bloggerTotal}
        />
      </CardContent>
    </Card>
  );
}
