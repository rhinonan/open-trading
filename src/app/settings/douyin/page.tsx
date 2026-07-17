"use client";

import { useState, useEffect, useCallback } from "react";
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
        setMessage("转写任务已启动");
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
