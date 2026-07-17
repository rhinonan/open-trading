"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Loader2,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { VideoSubTable } from "./VideoSubTable";
import type { DouyinBlogger, WorkWithBlogger } from "@/types";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp * 1000;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(timestamp * 1000).toLocaleDateString("zh-CN");
}

function formatFollowerCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }
  return count.toLocaleString();
}

export function BloggerRow({
  blogger,
  isExpanded,
  selected,
  onToggleSelect,
  onToggleExpand,
  onDelete,
  works,
  loadingWorks,
  onTranscribe,
  onSummarize,
}: {
  blogger: DouyinBlogger;
  isExpanded: boolean;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onToggleExpand: (id: number | null) => void;
  onDelete: (slug: string) => void;
  works: WorkWithBlogger[];
  loadingWorks: boolean;
  onTranscribe: (id: number) => void;
  onSummarize: (id: number) => void;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <tr
        className={`border-b hover:bg-muted/30 transition-colors cursor-pointer ${
          selected ? "bg-accent/50" : ""
        } ${isExpanded ? "border-b-0 bg-muted/10" : ""}`}
      >
        {/* 复选框 */}
        <td className="pl-4 py-3 w-10">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(blogger.id)}
            className="h-4 w-4 rounded cursor-pointer accent-primary"
            onClick={(e) => e.stopPropagation()}
          />
        </td>

        {/* 头像 + 用户名 */}
        <td className="py-3 pr-3">
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              {blogger.avatarUrl ? (
                <AvatarImage src={blogger.avatarUrl} alt={blogger.nickname} />
              ) : null}
              <AvatarFallback>
                {blogger.nickname?.slice(0, 2) || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium truncate max-w-[140px]">
              {blogger.nickname}
            </span>
          </div>
        </td>

        {/* 粉丝数 */}
        <td className="py-3 pr-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {formatFollowerCount(blogger.followerCount)}
          </div>
        </td>

        {/* 最近更新时间 */}
        <td className="py-3 pr-3 text-sm text-muted-foreground whitespace-nowrap">
          <span title={new Date(blogger.updatedAt * 1000).toLocaleString("zh-CN")}>
            {formatRelativeTime(blogger.updatedAt)}
          </span>
        </td>

        {/* 操作 — 删除 + 展开 */}
        <td className="py-3 pr-4">
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteDialogOpen(true); }}
              className="p-1.5 rounded hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 transition-colors text-muted-foreground"
              title="删除博主"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(isExpanded ? null : blogger.id); }}
              className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
              title={isExpanded ? "收起视频" : "展开视频"}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          </div>
        </td>
      </tr>

      {/* 展开：视频子表 */}
      {isExpanded && (
        <tr>
          <td colSpan={5} className="bg-muted/5 border-b px-0 py-0">
            {loadingWorks ? (
              <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载视频中...
              </div>
            ) : (
              <VideoSubTable
                works={works}
                onTranscribe={onTranscribe}
                onSummarize={onSummarize}
              />
            )}
          </td>
        </tr>
      )}

      {/* 删除确认弹窗 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除博主</DialogTitle>
            <DialogDescription>
              确定要删除博主「{blogger.nickname}」吗？该博主的所有视频数据也会被一并删除，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button
              variant="default"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                onDelete(blogger.slug);
                setDeleteDialogOpen(false);
              }}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
