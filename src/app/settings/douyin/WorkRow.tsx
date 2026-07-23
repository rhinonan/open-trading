"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FileText, FileAudio, Lightbulb, Scale, CheckCircle, CircleCheck, XCircle, Clock } from "lucide-react";
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
    <TableRow>
      {/* 选择 */}
      <TableCell className="pl-2">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label="选择作品"
        />
      </TableCell>

      {/* 描述 */}
      <TableCell className="max-w-[200px] whitespace-normal">
        <p className="text-sm truncate" title={work.desc || undefined}>
          {work.desc || "(无文案)"}
        </p>
      </TableCell>

      {/* 类型 */}
      <TableCell>
        <Badge variant={isVideo ? "info" : "secondary"}>
          {isVideo ? "视频" : "图集"}
        </Badge>
      </TableCell>

      {/* 时长 */}
      <TableCell className="text-sm text-muted-foreground">
        {isVideo ? formatDuration(work.duration) : "-"}
      </TableCell>

      {/* 转写状态 */}
      <TableCell>
        <Badge variant={tStatus.variant}>{tStatus.label}</Badge>
      </TableCell>

      {/* 观点 */}
      <TableCell className="whitespace-normal">
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
      </TableCell>

      {/* 评判状态 */}
      <TableCell className="whitespace-normal">
        {work.judgment &&
        (work.judgment.evaluable > 0 ||
          work.judgment.notYet > 0 ||
          work.judgment.notApplicable > 0) ? (
          <div className="flex items-center gap-1 text-xs">
            {work.judgment.correct > 0 && (
              <span title="正确" className="inline-flex items-center gap-0.5 text-success">
                <CheckCircle className="h-3.5 w-3.5" />
                {work.judgment.correct}
              </span>
            )}
            {work.judgment.mostlyCorrect > 0 && (
              <span title="基本正确" className="inline-flex items-center gap-0.5 text-info">
                <CircleCheck className="h-3.5 w-3.5" />
                {work.judgment.mostlyCorrect}
              </span>
            )}
            {work.judgment.incorrect > 0 && (
              <span title="不正确" className="inline-flex items-center gap-0.5 text-danger">
                <XCircle className="h-3.5 w-3.5" />
                {work.judgment.incorrect}
              </span>
            )}
            {work.judgment.notYet > 0 && (
              <span title="待验证" className="inline-flex items-center gap-0.5 text-warning">
                <Clock className="h-3.5 w-3.5" />
                {work.judgment.notYet}
              </span>
            )}
          </div>
        ) : (
          <Badge variant={eStatus.variant}>{eStatus.label}</Badge>
        )}
      </TableCell>

      {/* 操作 */}
      <TableCell className="pr-4">
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
                <FileAudio className="h-3.5 w-3.5" />
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
      </TableCell>
    </TableRow>
  );
}
