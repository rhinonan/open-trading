"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Plus,
  UserRound,
  Radio,
  FileAudio,
  Scale,
  Loader2,
} from "lucide-react";
import type { DouyinBlogger } from "@/types";

export type MessageOpts = { agentLog?: boolean };

interface OpsToolbarProps {
  bloggers: DouyinBlogger[];
  onAdd: () => void;
  onMessage: (
    text: string,
    type: "success" | "error",
    opts?: MessageOpts
  ) => void;
  onScanComplete?: () => void;
}

type BulkAction = "profile" | "scan" | "transcribe" | "evaluate";

export function OpsToolbar({
  bloggers,
  onAdd,
  onMessage,
  onScanComplete,
}: OpsToolbarProps) {
  const [loading, setLoading] = useState<BulkAction | null>(null);

  const enabled = bloggers.filter((b) => b.disabled === 0);

  const runPerBlogger = async (
    action: BulkAction,
    pathSuffix: string,
    doneLabel: string
  ) => {
    if (enabled.length === 0) {
      onMessage("暂无启用博主", "error");
      return;
    }
    setLoading(action);
    let ok = 0;
    let fail = 0;
    let newWorksTotal = 0;
    try {
      for (const b of enabled) {
        try {
          const res = await fetch(
            `/api/douyin/bloggers/${b.slug}/${pathSuffix}`,
            { method: "POST" }
          );
          const body = await res.json().catch(() => ({}));
          if (res.ok && body.success !== false) {
            ok += 1;
            if (action === "scan") {
              newWorksTotal += Number(body.newWorks ?? 0);
            }
          } else {
            fail += 1;
          }
        } catch {
          fail += 1;
        }
      }
      const type = fail > 0 && ok === 0 ? "error" : "success";
      if (action === "scan") {
        onMessage(
          `${doneLabel}：成功 ${ok}，失败 ${fail}，新增 ${newWorksTotal} 条`,
          type,
          { agentLog: false }
        );
        onScanComplete?.();
      } else if (action === "transcribe") {
        onMessage(`${doneLabel}：成功 ${ok}，失败 ${fail}`, type, {
          agentLog: true,
        });
      } else {
        onMessage(`${doneLabel}：成功 ${ok}，失败 ${fail}`, type, {
          agentLog: false,
        });
      }
    } finally {
      setLoading(null);
    }
  };

  const handleProfile = () =>
    runPerBlogger("profile", "update-profile", "资料更新完成");

  const handleScan = () => runPerBlogger("scan", "scan", "扫描完成");

  const handleTranscribe = () =>
    runPerBlogger("transcribe", "transcribe", "全部转写已入队");

  const handleEvaluate = async () => {
    setLoading("evaluate");
    try {
      const res = await fetch("/api/douyin/evaluate", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success !== false) {
        onMessage(
          `立即评判已入队：${body.enqueued ?? 0} 条`,
          "success",
          { agentLog: true }
        );
      } else {
        onMessage(body.error || "评判入队失败", "error");
      }
    } catch {
      onMessage("评判请求失败", "error");
    } finally {
      setLoading(null);
    }
  };

  const busy = loading !== null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAdd}
        disabled={busy}
      >
        <Plus className="h-3.5 w-3.5" />
        添加博主
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleProfile}
        disabled={busy}
      >
        {loading === "profile" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <UserRound className="h-3.5 w-3.5" />
        )}
        更新资料
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleScan}
        disabled={busy}
      >
        {loading === "scan" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Radio className="h-3.5 w-3.5" />
        )}
        扫描作品
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleTranscribe}
        disabled={busy}
      >
        {loading === "transcribe" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileAudio className="h-3.5 w-3.5" />
        )}
        全部转写
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleEvaluate}
        disabled={busy}
      >
        {loading === "evaluate" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Scale className="h-3.5 w-3.5" />
        )}
        立即评判
      </Button>
    </div>
  );
}
