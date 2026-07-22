"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, Settings } from "lucide-react";
import { formatFollowerCount } from "@/lib/utils";
import type { DouyinBloggerWithOpinion, SortDimension } from "@/types";

const SORT_OPTIONS: { key: SortDimension; label: string }[] = [
  { key: "followers", label: "粉丝数" },
  { key: "recent", label: "最近更新" },
  { key: "accuracy", label: "准确率" },
];

export default function DouyinPage() {
  const [bloggers, setBloggers] = useState<DouyinBloggerWithOpinion[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortDimension>("followers");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/douyin/bloggers?include=latest_opinion");
        if (res.ok) setBloggers(await res.json());
      } catch {
        // network error — show empty state
      }
      setLoading(false);
    }
    load();
  }, []);

  const sorted = useMemo(() => {
    const list = [...bloggers];
    switch (sortBy) {
      case "followers":
        list.sort((a, b) => b.followerCount - a.followerCount);
        break;
      case "recent":
        list.sort(
          (a, b) => (b.latestWorkAt ?? 0) - (a.latestWorkAt ?? 0)
        );
        break;
      case "accuracy":
        list.sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1));
        break;
    }
    return list;
  }, [bloggers, sortBy]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 排序栏 */}
      <div className="flex gap-2 border-b pb-2">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              sortBy === opt.key
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {opt.label}
            {sortBy === opt.key && " ▼"}
          </button>
        ))}
      </div>

      {/* 博主列表 */}
      {sorted.length === 0 ? (
        <Card className="flex items-center justify-center min-h-[200px] border-dashed">
          <CardContent className="text-center py-12">
            <Radio className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-muted-foreground">
              暂无博主，请前往设置页添加
            </p>
            <Link
              href="/settings"
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Settings className="h-3 w-3" />
              前往设置 &gt; 抖音雷达管理
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((blogger) => (
            <Link key={blogger.id} href={`/douyin/${blogger.slug}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start gap-4">
                    {blogger.avatarUrl ? (
                      <img
                        src={blogger.avatarUrl}
                        alt={blogger.nickname}
                        className="h-12 w-12 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Radio className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold truncate">
                          {blogger.nickname}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                          {formatFollowerCount(blogger.followerCount ?? 0)} 粉丝
                        </span>
                        {blogger.accuracy !== null && (
                          <Badge variant="secondary" className="shrink-0 text-xs tabular-nums">
                            准确率 {blogger.accuracy}%
                          </Badge>
                        )}
                      </div>

                      {blogger.latestOpinion ? (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {blogger.latestOpinion}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground/50 italic mt-1">
                          暂无观点
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground/60">
                          {blogger.latestWorkAt
                            ? formatRelativeTime(blogger.latestWorkAt)
                            : ""}
                        </span>
                        <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                          查看详情 →
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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
