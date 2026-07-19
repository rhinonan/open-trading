"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Radio, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BloggerSidebar } from "./BloggerSidebar";
import { WorksTable } from "./WorksTable";
import { WorkDrawer } from "./WorkDrawer";
import { AddBloggerDialog } from "./AddBloggerDialog";
import { OpsToolbar } from "./OpsToolbar";
import { EvalStatusBar } from "./EvalStatusBar";
import type { DouyinBlogger, WorkWithBlogger } from "@/types";

type MessageOpts = { agentLog?: boolean };

export default function DouyinSettingsPage() {
  const [bloggers, setBloggers] = useState<DouyinBlogger[]>([]);
  const [loadingBloggers, setLoadingBloggers] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [drawerWork, setDrawerWork] = useState<WorkWithBlogger | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [messageAgentLog, setMessageAgentLog] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const showMessage = useCallback(
    (text: string, type: "success" | "error", opts?: MessageOpts) => {
      setMessage(text);
      setMessageType(type);
      setMessageAgentLog(opts?.agentLog === true);
    },
    []
  );

  // ── Fetch bloggers ──────────────────────────────────────

  const fetchBloggers = useCallback(async () => {
    setLoadingBloggers(true);
    try {
      // 运维列表需含停用博主；勿带 include=latest_opinion（该模式会过滤 disabled）
      const res = await fetch("/api/douyin/bloggers");
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
    showMessage("", "success", { agentLog: false });
    try {
      const res = await fetch(`/api/douyin/bloggers/${blogger.slug}/scan`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false) {
        const newWorks = data.newWorks ?? 0;
        showMessage(
          `已扫描「${blogger.nickname}」：新增 ${newWorks} 条`,
          "success",
          { agentLog: false }
        );
        setRefreshKey((k) => k + 1);
      } else {
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
        showMessage(`已删除「${blogger.nickname}」`, "success", {
          agentLog: false,
        });
        if (selectedSlug === blogger.slug) setSelectedSlug(null);
        fetchBloggers();
      } else {
        showMessage("删除失败", "error");
      }
    } catch {
      showMessage("删除失败", "error");
    }
  };

  const handleUpdateProfile = async (blogger: DouyinBlogger) => {
    try {
      const res = await fetch(
        `/api/douyin/bloggers/${blogger.slug}/update-profile`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showMessage(`已更新「${blogger.nickname}」资料`, "success", {
          agentLog: false,
        });
        fetchBloggers();
      } else {
        showMessage(data.error || "更新资料失败", "error");
      }
    } catch {
      showMessage("更新资料请求失败", "error");
    }
  };

  const handleToggleDisabled = async (blogger: DouyinBlogger) => {
    const next = blogger.disabled === 0;
    try {
      const res = await fetch(`/api/douyin/bloggers/${blogger.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: next }),
      });
      if (res.ok) {
        showMessage(
          next
            ? `已停用「${blogger.nickname}」`
            : `已启用「${blogger.nickname}」`,
          "success",
          { agentLog: false }
        );
        fetchBloggers();
      } else {
        showMessage("切换停用状态失败", "error");
      }
    } catch {
      showMessage("切换停用状态失败", "error");
    }
  };

  // ── Render ──────────────────────────────────────────────

  return (
    <Card className="h-[calc(100vh-8rem)] flex flex-col">
      <CardHeader className="shrink-0 space-y-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Radio className="h-4 w-4" />
          抖音雷达管理
          <Link
            href="/settings/schedule"
            className="ml-auto text-xs font-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            调度
          </Link>
        </CardTitle>
        <OpsToolbar
          bloggers={bloggers}
          onAdd={() => setAddDialogOpen(true)}
          onMessage={showMessage}
          onScanComplete={() => {
            setRefreshKey((k) => k + 1);
            fetchBloggers();
          }}
        />
        <EvalStatusBar />
      </CardHeader>
      <CardContent className="flex-1 flex min-h-0 p-0">
        {/* Left: Blogger sidebar */}
        <BloggerSidebar
          bloggers={bloggers}
          loading={loadingBloggers}
          selectedSlug={selectedSlug}
          onSelect={setSelectedSlug}
          onScan={handleScan}
          onUpdateProfile={handleUpdateProfile}
          onToggleDisabled={handleToggleDisabled}
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
                  ? "bg-danger/10 text-danger"
                  : "bg-success/10 text-success"
              }`}
            >
              <span className="flex items-center gap-2">
                {message}
                {messageAgentLog && (
                  <a
                    href="/agents/logs"
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
            refreshKey={refreshKey}
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
