// src/app/api/agents/logs/[traceId]/route.ts
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { mastra } from "@/mastra";
import { dataPath } from "@/lib/data-root";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  const { traceId } = await params;

  try {
    const storage = mastra.getStorage();
    const obsStore = await storage?.getStore("observability");

    // 先尝试从 observability 获取 trace
    if (obsStore) {
      const trace = await obsStore.getTrace({ traceId });
      if (trace) {
        const spans = (
          (trace as Record<string, unknown>).spans as Array<Record<string, unknown>> ?? []
        ).map((span) => ({
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
        }));

        if (spans.length > 0) {
          return Response.json({ traceId, spans, source: "observability" });
        }
      }
    }

    // 回退：查 workflow snapshot
    const mastraDbPath = dataPath("mastra.db");
    const db = new Database(mastraDbPath, { readonly: true });
    try {
      const row = db
        .prepare(
          `SELECT workflow_name, run_id, snapshot, createdAt, updatedAt
           FROM mastra_workflow_snapshot
           WHERE run_id = ?`
        )
        .get(traceId) as {
        workflow_name: string;
        run_id: string;
        snapshot: string | null;
        createdAt: string;
        updatedAt: string;
      } | undefined;

      if (row) {
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(row.snapshot ?? "{}");
        } catch {
          parsed = null;
        }

        const context = (parsed?.context ?? parsed?.value ?? {}) as Record<string, unknown>;
        const input = context?.input ?? parsed?.input ?? null;
        const output = context?.output ?? parsed?.output ?? null;
        const status = (parsed?.status as string) ?? "unknown";
        const error = status === "failed" ? "Workflow execution failed" : null;

        return Response.json({
          traceId,
          source: "workflow_snapshot",
          spans: [
            {
              spanId: row.run_id,
              parentSpanId: null,
              name: `Workflow: ${row.workflow_name}`,
              spanType: "workflow_run",
              entityName: row.workflow_name,
              startedAt: row.createdAt,
              endedAt: row.updatedAt !== row.createdAt ? row.updatedAt : null,
              error,
              input,
              output,
              attributes: { status, workflowName: row.workflow_name },
            },
          ],
        });
      }
    } finally {
      db.close();
    }

    return Response.json({ error: "Trace not found" }, { status: 404 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
