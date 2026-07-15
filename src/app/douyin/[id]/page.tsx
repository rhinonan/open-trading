"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2, X, Play, ImageIcon } from "lucide-react";
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

const categoryLabels: Record<string, string> = {
  predictor: "预测类博主",
  technical: "技术类博主",
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
  const [tab, setTab] = useState<"records" | "trend" | "works" | "opinions">("records");
  const [works, setWorks] = useState<DouyinWork[]>([]);
  const [worksLoading, setWorksLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedWork, setSelectedWork] = useState<DouyinWork | null>(null);

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

  // Adjust default tab based on blogger category after load
  useEffect(() => {
    if (blogger) {
      if (blogger.category === "technical") {
        setTab("opinions");
        loadWorks();
      } else {
        setTab("records");
      }
    }
  }, [blogger, loadWorks]);

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
          href="/douyin"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Link>
        <p className="text-muted-foreground">博主不存在</p>
      </div>
    );
  }

  const isTechnical = blogger.category === "technical";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/douyin"
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
                      : "secondary"
                  }
                >
                  {categoryLabels[blogger.category] || blogger.category}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {(blogger.followerCount ?? 0).toLocaleString()} 粉丝
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
        {isTechnical ? (
          <>
            <button
              onClick={() => { setTab("opinions"); loadWorks(); }}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                tab === "opinions"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              观点总结
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
          </>
        ) : (
          <>
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
          </>
        )}
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

      {/* Opinions Tab — 技术类博主观点总结 */}
      {tab === "opinions" && (
        <>
          {worksLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : works.filter(w => w.transcriptStatus === "done" && w.opinionSummary).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">暂无观点总结</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  作品完成转写后将自动提取观点
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {works
                .filter(w => w.transcriptStatus === "done" && w.opinionSummary)
                .sort((a, b) => b.publishedAt - a.publishedAt)
                .map((work) => (
                  <Card key={work.id}>
                    <CardContent className="pt-4 pb-3">
                      <p className="text-sm whitespace-pre-wrap">{work.opinionSummary}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(work.publishedAt * 1000).toLocaleDateString("zh-CN")}
                        </span>
                        <button
                          onClick={() => setSelectedWork(work)}
                          className="text-xs text-primary hover:underline"
                        >
                          查看原文 →
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}

          {/* 作品详情弹窗 — 从观点总结打开 */}
          {selectedWork && (
            <WorkDetailSheet
              work={selectedWork}
              onClose={() => setSelectedWork(null)}
              onPreview={(url) => setPreviewImage(url)}
            />
          )}
        </>
      )}

      {/* Works Tab — 抖音风格网格 */}
      {tab === "works" && (
        <>
          {worksLoading ? (
            <div className="grid grid-cols-3 gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-sm" />
              ))}
            </div>
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
            <div className="grid grid-cols-3 gap-1.5">
              {works.map((work) => {
                let stats: Record<string, number> = {};
                try { stats = JSON.parse(work.statistics || "{}"); } catch {}

                const isVideo = !!work.videoUrl;

                return (
                  <div
                    key={work.id}
                    className="relative aspect-[3/4] bg-muted rounded-sm overflow-hidden cursor-pointer group"
                    onClick={() => setSelectedWork(work)}
                  >
                    {/* 封面图 */}
                    {work.coverUrl ? (
                      <img
                        src={work.coverUrl}
                        alt={work.desc || ""}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).classList.add("hidden");
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                    )}

                    {/* 底部渐变遮罩 */}
                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent" />

                    {/* 左下角数据 */}
                    <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5 text-white text-xs">
                      {isVideo ? (
                        <Play className="h-3 w-3 fill-white" />
                      ) : (
                        <ImageIcon className="h-3 w-3" />
                      )}
                      <span>{stats.play_count?.toLocaleString() || 0}</span>
                    </div>

                    {/* 点赞数右上角 */}
                    {stats.digg_count > 0 && (
                      <div className="absolute top-1.5 right-2 text-white text-xs drop-shadow-sm">
                        👍 {stats.digg_count.toLocaleString()}
                      </div>
                    )}

                    {/* 转写状态角标 */}
                    {work.transcriptStatus === "failed" && (
                      <div className="absolute top-1.5 left-1.5 bg-red-500/90 text-white text-[10px] px-1.5 py-0.5 rounded">
                        转写失败
                      </div>
                    )}
                    {work.transcriptStatus === "done" && (
                      <div className="absolute top-1.5 left-1.5 bg-green-500/90 text-white text-[10px] px-1.5 py-0.5 rounded">
                        已转写
                      </div>
                    )}

                    {/* Hover遮罩 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </div>
                );
              })}
            </div>
          )}

          {/* 作品详情弹窗 */}
          {selectedWork && (
            <WorkDetailSheet
              work={selectedWork}
              onClose={() => setSelectedWork(null)}
              onPreview={(url) => setPreviewImage(url)}
            />
          )}
        </>
      )}

      {/* 图片预览 Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setPreviewImage(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setPreviewImage(null); }}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            onClick={() => setPreviewImage(null)}
          >
            <X className="h-8 w-8" />
          </button>
          <img
            src={previewImage}
            alt="预览"
            className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// 作品详情弹窗
function WorkDetailSheet({
  work,
  onClose,
  onPreview,
}: {
  work: DouyinWork;
  onClose: () => void;
  onPreview: (url: string) => void;
}) {
  let stats: Record<string, number> = {};
  try { stats = JSON.parse(work.statistics || "{}"); } catch {}

  const statusCfg: Record<string, { label: string; className: string }> = {
    pending: { label: "等待中", className: "bg-muted text-muted-foreground" },
    processing: { label: "转写中...", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
    done: { label: "已转写", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
    failed: { label: "转写失败", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  };
  const status = statusCfg[work.transcriptStatus] || { label: work.transcriptStatus, className: "bg-muted" };

  const isVideo = !!work.videoUrl;

  return (
    <div
      className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm flex flex-col"
      onClick={onClose}
    >
      <div
        className="flex-1 flex flex-col max-w-lg mx-auto w-full bg-background border-x overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部操作栏 */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur border-b">
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> 返回
          </button>
          <Badge className={status.className}>{status.label}</Badge>
        </div>

        {/* 封面大图 */}
        {work.coverUrl && (
          <div className="relative bg-black flex items-center justify-center">
            <img
              src={work.coverUrl}
              alt={work.desc || ""}
              className="w-full object-contain max-h-[60vh] cursor-pointer"
              onClick={() => onPreview(work.coverUrl)}
            />
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-14 w-14 rounded-full bg-white/80 flex items-center justify-center shadow-lg">
                  <Play className="h-6 w-6 fill-black text-black ml-0.5" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 文案 */}
        <div className="px-4 py-3 border-b">
          <p className="text-sm whitespace-pre-wrap">
            {work.desc || "(无文案)"}
          </p>
        </div>

        {/* 互动数据 */}
        <div className="flex items-center gap-5 px-4 py-3 border-b text-xs text-muted-foreground">
          <span>
            {new Date(work.publishedAt * 1000).toLocaleString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span>👍 {stats.digg_count?.toLocaleString() || 0}</span>
          <span>💬 {stats.comment_count?.toLocaleString() || 0}</span>
          <span>↗ {stats.share_count?.toLocaleString() || 0}</span>
          {stats.play_count > 0 && (
            <span className="flex items-center gap-0.5">
              <Play className="h-3 w-3" /> {stats.play_count.toLocaleString()}
            </span>
          )}
        </div>

        {/* 转写内容 */}
        {work.transcript && work.transcriptStatus === "done" ? (
          <div className="px-4 py-3">
            <h3 className="text-sm font-medium mb-2">语音转写</h3>
            <p className="text-sm p-3 rounded-md bg-muted/50 whitespace-pre-wrap leading-relaxed">
              {work.transcript}
            </p>
          </div>
        ) : work.transcriptStatus === "failed" ? (
          <div className="px-4 py-3">
            <p className="text-sm text-muted-foreground">转写失败，可稍后重试</p>
          </div>
        ) : work.transcriptStatus === "pending" ? (
          <div className="px-4 py-3">
            <p className="text-sm text-muted-foreground">等待转写队列中...</p>
          </div>
        ) : null}

        {/* 底部占位 */}
        <div className="h-safe pb-8" />
      </div>
    </div>
  );
}
