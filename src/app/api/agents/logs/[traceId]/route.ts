// src/app/api/agents/logs/[traceId]/route.ts
import { NextRequest } from "next/server";
import { mastra } from "@/mastra";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  const { traceId } = await params;

  try {
    const storage = mastra.getStorage();
    const obsStore = await storage?.getStore("observability");
    if (!obsStore) {
      return Response.json(
        { error: "Observability store not available" },
        { status: 500 }
      );
    }

    const trace = await obsStore.getTrace({ traceId });
    if (!trace) {
      return Response.json({ error: "Trace not found" }, { status: 404 });
    }

    const spans = ((trace as Record<string, unknown>).spans as Array<Record<string, unknown>> ?? []).map(
      (span) => ({
        spanId: span.spanId as string,
        parentSpanId: (span.parentSpanId as string) ?? null,
        name: span.name as string,
        spanType: span.spanType as string,
        entityName: (span.entityName as string) ?? "",
        startedAt: span.startedAt as string,
        endedAt: (span.endedAt as string) ?? null,
        error: span.error ?? null,
        input: span.input ?? null,
        output: span.output ?? null,
        attributes: (span.attributes as Record<string, unknown>) ?? null,
      })
    );

    return Response.json({ traceId, spans });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
