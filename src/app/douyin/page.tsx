"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, TrendingUp, Wrench, Settings } from "lucide-react";
import type { DouyinBloggerWithOpinion } from "@/types";

const categoryConfig: Record<string, { label: string; icon: typeof TrendingUp }> = {
  predictor: { label: "预测类", icon: TrendingUp },
  technical: { label: "技术类", icon: Wrench },
};

export default function DouyinPage() {
  const [bloggers, setBloggers] = useState<DouyinBloggerWithOpinion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"predictor" | "technical">("predictor");

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/douyin/bloggers?include=latest_opinion");
      if (res.ok) setBloggers(await res.json());
      setLoading(false);
    }
    load();
  }, []);

  const filtered = bloggers.filter((b) => b.category === activeTab);
  const predictorCount = bloggers.filter((b) => b.category === "predictor").length;
  const technicalCount = bloggers.filter((b) => b.category === "technical").length;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">抖音雷达</h1>
        <p className="text-muted-foreground mt-1">
          追踪抖音财经博主观点与预测
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{predictorCount}</p>
                <p className="text-sm text-muted-foreground">预测类博主</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Wrench className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{technicalCount}</p>
                <p className="text-sm text-muted-foreground">技术类博主</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 分类 Tab */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab("predictor")}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === "predictor"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          预测类
          {predictorCount > 0 && (
            <span className="text-xs bg-muted-foreground/20 px-1.5 py-0.5 rounded-full">
              {predictorCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("technical")}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === "technical"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Wrench className="h-4 w-4" />
          技术类
          {technicalCount > 0 && (
            <span className="text-xs bg-muted-foreground/20 px-1.5 py-0.5 rounded-full">
              {technicalCount}
            </span>
          )}
        </button>
      </div>

      {/* 博主列表 */}
      {filtered.length === 0 ? (
        <Card className="flex items-center justify-center min-h-[200px] border-dashed">
          <CardContent className="text-center py-12">
            <Radio className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-muted-foreground">
              {bloggers.length === 0
                ? "暂无博主，请前往设置页添加"
                : `暂无${activeTab === "predictor" ? "预测类" : "技术类"}博主`}
            </p>
            {bloggers.length === 0 && (
              <Link
                href="/settings"
                className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Settings className="h-3 w-3" />
                前往设置 &gt; 抖音雷达管理
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((blogger) => {
            const cat = categoryConfig[blogger.category] || categoryConfig.predictor;
            const CatIcon = cat.icon;

            return (
              <Link key={blogger.id} href={`/douyin/${blogger.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start gap-4">
                      {/* 头像 */}
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
                        {/* 博主信息行 */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold truncate">
                            {blogger.nickname}
                          </span>
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            <CatIcon className="h-3 w-3 mr-1" />
                            {cat.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {blogger.followerCount.toLocaleString()} 粉丝
                          </span>
                        </div>

                        {/* 最新观点 */}
                        {blogger.latestOpinion ? (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {blogger.latestOpinion}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground/50 italic mt-1">
                            暂无观点
                          </p>
                        )}

                        {/* 底部时间 */}
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
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 相对时间格式化 */
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
