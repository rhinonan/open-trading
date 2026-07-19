"use client";

import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { WorkRow } from "./WorkRow";
import type { WorkWithBlogger, WorksResponse } from "@/types";

interface WorksTableProps {
  bloggerSlug: string | null;
  onOpenDrawer: (work: WorkWithBlogger) => void;
  onMessage: (text: string, type: "success" | "error") => void;
}

type ActionKind = "transcribe" | "summarize" | "evaluate";

export function WorksTable({ bloggerSlug, onOpenDrawer, onMessage }: WorksTableProps) {
  const [data, setData] = useState<WorksResponse | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});

  const setActionLoading = (workId: number, action: ActionKind, v: boolean) => {
    const key = `${workId}:${action}`;
    setLoadingActions((prev) => (prev[key] === v ? prev : { ...prev, [key]: v }));
  };

  const fetchWorks = useCallback(
    async (p: number) => {
      if (!bloggerSlug) return;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/douyin/works?blogger_slugs=${encodeURIComponent(bloggerSlug)}&page=${p}&perPage=20`
        );
        if (res.ok) {
          const json: WorksResponse = await res.json();
          setData(json);
        }
      } catch {
        // network error — keep stale data
      }
      setLoading(false);
    },
    [bloggerSlug]
  );

  // Reset page and refetch when blogger changes
  useEffect(() => {
    setPage(0);
    setData(null);
    if (bloggerSlug) fetchWorks(0);
  }, [bloggerSlug, fetchWorks]);

  // Fetch when page changes (skip page 0 — handled by the effect above)
  useEffect(() => {
    if (page > 0) fetchWorks(page);
  }, [page, fetchWorks]);

  // Poll while any work is processing
  useEffect(() => {
    if (!data) return;
    const hasProcessing = data.works.some(
      (w) =>
        w.transcriptStatus === "processing" || w.judgment?.evalStatus === "processing"
    );
    if (!hasProcessing) return;
    const timer = setInterval(() => fetchWorks(page), 5000);
    return () => clearInterval(timer);
  }, [data, page, fetchWorks]);

  // ── Action handlers ──────────────────────────────────────

  const action = async (work: WorkWithBlogger, kind: ActionKind, endpoint: string) => {
    setActionLoading(work.id, kind, true);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        const labels: Record<ActionKind, string> = {
          transcribe: "转写",
          summarize: "观点提取",
          evaluate: "评判",
        };
        onMessage(
          `「${labels[kind]}」已入队 — `,
          "success"
        );
      } else {
        onMessage(body.error || `请求失败 (${res.status})`, "error");
      }
    } catch {
      onMessage("网络请求失败", "error");
    }
    setActionLoading(work.id, kind, false);
    fetchWorks(page);
  };

  const handleTranscribe = (work: WorkWithBlogger) =>
    action(work, "transcribe", `/api/douyin/works/${work.id}/transcribe`);

  const handleSummarize = (work: WorkWithBlogger) =>
    action(work, "summarize", `/api/douyin/works/${work.id}/summarize`);

  const handleEvaluate = (work: WorkWithBlogger) =>
    action(work, "evaluate", `/api/douyin/works/${work.id}/evaluate`);

  // ── Render ───────────────────────────────────────────────

  if (!bloggerSlug) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        请从左侧选择博主
      </div>
    );
  }

  const totalPages = data ? Math.ceil(data.total / data.perPage) : 0;

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-xs text-muted-foreground sticky top-0 bg-background z-10">
              <th className="text-left font-medium py-2 pl-4 w-10">封面</th>
              <th className="text-left font-medium py-2">描述</th>
              <th className="text-left font-medium py-2 w-16">类型</th>
              <th className="text-left font-medium py-2 w-16">时长</th>
              <th className="text-left font-medium py-2 w-20">转写</th>
              <th className="text-left font-medium py-2 w-32">观点</th>
              <th className="text-left font-medium py-2 w-28">评判</th>
              <th className="text-left font-medium py-2 pr-4 w-36">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="py-2 px-2">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data && data.works.length > 0 ? (
              data.works.map((w) => (
                <WorkRow
                  key={w.id}
                  work={w}
                  onDetail={() => onOpenDrawer(w)}
                  onTranscribe={() => handleTranscribe(w)}
                  onSummarize={() => handleSummarize(w)}
                  onEvaluate={() => handleEvaluate(w)}
                  loading={{
                    transcribe: !!loadingActions[`${w.id}:transcribe`],
                    summarize: !!loadingActions[`${w.id}:summarize`],
                    evaluate: !!loadingActions[`${w.id}:evaluate`],
                  }}
                />
              ))
            ) : (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-12 text-muted-foreground text-sm"
                >
                  暂无作品
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-3 border-t shrink-0">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
