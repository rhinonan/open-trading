"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Play, ImageIcon } from "lucide-react";
import type { WorkWithBlogger, PredictionItem, JudgmentResult } from "@/types";

const JUDGMENT_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  correct:         { label: "正确",   color: "text-green-500",  icon: "✅" },
  mostly_correct:  { label: "基本正确", color: "text-emerald-500", icon: "💚" },
  incorrect:       { label: "不正确", color: "text-red-500",    icon: "❌" },
  not_applicable:  { label: "不涉及", color: "text-gray-400",   icon: "—" },
  not_yet:         { label: "待验证", color: "text-amber-500",  icon: "⏳" },
};

interface WorkDrawerProps {
  work: WorkWithBlogger | null;
  onClose: () => void;
}

export function WorkDrawer({ work, onClose }: WorkDrawerProps) {
  const [items, setItems] = useState<PredictionItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  useEffect(() => {
    if (!work) {
      setItems([]);
      return;
    }
    setItemsLoading(true);
    fetch(`/api/douyin/records?workId=${work.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setItems(Array.isArray(data?.items) ? data.items : []))
      .catch(() => setItems([]))
      .finally(() => setItemsLoading(false));
  }, [work?.id, work]); // eslint-disable-line react-hooks/exhaustive-deps

  const isVideo = work?.mediaType === 4;
  let stats: Record<string, number> = {};
  try {
    if (work?.statistics) stats = JSON.parse(work.statistics);
  } catch {}

  return (
    <Sheet open={work !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-auto">
        {work && (
          <>
            <SheetHeader>
              <SheetTitle>作品详情</SheetTitle>
            </SheetHeader>

            <div className="space-y-5 mt-4">
              {/* 作品信息 */}
              <section>
                {work.coverUrl && (
                  <div className="relative bg-black rounded-lg overflow-hidden mb-3">
                    <img
                      src={work.coverUrl}
                      alt=""
                      className="w-full object-contain max-h-[240px]"
                    />
                    {isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-12 w-12 rounded-full bg-white/80 flex items-center justify-center shadow-lg">
                          <Play className="h-5 w-5 fill-black text-black ml-0.5" />
                        </div>
                      </div>
                    )}
                    {!isVideo && (
                      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" /> 图集
                      </div>
                    )}
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap mb-2">
                  {work.desc || "(无文案)"}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
                </div>
              </section>

              {/* 语音转写 */}
              <section>
                <h3 className="text-sm font-medium mb-2">语音转写</h3>
                {work.transcript && work.transcriptStatus === "done" ? (
                  <p className="text-sm p-3 rounded-md bg-muted/50 whitespace-pre-wrap leading-relaxed">
                    {work.transcript}
                  </p>
                ) : work.transcriptStatus === "failed" ? (
                  <p className="text-sm text-muted-foreground">转写失败，可重试</p>
                ) : work.transcriptStatus === "processing" ? (
                  <p className="text-sm text-muted-foreground">转写中…</p>
                ) : (
                  <p className="text-sm text-muted-foreground">等待转写</p>
                )}
              </section>

              {/* 观点摘要 */}
              <section>
                <h3 className="text-sm font-medium mb-2">观点摘要</h3>
                {work.opinionSummary ? (
                  <p className="text-sm p-3 rounded-md bg-muted/50 whitespace-pre-wrap leading-relaxed">
                    {work.opinionSummary}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">-</p>
                )}
              </section>

              {/* 预测明细 */}
              <section>
                <h3 className="text-sm font-medium mb-2">
                  预测明细
                  {items.length > 0 && (
                    <span className="text-muted-foreground font-normal ml-1">
                      ({items.length})
                    </span>
                  )}
                </h3>
                {itemsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : items.length > 0 ? (
                  <div className="space-y-2">
                    {items.map((item) => {
                      const jc = JUDGMENT_CONFIG[item.judgment as JudgmentResult];
                      return (
                        <div
                          key={item.id}
                          className="border rounded-lg p-3 text-sm"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {jc && (
                              <Badge
                                variant="secondary"
                                className={jc.color}
                              >
                                {jc.icon} {jc.label}
                              </Badge>
                            )}
                            {item.relatedSymbols && (
                              <span className="text-xs text-muted-foreground font-mono">
                                {item.relatedSymbols}
                              </span>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap">
                            {item.predictedContent}
                          </p>
                          {item.reasoning && (
                            <details className="mt-2">
                              <summary className="text-xs text-muted-foreground cursor-pointer">
                                推理依据
                              </summary>
                              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                                {item.reasoning}
                              </p>
                            </details>
                          )}
                          {item.judgment === "not_yet" && item.verifiableAfter && (
                            <p className="text-xs text-amber-500 mt-1">
                              ⏳ 预计 {item.verifiableAfter} 后可验证
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无预测数据</p>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
