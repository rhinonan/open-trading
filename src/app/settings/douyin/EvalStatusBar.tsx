"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface EvalProgress {
  done: number;
  pending: number;
  processing: number;
  failed: number;
  none?: number;
  total?: number;
}

export function EvalStatusBar() {
  const [progress, setProgress] = useState<EvalProgress | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/douyin/evaluate/progress");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        setProgress({
          done: Number(body.done ?? 0),
          pending: Number(body.pending ?? 0),
          processing: Number(body.processing ?? 0),
          failed: Number(body.failed ?? 0),
          none: body.none != null ? Number(body.none) : undefined,
          total: body.total != null ? Number(body.total) : undefined,
        });
      } catch {
        // ignore network errors; keep last snapshot
      }
    };

    load();
    const timer = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="font-medium text-foreground/80">评判进度</span>
      {progress ? (
        <>
          <span>
            完成 <span className="text-foreground">{progress.done}</span>
          </span>
          <span>
            排队 <span className="text-foreground">{progress.pending}</span>
          </span>
          <span>
            处理中{" "}
            <span className="text-foreground">{progress.processing}</span>
          </span>
          <span>
            失败 <span className="text-foreground">{progress.failed}</span>
          </span>
        </>
      ) : (
        <span>加载中…</span>
      )}
      <Link
        href="/settings/schedule"
        className="ml-auto text-primary underline-offset-2 hover:underline"
      >
        调度配置
      </Link>
    </div>
  );
}
