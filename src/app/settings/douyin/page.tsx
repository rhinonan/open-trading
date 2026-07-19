"use client";

import { useState, useEffect, useCallback } from "react";
import { Radio, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BloggerSidebar } from "./BloggerSidebar";
import { WorksTable } from "./WorksTable";
import { WorkDrawer } from "./WorkDrawer";
import { AddBloggerDialog } from "./AddBloggerDialog";
import type { DouyinBlogger, WorkWithBlogger } from "@/types";

export default function DouyinSettingsPage() {
  const [bloggers, setBloggers] = useState<DouyinBlogger[]>([]);
  const [loadingBloggers, setLoadingBloggers] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [drawerWork, setDrawerWork] = useState<WorkWithBlogger | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const showMessage = useCallback((text: string, type: "success" | "error") => {
    setMessage(text);
    setMessageType(type);
  }, []);

  // ── Fetch bloggers ──────────────────────────────────────

  const fetchBloggers = useCallback(async () => {
    setLoadingBloggers(true);
    try {
      const res = await fetch("/api/douyin/bloggers?include=latest_opinion");
      if (res.ok) setBloggers(await res.json());
    } catch {
      // network error
    }
    setLoadingBloggers(false);
  }, []);

  useEffect(() => {
    fetchBloggers();
  }, [fetchBloggers]);

  // ── Blogger actions ─────────────────────────────────────

  const handleScan = async (blogger: DouyinBlogger) => {
    showMessage("", "success");
    try {
      const res = await fetch(`/api/douyin/bloggers/${blogger.slug}/scan`, {
        method: "POST",
      });
      if (res.ok) {
        showMessage(`已扫描「${blogger.nickname}」`, "success");
      } else {
        const data = await res.json();
        showMessage(`扫描失败: ${data.error || "未知错误"}`, "error");
      }
    } catch {
      showMessage("扫描请求失败", "error");
    }
  };

  const handleDelete = async (blogger: DouyinBlogger) => {
    if (!confirm(`确定删除博主「${blogger.nickname}」及其所有作品？`)) return;
    try {
      const res = await fetch(`/api/douyin/bloggers/${blogger.slug}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showMessage(`已删除「${blogger.nickname}」`, "success");
        if (selectedSlug === blogger.slug) setSelectedSlug(null);
        fetchBloggers();
      } else {
        showMessage("删除失败", "error");
      }
    } catch {
      showMessage("删除失败", "error");
    }
  };

  // ── Render ──────────────────────────────────────────────

  return (
    <Card className="h-[calc(100vh-8rem)] flex flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Radio className="h-4 w-4" />
          抖音雷达管理
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex min-h-0 p-0">
        {/* Left: Blogger sidebar */}
        <BloggerSidebar
          bloggers={bloggers}
          loading={loadingBloggers}
          selectedSlug={selectedSlug}
          onSelect={setSelectedSlug}
          onScan={handleScan}
          onDelete={handleDelete}
          onAdd={() => setAddDialogOpen(true)}
        />

        {/* Right: Works table + drawer */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Message banner */}
          {message && (
            <div
              className={`flex items-center justify-between px-4 py-2 border-b text-sm shrink-0 ${
                messageType === "error"
                  ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                  : "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
              }`}
            >
              <span className="flex items-center gap-2">
                {message}
                {messageType === "success" && (
                  <a
                    href="/settings/agents"
                    target="_blank"
                    className="inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline"
                  >
                    查看 Agent 日志 <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </span>
              <button
                onClick={() => setMessage("")}
                className="opacity-60 hover:opacity-100 ml-2 text-lg leading-none"
              >
                ×
              </button>
            </div>
          )}

          <WorksTable
            bloggerSlug={selectedSlug}
            onOpenDrawer={setDrawerWork}
            onMessage={showMessage}
          />
        </div>

        <WorkDrawer
          work={drawerWork}
          onClose={() => setDrawerWork(null)}
        />

        <AddBloggerDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          onAdded={() => {
            setAddDialogOpen(false);
            fetchBloggers();
          }}
        />
      </CardContent>
    </Card>
  );
}
