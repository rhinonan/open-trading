"use client";

import type { PredictionItem, JudgmentResult } from "@/types";
import { Badge } from "@/components/ui/badge";

function JudgmentBadge({ judgment }: { judgment: string }) {
  const map: Record<
    string,
    {
      label: string;
      variant:
        | "success"
        | "info"
        | "danger"
        | "warning"
        | "neutral";
    }
  > = {
    correct: { label: "正确", variant: "success" },
    mostly_correct: { label: "基本正确", variant: "info" },
    incorrect: { label: "错误", variant: "danger" },
    not_yet: { label: "待验证", variant: "warning" },
    not_applicable: { label: "N/A", variant: "neutral" },
  };
  const m = map[judgment as JudgmentResult] ?? {
    label: judgment,
    variant: "neutral" as const,
  };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export function EvalDetailPanel({ items }: { items: PredictionItem[] }) {
  if (items.length === 0) {
    return <div className="text-muted-foreground py-2 text-sm">该作品未包含可评判的行情预测</div>;
  }

  return (
    <div className="space-y-2 py-2">
      {items.map((item) => (
        <div key={item.id} className="rounded border p-3 text-sm">
          <div className="flex items-center gap-2">
            <JudgmentBadge judgment={item.judgment} />
            <span className="font-medium">{item.predictedContent}</span>
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            标的: {item.predictionTarget || "未指定"}
            {item.relatedSymbols && item.relatedSymbols !== "[]" && <> · 代码: {item.relatedSymbols}</>}
          </div>
          {item.reasoning && (
            <div className="text-muted-foreground mt-1 text-xs">
              理由: {item.reasoning}
            </div>
          )}
          {item.judgment === "not_yet" && item.verifiableAfter && (
            <div className="mt-1 text-xs text-warning">
              到期日: {item.verifiableAfter}（到期后自动重评）
            </div>
          )}
          <details className="mt-1">
            <summary className="text-muted-foreground cursor-pointer text-xs hover:text-foreground transition-colors">
              行情数据
            </summary>
            <pre className="bg-muted mt-1 overflow-auto rounded p-2 text-xs leading-relaxed">
              {item.evidence || "无"}
            </pre>
          </details>
        </div>
      ))}
    </div>
  );
}
