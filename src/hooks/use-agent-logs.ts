"use client";

import { useState, useEffect, useCallback } from "react";

export interface LogItem {
  traceId: string;
  spanId: string;
  entityName: string;
  spanType: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  error: unknown | null;
  inputPreview: string;
  outputPreview: string;
  callSource: "chat" | "workflow" | "test";
}

interface Pagination {
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

interface UseAgentLogsFilters {
  agentName?: string;
  page?: number;
  perPage?: number;
}

export function useAgentLogs(filters?: UseAgentLogsFilters) {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 0,
    perPage: 20,
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters?.agentName) params.set("agentName", filters.agentName);
      params.set("page", String(filters?.page ?? 0));
      params.set("perPage", String(filters?.perPage ?? 20));

      const res = await fetch(`/api/agents/logs?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs ?? []);
        setPagination(
          data.pagination ?? { total: 0, page: 0, perPage: 20, hasMore: false }
        );
      } else {
        setError(data.error ?? "加载失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [filters?.agentName, filters?.page, filters?.perPage]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { logs, pagination, loading, error, refetch: fetchLogs };
}

export interface SpanDetail {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  spanType: string;
  entityName: string;
  startedAt: string;
  endedAt: string | null;
  error: unknown | null;
  input: unknown;
  output: unknown;
  attributes: Record<string, unknown> | null;
}

export function useAgentLogDetail(traceId: string | null) {
  const [spans, setSpans] = useState<SpanDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!traceId) {
      setSpans([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/agents/logs/${traceId}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setSpans(data.spans ?? []);
        } else {
          setError(data.error ?? "加载失败");
        }
      } catch {
        if (!cancelled) setError("网络错误");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  return { spans, loading, error };
}
