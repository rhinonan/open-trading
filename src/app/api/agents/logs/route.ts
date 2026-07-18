// src/app/api/agents/logs/route.ts
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { mastra } from "@/mastra";
import { dataPath } from "@/lib/data-root";

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

/** 安全截断，不切断多字节 UTF-8 字符 */
function truncatePreview(value: unknown, maxLen = 100): string {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= maxLen) return text;
  const chars = Array.from(text);
  return chars.length > maxLen ? chars.slice(0, maxLen).join("") + "…" : text;
}

function inferCallSource(
  span: Record<string, unknown>
): "chat" | "workflow" | "test" {
  if (span.threadId) return "chat";
  if (span.runId) return "workflow";
  return "test";
}

/** 从 workflow snapshot JSON 中提取输入摘要 */
function extractWorkflowInput(snapshot: string | null): string {
  if (!snapshot) return "";
  try {
    const parsed = JSON.parse(snapshot);
    const ctx = parsed?.context ?? {};
    const input = ctx?.input ?? parsed?.input;
    if (input == null) return "";
    return truncatePreview(input, 100);
  } catch {
    return truncatePreview(snapshot, 100);
  }
}

/** 判断 workflow snapshot 是否有错误 */
function extractWorkflowError(snapshot: string | null): string | null {
  if (!snapshot) return null;
  try {
    const parsed = JSON.parse(snapshot);
    if (parsed?.status === "failed") {
      // 尝试从 context 中提取错误
      const steps = parsed?.context ?? {};
      for (const [_key, step] of Object.entries(steps) as [string, { status?: string; error?: string }][]) {
        if (step?.status === "failed" || step?.error) {
          return step?.error ?? "Step failed";
        }
      }
      return "Workflow failed";
    }
    return null;
  } catch {
    return null;
  }
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
    const allLogs: LogItem[] = [];

    // 1. 查 agent_run spans（通过 observability store）
    const storage = mastra.getStorage();
    const obsStore = await storage?.getStore("observability");
    if (obsStore) {
      const filters: Record<string, unknown> = {
        entityType: "agent",
        spanType: "agent_run",
      };
      if (agentName) {
        filters.entityName = agentName;
      }

      try {
        const result = await obsStore.listTraces({
          mode: "page",
          filters,
          pagination: { page: 0, perPage: 1000 }, // 拉取全部再合并排序
          orderBy: {
            field: "startedAt" as const,
            direction: "DESC" as const,
          },
        });

        const agentLogs: LogItem[] = (
          (result as Record<string, unknown>).spans as Array<Record<string, unknown>> ?? []
        ).map((span) => ({
          traceId: span.traceId as string,
          spanId: span.spanId as string,
          entityName: (span.entityName as string) ?? "",
          spanType: span.spanType as string,
          name: span.name as string,
          startedAt: span.startedAt as string,
          endedAt: (span.endedAt as string) ?? null,
          error: span.error ?? null,
          inputPreview: truncatePreview(span.input),
          outputPreview: truncatePreview(span.output),
          callSource: inferCallSource(span as Record<string, unknown>),
        }));
        allLogs.push(...agentLogs);
      } catch {
        // observability 查询失败时不阻塞 workflow 查询
      }
    }

    // 2. 查 workflow 运行记录（直接查 mastra_workflow_snapshot）
    const mastraDbPath = dataPath("mastra.db");
    const db = new Database(mastraDbPath, { readonly: true });
    try {
      const wfRows = db
        .prepare(
          `SELECT workflow_name, run_id, snapshot, createdAt, updatedAt
           FROM mastra_workflow_snapshot
           WHERE workflow_name != 'executionWorkflow' AND workflow_name != 'agentic-loop'
           ORDER BY createdAt DESC
           LIMIT 2000`
        )
        .all() as Array<{
        workflow_name: string;
        run_id: string;
        snapshot: string | null;
        createdAt: string;
        updatedAt: string;
      }>;

      for (const row of wfRows) {
        const error = extractWorkflowError(row.snapshot);
        allLogs.push({
          traceId: row.run_id,
          spanId: row.run_id,
          entityName: row.workflow_name,
          spanType: "workflow_run",
          name: `Workflow: ${row.workflow_name}`,
          startedAt: row.createdAt,
          endedAt: row.updatedAt !== row.createdAt ? row.updatedAt : null,
          error,
          inputPreview: extractWorkflowInput(row.snapshot),
          outputPreview: error ? "" : (row.updatedAt !== row.createdAt ? "完成" : "运行中"),
          callSource: "workflow",
        });
      }
    } finally {
      db.close();
    }

    // 合并排序：按时间倒序
    allLogs.sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );

    // 分页
    const total = allLogs.length;
    const start = page * perPage;
    const paged = allLogs.slice(start, start + perPage);

    return Response.json({
      logs: paged,
      pagination: {
        total,
        page,
        perPage,
        hasMore: start + perPage < total,
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
