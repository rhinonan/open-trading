// src/app/settings/queues/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type QueueRow = {
  name: string;
  counts: Record<string, number>;
};

export default function QueuesPage() {
  const [queues, setQueues] = useState<QueueRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/queues/stats");
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || `HTTP ${res.status}`);
        setQueues([]);
      } else {
        setError(null);
        setQueues(json.queues || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">任务队列</h1>
          <p className="text-muted-foreground text-sm">
            BullMQ 各队列计数（依赖 Redis）。作品级细进度见 works 列表字段
            pipelineStage / pipelineProgress。
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          刷新
        </Button>
      </div>
      {error && (
        <p className="text-destructive text-sm">错误：{error}</p>
      )}
      {loading && queues.length === 0 && (
        <p className="text-muted-foreground text-sm">加载中…</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {queues.map((q) => (
          <Card key={q.name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">{q.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                {Object.entries(q.counts).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-mono text-lg">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
