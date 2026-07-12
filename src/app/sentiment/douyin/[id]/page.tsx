"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2 } from "lucide-react";
import type {
  DouyinBlogger,
  DouyinEvaluation,
  DouyinWork,
  PredictionItem,
} from "@/types";

const typeLabels: Record<string, string> = {
  market_direction: "大盘方向",
  index_level: "指数点位",
  sector: "板块",
  stock_pick: "个股",
};

export default function BloggerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [blogger, setBlogger] = useState<DouyinBlogger | null>(null);
  const [records, setRecords] = useState<
    Array<DouyinEvaluation & { items: PredictionItem[] }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"records" | "trend" | "works">("records");
  const [works, setWorks] = useState<DouyinWork[]>([]);
  const [worksLoading, setWorksLoading] = useState(false);

  const loadWorks = useCallback(async () => {
    setWorksLoading(true);
    try {
      const res = await fetch(`/api/douyin/bloggers/${id}?include=works`);
      if (res.ok) {
        const data = await res.json();
        setWorks(data.works || []);
      }
    } catch {
      // silent fail
    }
    setWorksLoading(false);
  }, [id]);

  useEffect(() => {
    async function load() {
      const [bloggerRes, recordsRes] = await Promise.all([
        fetch(`/api/douyin/bloggers/${id}`),
        fetch(`/api/douyin/records?blogger_id=${id}`),
      ]);
      if (bloggerRes.ok) setBlogger(await bloggerRes.json());
      if (recordsRes.ok) setRecords(await recordsRes.json());
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!blogger) {
    return (
      <div className="space-y-6">
        <Link
          href="/sentiment/douyin"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Link>
        <p className="text-muted-foreground">博主不存在</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/sentiment/douyin"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-fit"
      >
        <ArrowLeft className="h-4 w-4" />
        返回列表
      </Link>

      {/* Blogger info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            {blogger.avatarUrl ? (
              <img
                src={blogger.avatarUrl}
                alt={blogger.nickname}
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-muted" />
            )}
            <div>
              <h1 className="text-xl font-bold">{blogger.nickname}</h1>
              <p className="text-sm text-muted-foreground">
                {blogger.signature || "暂无签名"}
              </p>
              <div className="flex items-center gap-3 mt-2">
                <Badge
                  variant={
                    blogger.category === "predictor"
                      ? "default"
                      : blogger.category === "non_predictor"
                        ? "outline"
                        : "secondary"
                  }
                >
                  {blogger.category === "predictor"
                    ? "预测型博主"
                    : blogger.category === "non_predictor"
                      ? "非预测型"
                      : "定位中..."}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {blogger.followerCount.toLocaleString()} 粉丝
                </span>
              </div>
              {blogger.classificationNote && (
                <p className="mt-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                  📝 {blogger.classificationNote}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setTab("records")}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            tab === "records"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          预测记录
        </button>
        <button
          onClick={() => setTab("trend")}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            tab === "trend"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          准确率趋势
        </button>
        <button
          onClick={() => { setTab("works"); loadWorks(); }}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            tab === "works"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          作品列表
        </button>
      </div>

      {/* Records Tab */}
      {tab === "records" && (
        <div className="space-y-4">
          {records.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">暂无评判记录</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  每日收盘后触发"收盘评判"即可生成记录
                </p>
              </CardContent>
            </Card>
          ) : (
            records.map((evaluation) => (
              <Card key={evaluation.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {evaluation.evalDate}
                    </CardTitle>
                    <Badge variant="secondary">
                      准确率 {evaluation.accuracyScore}%
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {evaluation.predictionSummary}
                  </p>
                </CardHeader>
                <CardContent>
                  {evaluation.items.length > 0 && (
                    <div className="space-y-3">
                      {evaluation.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 rounded-md border p-3 text-sm"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs h-5">
                                {typeLabels[item.predictionType] ||
                                  item.predictionType}
                              </Badge>
                              <span className="font-medium truncate">
                                {item.predictionTarget}
                              </span>
                            </div>
                            <p className="text-muted-foreground line-clamp-2">
                              &ldquo;{item.predictedContent}&rdquo;
                            </p>
                            <p className="mt-1 text-xs">
                              {item.isCorrect === 1 ? (
                                <span className="text-green-500">✅ 预测正确</span>
                              ) : item.isCorrect === 0 ? (
                                <span className="text-red-500">❌ 预测错误</span>
                              ) : (
                                <span className="text-yellow-500">
                                  ⏳ 待验证
                                </span>
                              )}
                              <span className="text-muted-foreground ml-2">
                                {item.judgment}
                              </span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Trend Tab */}
      {tab === "trend" && (
        <Card>
          <CardContent className="pt-6">
            {records.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                暂无数据，需要至少一次评判记录
              </p>
            ) : (
              <div className="space-y-4">
                {records.map((evaluation) => (
                  <div
                    key={evaluation.id}
                    className="flex items-center gap-4"
                  >
                    <span className="text-sm w-24 shrink-0">
                      {evaluation.evalDate}
                    </span>
                    <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{
                          width: `${Math.max(evaluation.accuracyScore, 4)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-10 text-right">
                      {evaluation.accuracyScore}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Works Tab */}
      {tab === "works" && (
        <div className="space-y-4">
          {worksLoading ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : works.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">暂无作品</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  扫描后将自动拉取作品并转写
                </p>
              </CardContent>
            </Card>
          ) : (
            works.map((work) => {
              const statusCfg = {
                pending: { label: "等待中", className: "bg-muted text-muted-foreground" },
                processing: { label: "转写中...", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
                done: { label: "已转写", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
                failed: { label: "转写失败", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
              }[work.transcriptStatus] || { label: work.transcriptStatus, className: "bg-muted" };

              let stats: Record<string, number> = {};
              try {
                stats = JSON.parse(work.statistics || "{}");
              } catch {
                // Use empty stats on parse failure
              }

              return (
                <Card key={work.id}>
                  <CardContent className="pt-6">
                    {/* First row: desc + status */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm line-clamp-3">
                          {work.desc || "(无文案)"}
                        </p>
                      </div>
                      <Badge className={`shrink-0 ${statusCfg.className}`}>
                        {statusCfg.label}
                      </Badge>
                    </div>

                    {/* Second row: time and engagement stats */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span>
                        {new Date(work.publishedAt * 1000).toLocaleString("zh-CN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>👍 {stats.digg_count || 0}</span>
                      <span>💬 {stats.comment_count || 0}</span>
                      <span>↗ {stats.share_count || 0}</span>
                    </div>

                    {/* Third row: collapsible transcript */}
                    {work.transcript && work.transcriptStatus === "done" && (
                      <details className="mt-3">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          查看转写全文
                        </summary>
                        <p className="mt-2 text-sm p-3 rounded-md bg-muted/50 whitespace-pre-wrap">
                          {work.transcript}
                        </p>
                      </details>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
