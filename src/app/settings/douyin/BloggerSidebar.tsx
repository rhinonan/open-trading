"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Search, Radio, Trash2, Plus } from "lucide-react";
import type { DouyinBlogger } from "@/types";

interface BloggerSidebarProps {
  bloggers: DouyinBlogger[];
  loading: boolean;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onScan: (blogger: DouyinBlogger) => void;
  onDelete: (blogger: DouyinBlogger) => void;
  onAdd: () => void;
}

export function BloggerSidebar({
  bloggers,
  loading,
  selectedSlug,
  onSelect,
  onScan,
  onDelete,
  onAdd,
}: BloggerSidebarProps) {
  const [search, setSearch] = useState("");
  const filtered = bloggers.filter((b) =>
    b.nickname.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-60 shrink-0 border-r flex flex-col min-h-0">
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-7 h-8 text-sm"
            placeholder="搜索博主…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 rounded" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground text-center">
            {search ? "无匹配博主" : "暂无博主"}
          </div>
        ) : (
          filtered.map((b) => (
            <div
              key={b.id}
              onClick={() => onSelect(b.slug)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer group transition-colors ${
                selectedSlug === b.slug ? "bg-accent" : "hover:bg-muted/50"
              }`}
            >
              {b.avatarUrl ? (
                <img
                  src={b.avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{b.nickname}</p>
                <p className="text-xs text-muted-foreground">
                  {(b.followerCount ?? 0).toLocaleString()} 粉丝
                </p>
              </div>
              <div className="hidden group-hover:flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button className="inline-flex shrink-0 items-center justify-center rounded-md hover:bg-accent h-6 w-6" />
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onScan(b);
                    }}
                  >
                    <Radio className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent>扫描新作品</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button className="inline-flex shrink-0 items-center justify-center rounded-md hover:bg-accent h-6 w-6" />
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(b);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </TooltipTrigger>
                  <TooltipContent>删除博主</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add blogger button */}
      <div className="p-2 border-t shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={onAdd}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          添加博主
        </Button>
      </div>
    </div>
  );
}
