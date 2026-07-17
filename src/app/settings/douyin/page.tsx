"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Radio,
  RefreshCw,
  Mic,
  Loader2,
  BarChart3,
  UserPlus,
} from "lucide-react";
import { FilterBar } from "./FilterBar";
import { WorksTable } from "./WorksTable";
import { AddBloggerDialog } from "./AddBloggerDialog";
import type {
  DouyinBlogger,
  WorkWithBlogger,
  WorksResponse,
} from "@/types";

export default function DouyinSettingsPage() {
  // Data state
  const [bloggers, setBloggers] = useState<DouyinBlogger[]>([]);
  const [works, setWorks] = useState<WorkWithBlogger[]>([]);
  const [total, setTotal] = useState(0);
  const [filterCounts, setFilterCounts] = useState<WorksResponse["filterCounts"] | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [bloggerSlugs, setBloggerSlugs] = useState<string[]>([]);
  const [transcriptStatus, setTranscriptStatus] = useState("");
  const [judgment, setJudgment] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const perPage = 20;

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Operation state
  const [scanning, setScanning] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [message, setMessage] = useState("");

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Fetch bloggers for filter dropdown
  const fetchBloggers = useCallback(async () => {
    try {
      const res = await fetch("/api/douyin/bloggers");
      if (res.ok) setBloggers(await res.json());
    } catch {}
  }, []);

  // Fetch works
  const fetchWorks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (bloggerSlugs.length > 0) params.set("blogger_slugs", bloggerSlugs.join(","));
      if (transcriptStatus) params.set("transcript_status", transcriptStatus);
      if (judgment) params.set("judgment", judgment);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("perPage", String(perPage));

      const res = await fetch(`/api/douyin/works?${params}`);
      if (res.ok) {
        const data: WorksResponse = await res.json();
        setWorks(data.works);
        setTotal(data.total);
        setFilterCounts(data.filterCounts);
      }
    } catch {}
    setLoading(false);
  }, [bloggerSlugs, transcriptStatus, judgment, search, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-then-setState data loading
    fetchBloggers();
  }, [fetchBloggers]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-then-setState data loading
    fetchWorks();
  }, [fetchWorks]);

  // Filter change handler (stable identity so FilterBar's debounce timer
  // isn't reset by unrelated parent re-renders). Also resets pagination and
  // selection whenever any filter changes.
  const handleFilterChange = useCallback((key: string, value: string) => {
    switch (key) {
      case "bloggerSlugs":
        setBloggerSlugs(value ? [value] : []);
        break;
      case "transcriptStatus":
        setTranscriptStatus(value);
        break;
      case "judgment":
        setJudgment(value);
        break;
      case "search":
        setSearch(value);
        break;
    }
    setPage(0);
    setSelectedIds(new Set());
  }, []);

  // Selection handlers
  const handleToggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleAll = (allIds: number[]) => {
    setSelectedIds((prev) => {
      if (allIds.every((id) => prev.has(id))) {
        // Deselect all on current page
        const next = new Set(prev);
        allIds.forEach((id) => next.delete(id));
        return next;
      } else {
        // Select all on current page
        return new Set([...prev, ...allIds]);
      }
    });
  };

  // Single work operations
  const handleTranscribe = async (workId: number) => {
    setMessage("");
    try {
      const res = await fetch(`/api/douyin/works/${workId}/transcribe`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`转写任务已启动`);
        fetchWorks();
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
        setMessage(`观点已提取: ${data.summary?.slice(0, 50)}...`);
        fetchWorks();
      } else {
        setMessage(`观点提取失败: ${data.error}`);
      }
    } catch {
      setMessage("观点提取请求失败");
    }
  };

  // Batch operations
  const handleBatchTranscribe = async () => {
    setMessage("");
    try {
      const res = await fetch("/api/douyin/works/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workIds: Array.from(selectedIds),
          action: "transcribe",
        }),
      });
      const data = await res.json();
      setMessage(`批量转写完成: ${data.succeeded} 成功, ${data.failed} 失败`);
      setSelectedIds(new Set());
      fetchWorks();
    } catch {
      setMessage("批量转写请求失败");
    }
  };

  const handleBatchSummarize = async () => {
    setMessage("");
    try {
      const res = await fetch("/api/douyin/works/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workIds: Array.from(selectedIds),
          action: "summarize",
        }),
      });
      const data = await res.json();
      setMessage(`批量提取完成: ${data.succeeded} 成功, ${data.failed} 失败`);
      setSelectedIds(new Set());
      fetchWorks();
    } catch {
      setMessage("批量提取请求失败");
    }
  };

  // Global operations (preserved from old page)
  const handleScan = async () => {
    setScanning(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/scan", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`扫描完成：检查了 ${data.total} 个博主，发现 ${data.totalNewWorks} 条新作品`);
        fetchWorks();
      } else {
        setMessage(`扫描失败: ${data.error}`);
      }
    } catch {
      setMessage("扫描失败");
    }
    setScanning(false);
  };

  const handleTranscribeAll = async () => {
    setTranscribing(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/transcribe", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`转写完成：共 ${data.total} 条，成功 ${data.done} 条${data.failed > 0 ? `，失败 ${data.failed} 条` : ""}`);
        fetchWorks();
      } else {
        setMessage(`转写失败: ${data.error}`);
      }
    } catch {
      setMessage("转写请求失败");
    }
    setTranscribing(false);
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    setMessage("");
    try {
      const res = await fetch("/api/douyin/evaluate", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`评判完成：${data.totalBloggers} 个博主，共 ${data.totalPredictions} 条预测`);
        fetchWorks();
      } else {
        setMessage(`评判失败: ${data.error}`);
      }
    } catch {
      setMessage("评判请求失败");
    }
    setEvaluating(false);
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
        {/* Global action bar */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAddDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            添加博主
          </Button>
          <Button variant="outline" onClick={handleScan} disabled={scanning}>
            {scanning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            扫描全部
          </Button>
          <Button variant="outline" onClick={handleTranscribeAll} disabled={transcribing}>
            {transcribing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Mic className="h-4 w-4 mr-2" />
            )}
            全部转写
          </Button>
          <Button variant="outline" onClick={handleEvaluate} disabled={evaluating}>
            {evaluating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <BarChart3 className="h-4 w-4 mr-2" />
            )}
            收盘评判
          </Button>
        </div>

        {/* Filter bar */}
        <FilterBar
          bloggers={bloggers}
          filters={{ bloggerSlugs, transcriptStatus, judgment, search }}
          filterCounts={filterCounts}
          selectedCount={selectedIds.size}
          onFilterChange={handleFilterChange}
          onBatchTranscribe={handleBatchTranscribe}
          onBatchSummarize={handleBatchSummarize}
        />

        {/* Feedback message */}
        {message && (
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 text-sm">
            <span className="text-muted-foreground">{message}</span>
            <button
              onClick={clearMessage}
              className="text-muted-foreground hover:text-foreground ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Works table */}
        <WorksTable
          works={works}
          total={total}
          page={page}
          perPage={perPage}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
          onTranscribe={handleTranscribe}
          onSummarize={handleSummarize}
          onPageChange={setPage}
          loading={loading}
        />
      </CardContent>

      {/* Add blogger dialog */}
      <AddBloggerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdded={() => {
          fetchBloggers();
          fetchWorks();
        }}
      />
    </Card>
  );
}
