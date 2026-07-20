// src/app/api/agents/logs/[traceId]/route.ts
// 单条 trace 下全部 span（含 LLM / tool 子 span）
import { NextRequest } from "next/server";
import { mastra } from "@/mastra";
import { jsonError } from "@/lib/api-error";

export interface AgentLogSpanDetail {
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
  runId: string | null;
  threadId: string | null;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toISOString();
  }
  return "";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> },
) {
  const { traceId } = await params;
  if (!traceId?.trim()) {
    return Response.json({ error: "traceId 不能为空" }, { status: 400 });
  }

  try {
    const storage = mastra.getStorage();
    const obsStore = await storage?.getStore("observability");
    if (!obsStore) {
      return Response.json(
        { error: "Observability store not available" },
        { status: 500 },
      );
    }

    const trace = await obsStore.getTrace({ traceId });
    if (!trace) {
      return Response.json({ error: "Trace not found" }, { status: 404 });
    }

    const spans: AgentLogSpanDetail[] = (trace.spans ?? []).map((span) => {
      const s = span as {
        spanId: string;
        parentSpanId?: string | null;
        name: string;
        spanType: string;
        entityName?: string | null;
        startedAt: Date | string;
        endedAt?: Date | string | null;
        error?: unknown | null;
        input?: unknown;
        output?: unknown;
        attributes?: Record<string, unknown> | null;
        runId?: string | null;
        threadId?: string | null;
      };
      return {
        spanId: s.spanId,
        parentSpanId: s.parentSpanId ?? null,
        name: s.name,
        spanType: s.spanType,
        entityName: s.entityName ?? "",
        startedAt: toIso(s.startedAt),
        endedAt: s.endedAt ? toIso(s.endedAt) : null,
        error: s.error ?? null,
        input: s.input ?? null,
        output: s.output ?? null,
        attributes: s.attributes ?? null,
        runId: s.runId ?? null,
        threadId: s.threadId ?? null,
      };
    });

    // 按开始时间排序，根 span 优先
    spans.sort((a, b) => {
      if (!a.parentSpanId && b.parentSpanId) return -1;
      if (a.parentSpanId && !b.parentSpanId) return 1;
      return a.startedAt.localeCompare(b.startedAt);
    });

    return Response.json({ traceId, spans });
  } catch (err) {
    return jsonError(err, { status: 500, fallback: "Internal error" });
  }
}
