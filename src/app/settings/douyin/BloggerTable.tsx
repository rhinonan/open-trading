"use client";

import { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Radio,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { BloggerRow } from "./BloggerRow";
import type { DouyinBlogger, WorkWithBlogger } from "@/types";

const BLOGGERS_PER_PAGE = 15;

export function BloggerTable({
  bloggers,
  selectedIds,
  onToggleSelect,
  onDelete,
  onExpand,
  expandedId,
  worksCache,
  loadingWorks,
  onTranscribe,
  onSummarize,
  loading,
  page,
  onPageChange,
  total,
}: {
  bloggers: DouyinBlogger[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onDelete: (slug: string) => void;
  onExpand: (id: number | null) => void;
  expandedId: number | null;
  worksCache: Record<number, WorkWithBlogger[]>;
  loadingWorks: boolean;
  onTranscribe: (id: number) => void;
  onSummarize: (id: number) => void;
  loading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / BLOGGERS_PER_PAGE));
  const allCurrentIds = bloggers.map((b) => b.id);
  const allSelected = bloggers.length > 0 && bloggers.every((b) => selectedIds.has(b.id));

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded" />
        ))}
      </div>
    );
  }

  // Empty state
  if (bloggers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-3 text-muted-foreground">
          <Radio className="h-10 w-10" />
        </div>
        <p className="text-muted-foreground">暂无博主数据</p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          请先添加抖音博主
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/30 text-left">
              <th className="pl-4 py-2.5 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => {
                    if (allSelected) {
                      allCurrentIds.forEach((id) => selectedIds.has(id) && onToggleSelect(id));
                    } else {
                      // Select all on current page
                      const toSelect = allCurrentIds.filter((id) => !selectedIds.has(id));
                      toSelect.forEach((id) => onToggleSelect(id));
                    }
                  }}
                  className="h-4 w-4 rounded cursor-pointer accent-primary"
                />
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">博主</th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">粉丝数</th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground whitespace-nowrap">最近更新</th>
              <th className="py-2.5 pr-4 text-sm font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {bloggers.map((blogger) => (
              <BloggerRow
                key={blogger.id}
                blogger={blogger}
                isExpanded={expandedId === blogger.id}
                selected={selectedIds.has(blogger.id)}
                onToggleSelect={onToggleSelect}
                onToggleExpand={onExpand}
                onDelete={onDelete}
                works={worksCache[blogger.id] || []}
                loadingWorks={loadingWorks && expandedId === blogger.id}
                onTranscribe={onTranscribe}
                onSummarize={onSummarize}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between px-4 py-3 border-t">
        <span className="text-sm text-muted-foreground">
          共 {total} 位博主
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 0}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            上一页
          </button>
          <span className="text-sm text-muted-foreground">
            第 {page + 1}/{totalPages} 页
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            下一页
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
