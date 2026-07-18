// src/app/api/agents/logs/route.ts
import { NextRequest } from "next/server";
import { mastra } from "@/mastra";

interface LogItem {
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

function truncatePreview(value: unknown, maxLen = 100): string {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

function inferCallSource(
  span: Record<string, unknown>
): "chat" | "workflow" | "test" {
  if (span.threadId) return "chat";
  if (span.runId) return "workflow";
  return "test";
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const agentName = searchParams.get("agentName") || undefined;
  const page = Math.max(0, Number(searchParams.get("page")) || 0);
  const perPage = Math.min(
    Math.max(1, Number(searchParams.get("perPage")) || 20),
    100
  );

  try {
    const storage = mastra.getStorage();
    const obsStore = await storage?.getStore("observability");
    if (!obsStore) {
      return Response.json(
        { error: "Observability store not available" },
        { status: 500 }
      );
    }

    const filters: Record<string, unknown> = {
      entityType: "agent",
      spanType: "agent_run",
    };
    if (agentName) {
      filters.entityName = agentName;
    }

    const result = await obsStore.listTraces({
      mode: "page",
      filters,
      pagination: { page, perPage },
      orderBy: {
        field: "startedAt" as const,
        direction: "DESC" as const,
      },
    });

    const logs: LogItem[] = ((result as Record<string, unknown>).spans as Array<Record<string, unknown>> ?? []).map(
      (span) => ({
        traceId: span.traceId as string,
        spanId: span.spanId as string,
        entityName: (span.entityName as string) ?? "",
        spanType: span.spanType as string,
        name: span.name as string,
        startedAt: span.startedAt as string,
        endedAt: (span.endedAt as string) ?? null,
        error: (span as Record<string, unknown>).error ?? null,
        inputPreview: truncatePreview(span.input),
        outputPreview: truncatePreview(span.output),
        callSource: inferCallSource(span as Record<string, unknown>),
      })
    );

    return Response.json({
      logs,
      pagination: (result as Record<string, unknown>).pagination ?? {
        total: logs.length,
        page,
        perPage,
        hasMore: false,
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
