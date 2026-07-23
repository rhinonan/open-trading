"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Radio,
  Trash2,
  Plus,
  UserRound,
  Ban,
  Check,
  MoreVertical,
} from "lucide-react";
import type { DouyinBlogger } from "@/types";
import { formatFollowerCount } from "@/lib/utils";

interface BloggerSidebarProps {
  bloggers: DouyinBlogger[];
  loading: boolean;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onScan: (blogger: DouyinBlogger) => void;
  onUpdateProfile: (blogger: DouyinBlogger) => void;
  onToggleDisabled: (blogger: DouyinBlogger) => void;
  onDelete: (blogger: DouyinBlogger) => void;
  onAdd: () => void;
}

export function BloggerSidebar({
  bloggers,
  loading,
  selectedSlug,
  onSelect,
  onScan,
  onUpdateProfile,
  onToggleDisabled,
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
            filtered.map((b) => {
              const isDisabled = b.disabled === 1;
              return (
                <div
                  key={b.id}
                  onClick={() => onSelect(b.slug)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer group transition-colors ${
                    isDisabled ? "opacity-60" : ""
                  } ${
                    selectedSlug === b.slug ? "bg-accent" : "hover:bg-muted/50"
                  }`}
                >
                  <Avatar size="sm" className="shrink-0">
                    {b.avatarUrl ? (
                      <AvatarImage src={b.avatarUrl} alt="" />
                    ) : null}
                    <AvatarFallback>
                      <Radio className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {b.nickname}
                      {isDisabled && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          已停用
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFollowerCount(b.followerCount ?? 0)} 粉丝
                    </p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button
                            type="button"
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-accent"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="w-32"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onScan(b);
                          }}
                        >
                          <Radio className="h-3.5 w-3.5" />
                          扫描作品
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateProfile(b);
                          }}
                        >
                          <UserRound className="h-3.5 w-3.5" />
                          更新资料
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleDisabled(b);
                          }}
                        >
                          {isDisabled ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Ban className="h-3.5 w-3.5" />
                          )}
                          {isDisabled ? "启用博主" : "停用博主"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(b);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除博主
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })
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
