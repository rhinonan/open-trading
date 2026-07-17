"use client";

import { useState } from "react";
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Minus,
  Check,
  CheckCheck,
  X,
  ExternalLink,
  Mic,
  Clipboard,
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import type { WorkWithBlogger, JudgmentResult } from "@/types";

const TRANSCRIPT_STATUS_CONFIG: Record<
  string,
  { label: string; Icon: typeof Clock; colorClass: string }
> = {
  pending: { label: "待处理", Icon: Clock, colorClass: "text-amber-500" },
  processing: { label: "转写中", Icon: Loader2, colorClass: "text-blue-500" },
  done: { label: "已转写", Icon: CheckCircle2, colorClass: "text-green-500" },
  failed: { label: "失败", Icon: XCircle, colorClass: "text-red-500" },
};

const JUDGMENT_CONFIG: Record<
  JudgmentResult,
  { label: string; Icon: typeof Check; colorClass: string }
> = {
  correct: { label: "正确", Icon: Check, colorClass: "text-green-600" },
  mostly_correct: { label: "基本正确", Icon: CheckCheck, colorClass: "text-emerald-600" },
  incorrect: { label: "不正确", Icon: X, colorClass: "text-red-600" },
  not_applicable: { label: "不涉及", Icon: Minus, colorClass: "text-gray-400" },
};

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

export function VideoSubRow({
  work,
  onTranscribe,
  onSummarize,
}: {
  work: WorkWithBlogger;
  onTranscribe: (id: number) => void;
  onSummarize: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const tStatus = TRANSCRIPT_STATUS_CONFIG[work.transcriptStatus] ?? {
    label: work.transcriptStatus,
    Icon: Minus,
    colorClass: "text-muted-foreground",
  };
  const hasOpinion = work.opinionSummary && work.opinionSummary.length > 0;
  const jConfig = work.judgment ? JUDGMENT_CONFIG[work.judgment.judgment] : null;
  const canTranscribe = work.transcriptStatus === "pending" || work.transcriptStatus === "failed";
  const canSummarize = work.transcriptStatus === "done" && !hasOpinion;
  const isProcessing = work.transcriptStatus === "processing";

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const { Icon: TIcon, colorClass: tColor, label: tLabel } = tStatus;

  return (
    <>
      <tr className="border-b hover:bg-muted/30 transition-colors">
        {/* 标题 — 单行省略号 + 悬浮全文 + 复制 */}
        <td className="py-2.5 pl-6 pr-3">
          <div className="flex items-center gap-1.5 min-w-0 max-w-[320px]">
            <HoverCard>
              <HoverCardTrigger className="text-sm truncate cursor-default">
                {work.desc || "(无文案)"}
              </HoverCardTrigger>
              <HoverCardContent side="top" className="max-w-sm whitespace-pre-wrap text-xs">
                {work.desc || "(无文案)"}
              </HoverCardContent>
            </HoverCard>
            {work.desc && (
              <button
                onClick={(e) => { e.stopPropagation(); handleCopy(work.desc); }}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="复制文案"
              >
                {copied ? (
                  <ClipboardCheck className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Clipboard className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </td>

        {/* 发布时间 */}
        <td className="py-2.5 pr-3 text-sm text-muted-foreground whitespace-nowrap">
          <span title={new Date(work.publishedAt * 1000).toLocaleString("zh-CN")}>
            {formatRelativeTime(work.publishedAt)}
          </span>
        </td>

        {/* 转写状态 — lucide 图标 + 颜色 */}
        <td className="py-2.5 pr-3">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${tColor}`}>
            <TIcon className={`h-3.5 w-3.5 ${isProcessing ? "animate-spin" : ""}`} />
            {tLabel}
          </div>
        </td>

        {/* 观点状态 */}
        <td className="py-2.5 pr-3">
          {hasOpinion ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-purple-500">
              <Lightbulb className="h-3.5 w-3.5" />
              已提取
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Minus className="h-3.5 w-3.5" />
              未提取
            </div>
          )}
        </td>

        {/* 评判结果 */}
        <td className="py-2.5 pr-3">
          {jConfig ? (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${jConfig.colorClass}`}>
              <jConfig.Icon className="h-3.5 w-3.5" />
              {jConfig.label}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Minus className="h-3.5 w-3.5" />
              未评判
            </div>
          )}
        </td>

        {/* 操作 */}
        <td className="py-2.5 pr-4">
          <div className="flex items-center gap-1">
            {/* 跳转抖音 */}
            {work.awemeId ? (
              <a
                href={`https://www.douyin.com/video/${work.awemeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="在抖音打开"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}

            {/* 转写 */}
            {canTranscribe && (
              <button
                onClick={(e) => { e.stopPropagation(); onTranscribe(work.id); }}
                className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="转写视频"
              >
                <Mic className="h-3.5 w-3.5" />
              </button>
            )}

            {/* 提取观点 */}
            {canSummarize && (
              <button
                onClick={(e) => { e.stopPropagation(); onSummarize(work.id); }}
                className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="提取观点"
              >
                <Lightbulb className="h-3.5 w-3.5" />
              </button>
            )}

            {/* 展开详情 */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title={expanded ? "收起详情" : "展开详情"}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </td>
      </tr>

      {/* 展开详情面板 */}
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-muted/20 px-6 py-3">
            <div className="space-y-2 text-sm">
              {work.transcript && work.transcriptStatus === "done" && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">转写文本：</span>
                  <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-muted-foreground">
                    {work.transcript}
                  </p>
                </div>
              )}
              {work.opinionSummary && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">观点摘要：</span>
                  <p className="mt-0.5">{work.opinionSummary}</p>
                </div>
              )}
              {work.judgment && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">预测内容：</span>
                  <p className="mt-0.5 text-muted-foreground">{work.judgment.predictedContent}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
