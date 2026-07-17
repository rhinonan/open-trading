"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { WorkRow } from "./WorkRow";
import { useState } from "react";
import type { WorkWithBlogger } from "@/types";

export function WorksTable({
  works,
  total,
  page,
  perPage,
  selectedIds,
  onToggle,
  onToggleAll,
  onTranscribe,
  onSummarize,
  onPageChange,
  loading,
}: {
  works: WorkWithBlogger[];
  total: number;
  page: number;
  perPage: number;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (allIds: number[]) => void;
  onTranscribe: (id: number) => void;
  onSummarize: (id: number) => void;
  onPageChange: (page: number) => void;
  loading: boolean;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const allCurrentIds = works.map((w) => w.id);
  const allSelected = works.length > 0 && works.every((w) => selectedIds.has(w.id));

  if (loading) {
    return (
      <div className="space-y-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded" />
        ))}
      </div>
    );
  }

  if (works.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3">📭</div>
        <p className="text-muted-foreground">暂无视频数据</p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          请先添加博主并执行扫描
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
                  onChange={() => onToggleAll(allCurrentIds)}
                  className="h-4 w-4 rounded accent-primary cursor-pointer"
                />
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">
                博主
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">
                视频
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground whitespace-nowrap">
                发布时间
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">
                转写状态
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">
                观点状态
              </th>
              <th className="py-2.5 text-sm font-medium text-muted-foreground">
                评判结果
              </th>
              <th className="py-2.5 pr-4 text-sm font-medium text-muted-foreground">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {works.map((work) => (
              <WorkRow
                key={work.id}
                work={work}
                selected={selectedIds.has(work.id)}
                onToggle={onToggle}
                onTranscribe={onTranscribe}
                onSummarize={onSummarize}
                onExpand={setExpandedId}
                isExpanded={expandedId === work.id}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t">
        <span className="text-sm text-muted-foreground">
          共 {total} 条
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 0}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← 上一页
          </button>
          <span className="text-sm text-muted-foreground">
            第 {page + 1}/{totalPages} 页
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下一页 →
          </button>
        </div>
      </div>
    </div>
  );
}
