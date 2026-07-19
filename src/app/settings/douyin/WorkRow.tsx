"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FileText, RefreshCw, Lightbulb, Scale } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { WorkWithBlogger } from "@/types";

type StatusVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "secondary";

const TRANSCRIPT_STATUS: Record<string, { label: string; variant: StatusVariant }> =
  {
    pending: { label: "待转写", variant: "neutral" },
    processing: { label: "转写中", variant: "warning" },
    done: { label: "已转写", variant: "success" },
    failed: { label: "失败", variant: "danger" },
  };

const EVAL_STATUS: Record<string, { label: string; variant: StatusVariant }> = {
  none: { label: "未评判", variant: "neutral" },
  pending: { label: "待评判", variant: "neutral" },
  processing: { label: "评判中", variant: "warning" },
  done: { label: "已评判", variant: "success" },
  failed: { label: "失败", variant: "danger" },
};

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "-";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

interface WorkRowProps {
  work: WorkWithBlogger;
  selected: boolean;
  onToggleSelect: () => void;
  onDetail: () => void;
  onTranscribe: () => void;
  onSummarize: () => void;
  onEvaluate: () => void;
  loading?: {
    transcribe?: boolean;
    summarize?: boolean;
    evaluate?: boolean;
  };
}

export function WorkRow({
  work,
  selected,
  onToggleSelect,
  onDetail,
  onTranscribe,
  onSummarize,
  onEvaluate,
  loading = {},
}: WorkRowProps) {
  const tStatus = TRANSCRIPT_STATUS[work.transcriptStatus] ?? {
    label: work.transcriptStatus,
    variant: "neutral" as const,
  };
  const evalStatusKey = work.judgment?.evalStatus ?? "none";
  const eStatus = EVAL_STATUS[evalStatusKey] ?? {
    label: evalStatusKey,
    variant: "neutral" as const,
  };

  const isVideo = work.mediaType === 4;
  const canTranscribe =
    work.transcriptStatus === "pending" || work.transcriptStatus === "failed";
  const canSummarize =
    work.transcriptStatus === "done" && !!work.transcript && !work.opinionSummary;
  const canEvaluate =
    work.transcriptStatus === "done" &&
    !!work.transcript &&
    (evalStatusKey === "none" || evalStatusKey === "failed");

  const opinionText = work.opinionSummary || "";

  return (
    <tr className="border-b hover:bg-muted/30 transition-colors">
      {/* 选择 */}
      <td className="py-2 pl-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label="选择作品"
        />
      </td>

      {/* 封面 */}
      <td className="py-2 pl-2">
        {work.coverUrl ? (
          <img
            src={work.coverUrl}
            alt=""
            className="h-10 w-10 rounded object-cover bg-muted"
            loading="lazy"
          />
        ) : (
          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </td>

      {/* 描述 */}
      <td className="py-2 max-w-[200px]">
        <p className="text-sm truncate" title={work.desc || undefined}>
          {work.desc || "(无文案)"}
        </p>
      </td>

      {/* 类型 */}
      <td className="py-2">
        <Badge variant={isVideo ? "info" : "secondary"}>
          {isVideo ? "视频" : "图集"}
        </Badge>
      </td>

      {/* 时长 */}
      <td className="py-2 text-sm text-muted-foreground whitespace-nowrap">
        {isVideo ? formatDuration(work.duration) : "-"}
      </td>

      {/* 转写状态 */}
      <td className="py-2">
        <Badge variant={tStatus.variant}>{tStatus.label}</Badge>
      </td>

      {/* 观点 */}
      <td className="py-2">
        {opinionText ? (
          <HoverCard>
            <HoverCardTrigger
              render={
                <span className="text-sm cursor-default truncate block max-w-[120px]" />
              }
            >
              {opinionText.length > 30
                ? opinionText.slice(0, 30) + "…"
                : opinionText}
            </HoverCardTrigger>
            <HoverCardContent className="w-80 text-sm leading-relaxed max-h-60 overflow-auto">
              {opinionText}
            </HoverCardContent>
          </HoverCard>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}
      </td>

      {/* 评判状态 */}
      <td className="py-2">
        {work.judgment &&
        (work.judgment.evaluable > 0 ||
          work.judgment.notYet > 0 ||
          work.judgment.notApplicable > 0) ? (
          <div className="flex items-center gap-1 text-xs">
            {work.judgment.correct > 0 && (
              <span title="正确" className="text-success">
                ✅{work.judgment.correct}
              </span>
            )}
            {work.judgment.mostlyCorrect > 0 && (
              <span title="基本正确" className="text-info">
                💚{work.judgment.mostlyCorrect}
              </span>
            )}
            {work.judgment.incorrect > 0 && (
              <span title="不正确" className="text-danger">
                ❌{work.judgment.incorrect}
              </span>
            )}
            {work.judgment.notYet > 0 && (
              <span title="待验证" className="text-warning">
                ⏳{work.judgment.notYet}
              </span>
            )}
          </div>
        ) : (
          <Badge variant={eStatus.variant}>{eStatus.label}</Badge>
        )}
      </td>

      {/* 操作 */}
      <td className="py-2 pr-4">
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon" className="h-7 w-7" />}
              onClick={onDetail}
            >
              <FileText className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>详情</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${!canTranscribe ? "opacity-40" : ""}`}
                />
              }
              onClick={() => canTranscribe && onTranscribe()}
            >
              {loading.transcribe ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {loading.transcribe
                ? "入队中…"
                : work.transcriptStatus === "processing"
                  ? "转写中…"
                  : canTranscribe
                    ? "转写"
                    : "无法转写"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${!canSummarize ? "opacity-40" : ""}`}
                />
              }
              onClick={() => canSummarize && onSummarize()}
            >
              {loading.summarize ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <Lightbulb className="h-3.5 w-3.5" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {loading.summarize ? "提取中…" : canSummarize ? "观点提取" : "无法提取"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${!canEvaluate ? "opacity-40" : ""}`}
                />
              }
              onClick={() => canEvaluate && onEvaluate()}
            >
              {loading.evaluate ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : (
                <Scale className="h-3.5 w-3.5" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {loading.evaluate ? "入队中…" : canEvaluate ? "评判" : "无法评判"}
            </TooltipContent>
          </Tooltip>
        </div>
      </td>
    </tr>
  );
}
