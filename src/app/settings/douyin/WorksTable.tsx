"use client";

import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { WorkRow } from "./WorkRow";
import type { WorkWithBlogger, WorksResponse } from "@/types";

export type MessageOpts = { agentLog?: boolean };

interface WorksTableProps {
  bloggerSlug: string | null;
  onOpenDrawer: (work: WorkWithBlogger) => void;
  onMessage: (
    text: string,
    type: "success" | "error",
    opts?: MessageOpts
  ) => void;
  /** page 递增此值触发 fetchWorks(page) */
  refreshKey?: number;
}

type ActionKind = "transcribe" | "summarize" | "evaluate";

export function WorksTable({
  bloggerSlug,
  onOpenDrawer,
  onMessage,
  refreshKey,
}: WorksTableProps) {
  const [data, setData] = useState<WorksResponse | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const setActionLoading = (workId: number, action: ActionKind, v: boolean) => {
    const key = `${workId}:${action}`;
    setLoadingActions((prev) => (prev[key] === v ? prev : { ...prev, [key]: v }));
  };

  // Clear selection when blogger changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [bloggerSlug]);

  const pageIds = data?.works.map((w) => w.id) ?? [];
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
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

  // External refresh (scan / bulk ops) — only when refreshKey bumps
  useEffect(() => {
    if (refreshKey == null || refreshKey === 0) return;
    if (bloggerSlug) fetchWorks(page);
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: refreshKey trigger only

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
        onMessage(`「${labels[kind]}」已入队`, "success", {
          agentLog: true,
        });
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

  const batch = async (actionKind: ActionKind) => {
    const workIds = Array.from(selectedIds);
    if (workIds.length === 0 || batchLoading) return;
    setBatchLoading(true);
    try {
      const res = await fetch("/api/douyin/works/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workIds, action: actionKind }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        onMessage(
          `批量完成：成功 ${body.succeeded}/${body.total}` +
            (body.failed ? `，失败 ${body.failed}` : ""),
          body.failed ? "error" : "success",
          { agentLog: true }
        );
        setSelectedIds(new Set());
        fetchWorks(page);
      } else {
        onMessage(body.error || "批量失败", "error");
      }
    } catch {
      onMessage("批量请求失败", "error");
    }
    setBatchLoading(false);
  };

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
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b text-sm bg-muted/30 shrink-0">
          <span>已选 {selectedIds.size} 项</span>
          <Button
            size="sm"
            variant="outline"
            disabled={batchLoading}
            onClick={() => batch("transcribe")}
          >
            批量转写
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={batchLoading}
            onClick={() => batch("summarize")}
          >
            批量提取观点
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={batchLoading}
            onClick={() => batch("evaluate")}
          >
            批量评判
          </Button>
        </div>
      )}

      {/* 不用 Table 根组件（会包一层 overflow-x-auto），以免 sticky 表头失效 */}
      <div className="flex-1 overflow-auto">
        <table data-slot="table" className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow className="text-xs text-muted-foreground sticky top-0 bg-background z-10 hover:bg-background">
              <TableHead className="w-8 pl-2">
                <Checkbox
                  checked={allPageSelected}
                  onCheckedChange={togglePage}
                  aria-label="全选本页"
                />
              </TableHead>
              <TableHead className="pl-2">描述</TableHead>
              <TableHead className="w-16">类型</TableHead>
              <TableHead className="w-16">时长</TableHead>
              <TableHead className="w-20">转写</TableHead>
              <TableHead className="w-32">观点</TableHead>
              <TableHead className="w-28">评判</TableHead>
              <TableHead className="pr-4 w-36">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data && data.works.length > 0 ? (
              data.works.map((w) => (
                <WorkRow
                  key={w.id}
                  work={w}
                  selected={selectedIds.has(w.id)}
                  onToggleSelect={() => toggleOne(w.id)}
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
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-12 text-muted-foreground whitespace-normal"
                >
                  暂无作品
                </TableCell>
              </TableRow>
            )}
          </TableBody>
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
