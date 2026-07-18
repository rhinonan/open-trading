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
        snapshot: Buffer | null;
        createdAt: string;
        updatedAt: string;
      } | undefined;

      if (row) {
        // snapshot 是 MessagePack 二进制，提取其中可读文本
        const rawStr = row.snapshot ? row.snapshot.toString("utf8") : "";
        // 提取 transcript 字段
        const tIdx = rawStr.indexOf("transcript");
        let input = "";
        if (tIdx >= 0) {
          // 跳过 "transcript" 标记和 MessagePack 头部字节，直到遇到 CJK 字符
          let pos = tIdx + 10; // "transcript" 本身 10 字节
          for (let i = pos; i < Math.min(pos + 10, rawStr.length); i++) {
            const code = rawStr.charCodeAt(i);
            if (code >= 0x4e00 && code <= 0x9fff) { pos = i; break; }
            if (code >= 0x3000) { pos = i; break; }
          }
          // 从 CJK 字符开始提取直到遇到不可读字符
          let end = pos;
          for (let i = pos; i < Math.min(pos + 5000, rawStr.length); i++) {
            const code = rawStr.charCodeAt(i);
            if (code < 0x20 && code !== 0x0a) break;
            end = i + 1;
          }
          input = rawStr.slice(pos, end).trim();
        }
        if (!input) input = "（无法解析输入）";
        const status = rawStr.includes("success") ? "success" : rawStr.includes("failed") ? "failed" : "unknown";
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
              output: null,
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
