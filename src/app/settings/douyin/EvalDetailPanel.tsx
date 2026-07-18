"use client";

import type { PredictionItem, JudgmentResult } from "@/types";

function JudgmentBadge({ judgment }: { judgment: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    correct: { label: "✓ 正确", cls: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
    mostly_correct: { label: "△ 基本正确", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
    incorrect: { label: "✗ 错误", cls: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
    not_yet: { label: "⏳ 待验证", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
    not_applicable: { label: "N/A", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  };
  const m = map[judgment as JudgmentResult] ?? { label: judgment, cls: "bg-gray-100 text-gray-500" };
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
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
            <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
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
