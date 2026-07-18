"use client";

import { Badge } from "@/components/ui/badge";
import type { WorkWithBlogger, JudgmentResult } from "@/types";

const TRANSCRIPT_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "⏳ 待处理", variant: "secondary" },
  processing: { label: "🔄 转写中", variant: "outline" },
  done: { label: "✅ 已转写", variant: "default" },
  failed: { label: "❌ 失败", variant: "destructive" },
};

const JUDGMENT_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  correct: { label: "正确", color: "text-green-600", icon: "✅" },
  mostly_correct: { label: "基本正确", color: "text-emerald-600", icon: "💚" },
  incorrect: { label: "不正确", color: "text-red-600", icon: "❌" },
  not_applicable: { label: "不涉及", color: "text-gray-400", icon: "➖" },
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

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function WorkRow({
  work,
  selected,
  onToggle,
  onTranscribe,
  onSummarize,
  onExpand,
  isExpanded,
}: {
  work: WorkWithBlogger;
  selected: boolean;
  onToggle: (id: number) => void;
  onTranscribe: (id: number) => void;
  onSummarize: (id: number) => void;
  onExpand: (id: number | null) => void;
  isExpanded: boolean;
}) {
  const tStatus = TRANSCRIPT_STATUS_CONFIG[work.transcriptStatus] ?? {
    label: work.transcriptStatus,
    variant: "secondary" as const,
  };
  const hasOpinion = work.opinionSummary && work.opinionSummary.length > 0;
  const jConfig = work.judgment?.latestItem
    ? JUDGMENT_CONFIG[work.judgment.latestItem.judgment as JudgmentResult]
    : null;
  const canTranscribe =
    work.transcriptStatus === "pending" || work.transcriptStatus === "failed";
  const canSummarize =
    work.transcriptStatus === "done" && !hasOpinion;

  return (
    <>
      <tr
        className={`border-b hover:bg-muted/50 transition-colors cursor-pointer ${
          selected ? "bg-accent/50" : ""
        }`}
        onClick={() => onToggle(work.id)}
        onDoubleClick={() => onExpand(isExpanded ? null : work.id)}
      >
        <td className="pl-4 py-3 w-10">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(work.id)}
            className="h-4 w-4 rounded border-gray-300 cursor-pointer accent-primary"
            onClick={(e) => e.stopPropagation()}
          />
        </td>
        <td className="py-3 pr-3">
          <div className="flex items-center gap-2">
            {work.blogger.avatarUrl ? (
              <img
                src={work.blogger.avatarUrl}
                alt={work.blogger.nickname}
                className="h-6 w-6 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-muted shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate max-w-[120px]">
                {work.blogger.nickname}
              </p>
              <p className="text-xs text-muted-foreground">
                {(work.blogger.followerCount ?? 0).toLocaleString()} 粉丝
              </p>
            </div>
          </div>
        </td>
        <td className="py-3 pr-3">
          <div className="flex items-center gap-2 min-w-0">
            {work.coverUrl ? (
              <img
                src={work.coverUrl}
                alt=""
                className="h-14 w-10 rounded-sm object-cover shrink-0 bg-muted"
                loading="lazy"
              />
            ) : (
              <div className="h-14 w-10 rounded-sm bg-muted shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm truncate max-w-[280px]">
                {work.desc || "(无文案)"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDuration(work.duration)}
              </p>
            </div>
          </div>
        </td>
        <td className="py-3 pr-3 text-sm text-muted-foreground whitespace-nowrap">
          <span title={new Date(work.publishedAt * 1000).toLocaleString("zh-CN")}>
            {formatRelativeTime(work.publishedAt)}
          </span>
        </td>
        <td className="py-3 pr-3">
          <Badge variant={tStatus.variant}>{tStatus.label}</Badge>
        </td>
        <td className="py-3 pr-3">
          {hasOpinion ? (
            <Badge variant="default">✅ 已提取</Badge>
          ) : work.transcriptStatus === "done" ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="py-3 pr-3">
          {jConfig ? (
            <span className={`text-xs font-medium ${jConfig.color}`}>
              {jConfig.icon} {jConfig.label}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="py-3 pr-4">
          <div className="flex items-center gap-1">
            {canTranscribe && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTranscribe(work.id);
                }}
                className="px-2 py-1 text-xs rounded hover:bg-accent transition-colors"
                title="转写"
              >
                🎤
              </button>
            )}
            {canSummarize && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSummarize(work.id);
                }}
                className="px-2 py-1 text-xs rounded hover:bg-accent transition-colors"
                title="提取观点"
              >
                📝
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand(isExpanded ? null : work.id);
              }}
              className="px-2 py-1 text-xs rounded hover:bg-accent transition-colors"
              title="展开详情"
            >
              {isExpanded ? "▲" : "▶"}
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr key={`detail-${work.id}`}>
          <td colSpan={8} className="bg-muted/30 px-4 py-3">
            <WorkDetailPanel work={work} />
          </td>
        </tr>
      )}
    </>
  );
}

function WorkDetailPanel({ work }: { work: WorkWithBlogger }) {
  let stats: Record<string, number> = {};
  try {
    stats = JSON.parse(work.statistics || "{}");
  } catch {}

  return (
    <div className="flex gap-4">
      {work.coverUrl && (
        <img
          src={work.coverUrl}
          alt=""
          className="h-32 w-24 rounded object-cover shrink-0 bg-muted"
        />
      )}
      <div className="flex-1 space-y-2 min-w-0">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">完整文案</p>
          <p className="text-sm whitespace-pre-wrap">
            {work.desc || "(无文案)"}
          </p>
        </div>
        {work.transcript && work.transcriptStatus === "done" && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">转写文本</p>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {work.transcript}
            </p>
          </div>
        )}
        {work.opinionSummary && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">观点摘要</p>
            <p className="text-sm">{work.opinionSummary}</p>
          </div>
        )}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>👍 {stats.digg_count?.toLocaleString() || 0}</span>
          <span>💬 {stats.comment_count?.toLocaleString() || 0}</span>
          <span>↗ {stats.share_count?.toLocaleString() || 0}</span>
          <span>▶ {stats.play_count?.toLocaleString() || 0}</span>
        </div>
      </div>
    </div>
  );
}
