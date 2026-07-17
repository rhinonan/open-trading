"use client";

import { useState } from "react";
import { VideoSubRow } from "./VideoSubRow";
import {
  FileVideo,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { WorkWithBlogger } from "@/types";

const SUB_PER_PAGE = 10;

export function VideoSubTable({
  works,
  onTranscribe,
  onSummarize,
}: {
  works: WorkWithBlogger[];
  onTranscribe: (id: number) => void;
  onSummarize: (id: number) => void;
}) {
  const [subPage, setSubPage] = useState(0);
  const totalSubPages = Math.max(1, Math.ceil(works.length / SUB_PER_PAGE));
  const pagedWorks = works.slice(subPage * SUB_PER_PAGE, (subPage + 1) * SUB_PER_PAGE);

  // Reset sub-page when works change
  if (subPage >= totalSubPages && subPage > 0) {
    setSubPage(0);
  }

  if (works.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
        <FileVideo className="h-4 w-4" />
        暂无视频数据
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/10 text-left">
              <th className="pl-6 py-2 text-xs font-medium text-muted-foreground">标题</th>
              <th className="py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">发布时间</th>
              <th className="py-2 text-xs font-medium text-muted-foreground">转写状态</th>
              <th className="py-2 text-xs font-medium text-muted-foreground">观点状态</th>
              <th className="py-2 text-xs font-medium text-muted-foreground">评判结果</th>
              <th className="py-2 pr-4 text-xs font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {pagedWorks.map((work) => (
              <VideoSubRow
                key={work.id}
                work={work}
                onTranscribe={onTranscribe}
                onSummarize={onSummarize}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 子表分页 */}
      {works.length > SUB_PER_PAGE && (
        <div className="flex items-center justify-between px-6 py-2 border-t border-muted/30">
          <span className="text-xs text-muted-foreground">
            共 {works.length} 条
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSubPage(subPage - 1)}
              disabled={subPage <= 0}
              className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs text-muted-foreground">
              {subPage + 1}/{totalSubPages}
            </span>
            <button
              onClick={() => setSubPage(subPage + 1)}
              disabled={subPage >= totalSubPages - 1}
              className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
