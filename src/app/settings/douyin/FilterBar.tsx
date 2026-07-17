"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDownIcon } from "lucide-react";
import type { DouyinBlogger, FilterCounts } from "@/types";
import { useState, useEffect } from "react";

const TRANSCRIPT_STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "⏳ 待处理" },
  { value: "processing", label: "🔄 转写中" },
  { value: "done", label: "✅ 已转写" },
  { value: "failed", label: "❌ 失败" },
];

const JUDGMENT_OPTIONS = [
  { value: "", label: "全部评判" },
  { value: "correct", label: "✅ 正确" },
  { value: "mostly_correct", label: "💚 基本正确" },
  { value: "incorrect", label: "❌ 不正确" },
  { value: "not_applicable", label: "➖ 不涉及" },
];

export function FilterBar({
  bloggers,
  filters,
  filterCounts,
  selectedCount,
  onFilterChange,
  onBatchTranscribe,
  onBatchSummarize,
}: {
  bloggers: DouyinBlogger[];
  filters: {
    bloggerSlugs: string[];
    transcriptStatus: string;
    judgment: string;
    search: string;
  };
  filterCounts: FilterCounts | null;
  selectedCount: number;
  onFilterChange: (key: string, value: string) => void;
  onBatchTranscribe: () => void;
  onBatchSummarize: () => void;
}) {
  const [searchInput, setSearchInput] = useState(filters.search);

  const selectedSlugs = filters.bloggerSlugs;
  const allSelected = bloggers.length > 0 && selectedSlugs.length === bloggers.length;

  const bloggerTriggerLabel =
    selectedSlugs.length === 0
      ? "👤 全部博主"
      : selectedSlugs.length === 1
        ? bloggers.find((b) => b.slug === selectedSlugs[0])?.nickname || "..."
        : `${selectedSlugs.length} 位博主`;

  const toggleBlogger = (slug: string, checked: boolean) => {
    const next = checked
      ? [...selectedSlugs, slug]
      : selectedSlugs.filter((s) => s !== slug);
    onFilterChange("bloggerSlugs", next.join(","));
  };

  const toggleSelectAll = () => {
    onFilterChange(
      "bloggerSlugs",
      allSelected ? "" : bloggers.map((b) => b.slug).join(",")
    );
  };

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onFilterChange("search", searchInput);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search, onFilterChange]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Blogger multi-select */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 w-[160px] items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50">
            <span className="truncate">{bloggerTriggerLabel}</span>
            <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-auto min-w-(--anchor-width)">
            <DropdownMenuItem closeOnClick={false} onClick={toggleSelectAll}>
              {allSelected ? "取消全选" : "全选"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {bloggers.map((b) => (
              <DropdownMenuCheckboxItem
                key={b.slug}
                checked={selectedSlugs.includes(b.slug)}
                onCheckedChange={(checked: boolean) => toggleBlogger(b.slug, checked)}
                closeOnClick={false}
              >
                {b.nickname} ({(b.followerCount ?? 0).toLocaleString()}粉)
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Transcript status */}
        <Select
          value={filters.transcriptStatus}
          onValueChange={(v: string | null) => onFilterChange("transcriptStatus", v ?? "")}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue>📋 {TRANSCRIPT_STATUS_OPTIONS.find((o) => o.value === filters.transcriptStatus)?.label || "全部状态"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TRANSCRIPT_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
                {opt.value && filterCounts?.transcriptStatus[opt.value]
                  ? ` (${filterCounts.transcriptStatus[opt.value]})`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Judgment filter */}
        <Select
          value={filters.judgment}
          onValueChange={(v: string | null) => onFilterChange("judgment", v ?? "")}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue>📊 {JUDGMENT_OPTIONS.find((o) => o.value === filters.judgment)?.label || "全部评判"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {JUDGMENT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
                {opt.value && filterCounts?.judgment[opt.value]
                  ? ` (${filterCounts.judgment[opt.value]})`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="🔍 搜索视频描述..."
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Batch action bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent/50 text-sm">
          <span className="text-muted-foreground">已选 {selectedCount} 项</span>
          <span className="text-muted-foreground">→</span>
          <button
            onClick={onBatchTranscribe}
            className="px-2.5 py-1 rounded-md bg-background border hover:bg-accent transition-colors text-sm"
          >
            🎤 批量转写
          </button>
          <button
            onClick={onBatchSummarize}
            className="px-2.5 py-1 rounded-md bg-background border hover:bg-accent transition-colors text-sm"
          >
            📝 批量提取观点
          </button>
        </div>
      )}
    </div>
  );
}
