"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, X, Play, ImageIcon } from "lucide-react";
import type {
  DouyinBlogger,
  DouyinWork,
  PredictionItem,
  JudgmentResult,
} from "@/types";

const JUDGMENT_CONFIG: Record<
  JudgmentResult,
  { label: string; color: string; icon: string }
> = {
  correct: { label: "正确", color: "text-green-500", icon: "✅" },
  mostly_correct: {
    label: "基本正确",
    color: "text-emerald-500",
    icon: "💚",
  },
  incorrect: { label: "不正确", color: "text-red-500", icon: "❌" },
  not_applicable: { label: "不涉及", color: "text-gray-400", icon: "—" },
  not_yet: { label: "待验证", color: "text-amber-500", icon: "⏳" },
};

export default function BloggerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [blogger, setBlogger] = useState<DouyinBlogger | null>(null);
  const [records, setRecords] = useState<PredictionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"works" | "summary">("works");
  const [works, setWorks] = useState<DouyinWork[]>([]);
  const [worksLoading, setWorksLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedWork, setSelectedWork] = useState<DouyinWork | null>(null);

  const loadWorks = useCallback(async () => {
    setWorksLoading(true);
    try {
      const res = await fetch(`/api/douyin/bloggers/${slug}?include=works`);
      if (res.ok) {
        const data = await res.json();
        setWorks(data.works || []);
      }
    } catch {
      // silent fail
    }
    setWorksLoading(false);
  }, [slug]);

  useEffect(() => {
    async function load() {
      const [bloggerRes, recordsRes] = await Promise.all([
        fetch(`/api/douyin/bloggers/${slug}`),
        fetch(`/api/douyin/records?blogger_slug=${slug}`),
      ]);
      if (bloggerRes.ok) setBlogger(await bloggerRes.json());
      if (recordsRes.ok) setRecords(await recordsRes.json());
      setLoading(false);
    }
    load();
  }, [slug]);

  useEffect(() => {
    loadWorks();
  }, [loadWorks]);

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

  // Compute accuracy stats from prediction items (new schema)
  const judgmentCounts = {
    correct: records.filter((i) => i.judgment === "correct").length,
    mostly_correct: records.filter((i) => i.judgment === "mostly_correct").length,
    incorrect: records.filter((i) => i.judgment === "incorrect").length,
    not_applicable: records.filter((i) => i.judgment === "not_applicable").length,
    not_yet: records.filter((i) => i.judgment === "not_yet").length,
  };
  const totalJudged =
    judgmentCounts.correct +
    judgmentCounts.mostly_correct +
    judgmentCounts.incorrect;
  const accuracy =
    totalJudged > 0
      ? Math.round(
          ((judgmentCounts.correct + 0.5 * judgmentCounts.mostly_correct) /
            totalJudged) *
            100
        )
      : null;

  return (
    <div className="space-y-6">
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
                <span className="text-xs text-muted-foreground">
                  {(blogger.followerCount ?? 0).toLocaleString()} 粉丝
                </span>
                {accuracy !== null && (
                  <Badge variant="secondary">
                    准确率 {accuracy}%
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => {
            setTab("works");
            loadWorks();
          }}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            tab === "works"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          作品列表
        </button>
        <button
          onClick={() => setTab("summary")}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            tab === "summary"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          评判汇总
        </button>
      </div>

      {/* Works Tab */}
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
                try {
                  stats = JSON.parse(work.statistics || "{}");
                } catch {}

                // Find judgment for this work
                const workJudgment = records.find(
                  (item: PredictionItem) => item.workId === work.id
                );
                const jConfig = workJudgment
                  ? JUDGMENT_CONFIG[workJudgment.judgment]
                  : null;

                return (
                  <div
                    key={work.id}
                    className="relative aspect-[3/4] bg-muted rounded-sm overflow-hidden cursor-pointer group"
                    onClick={() => setSelectedWork(work)}
                  >
                    {work.coverUrl ? (
                      <img
                        src={work.coverUrl}
                        alt={work.desc || ""}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).classList.add(
                            "hidden"
                          );
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                    )}

                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent" />

                    <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5 text-white text-xs">
                      {!!work.videoUrl ? (
                        <Play className="h-3 w-3 fill-white" />
                      ) : (
                        <ImageIcon className="h-3 w-3" />
                      )}
                      <span>{stats.play_count?.toLocaleString() || 0}</span>
                    </div>

                    {stats.digg_count > 0 && (
                      <div className="absolute top-1.5 right-2 text-white text-xs drop-shadow-sm">
                        👍 {stats.digg_count.toLocaleString()}
                      </div>
                    )}

                    {/* 评判标记 */}
                    {jConfig && (
                      <div className="absolute top-1.5 left-1.5 bg-background/90 text-xs px-1.5 py-0.5 rounded shadow">
                        <span className={jConfig.color}>{jConfig.icon}</span>{" "}
                        {jConfig.label}
                      </div>
                    )}

                    {work.transcriptStatus === "failed" && !jConfig && (
                      <div className="absolute top-1.5 left-1.5 bg-red-500/90 text-white text-[10px] px-1.5 py-0.5 rounded">
                        转写失败
                      </div>
                    )}
                    {work.transcriptStatus === "done" && !jConfig && (
                      <div className="absolute top-1.5 left-1.5 bg-green-500/90 text-white text-[10px] px-1.5 py-0.5 rounded">
                        已转写
                      </div>
                    )}

                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  </div>
                );
              })}
            </div>
          )}

          {selectedWork && (
            <WorkDetailSheet
              work={selectedWork}
              onClose={() => setSelectedWork(null)}
              onPreview={(url) => setPreviewImage(url)}
            />
          )}
        </>
      )}

      {/* Summary Tab */}
      {tab === "summary" && (
        <Card className="border-dashed">
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">评判记录功能将在 Task 8 重构</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              请暂时查看作品列表中的评判状态
            </p>
          </CardContent>
        </Card>
      )}

      {/* Image preview lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setPreviewImage(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPreviewImage(null);
          }}
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

// WorkDetailSheet — 复用旧版作品详情弹窗代码
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
  try {
    stats = JSON.parse(work.statistics || "{}");
  } catch {}

  const statusCfg: Record<
    string,
    { label: string; className: string }
  > = {
    pending: { label: "等待中", className: "bg-muted text-muted-foreground" },
    processing: {
      label: "转写中...",
      className:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    },
    done: {
      label: "已转写",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    },
    failed: {
      label: "转写失败",
      className:
        "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    },
  };
  const status = statusCfg[work.transcriptStatus] || {
    label: work.transcriptStatus,
    className: "bg-muted",
  };

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
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur border-b">
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> 返回
          </button>
          <Badge className={status.className}>{status.label}</Badge>
        </div>

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

        <div className="px-4 py-3 border-b">
          <p className="text-sm whitespace-pre-wrap">
            {work.desc || "(无文案)"}
          </p>
        </div>

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

        {work.transcript && work.transcriptStatus === "done" ? (
          <div className="px-4 py-3">
            <h3 className="text-sm font-medium mb-2">语音转写</h3>
            <p className="text-sm p-3 rounded-md bg-muted/50 whitespace-pre-wrap leading-relaxed">
              {work.transcript}
            </p>
          </div>
        ) : work.transcriptStatus === "failed" ? (
          <div className="px-4 py-3">
            <p className="text-sm text-muted-foreground">
              转写失败，可稍后重试
            </p>
          </div>
        ) : work.transcriptStatus === "pending" ? (
          <div className="px-4 py-3">
            <p className="text-sm text-muted-foreground">
              等待转写队列中...
            </p>
          </div>
        ) : null}

        <div className="h-safe pb-8" />
      </div>
    </div>
  );
}
