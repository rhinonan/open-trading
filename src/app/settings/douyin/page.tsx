"use client";

import { useState, useEffect, useCallback } from "react";
import { Radio } from "lucide-react";
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
  const [addDialogOpen, setAddDialogOpen] = useState(false);

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
    setMessage("");
    try {
      const res = await fetch(`/api/douyin/bloggers/${blogger.slug}/scan`, {
        method: "POST",
      });
      if (res.ok) {
        setMessage(`已扫描「${blogger.nickname}」`);
      } else {
        const data = await res.json();
        setMessage(`扫描失败: ${data.error || "未知错误"}`);
      }
    } catch {
      setMessage("扫描请求失败");
    }
  };

  const handleDelete = async (blogger: DouyinBlogger) => {
    if (!confirm(`确定删除博主「${blogger.nickname}」及其所有作品？`)) return;
    try {
      const res = await fetch(`/api/douyin/bloggers/${blogger.slug}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMessage(`已删除「${blogger.nickname}」`);
        if (selectedSlug === blogger.slug) setSelectedSlug(null);
        fetchBloggers();
      } else {
        setMessage("删除失败");
      }
    } catch {
      setMessage("删除失败");
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
            <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b text-sm shrink-0">
              <span className="text-muted-foreground">{message}</span>
              <button
                onClick={() => setMessage("")}
                className="text-muted-foreground hover:text-foreground ml-2"
              >
                ×
              </button>
            </div>
          )}

          <WorksTable
            bloggerSlug={selectedSlug}
            onOpenDrawer={setDrawerWork}
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
