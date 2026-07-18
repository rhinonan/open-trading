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

/**
 * 从 MessagePack 二进制 Buffer 中提取可读文本。
 * 策略：找到 "transcript" 字段标记，提取紧随其后的长 CJK 文本段。
 * 回退：取整个 buffer 去噪后的最长连续可读段。
 */
function extractMsgpackText(buf: Buffer, fieldMarker: string): string {
  try {
    const str = buf.toString("utf8");
    // 在 "transcript" 或 "opinionSummary" 后寻找长 CJK 文本
    // MessagePack 字符串格式：类型标记(1B) + 长度(N bytes) + UTF-8 数据
    // 长文本(>31B)的类型标记范围是 0xd9-0xdb，长度字节位于标记和文本之间
    const idx = str.indexOf(fieldMarker);
    if (idx >= 0) {
      // 跳到 fieldMarker 之后，跳过 MessagePack 头部
      let pos = idx + fieldMarker.length;
      // 跳过类型标记和长度字节（最多 5 字节的 msgpack 头部）
      for (let i = 0; i < 5 && pos < str.length; i++) {
        const code = str.charCodeAt(pos);
        if (code >= 0x20 && code <= 0x7e) break; // 可打印 ASCII，可能是下个字段名
        if (code >= 0x4e00 && code <= 0x9fff) break; // CJK 开始
        if (code >= 0x3000) break; // 全角标点等
        pos++;
      }
      // 从 pos 开始提取可读文本
      let text = "";
      for (let i = pos; i < Math.min(pos + 500, str.length); i++) {
        const code = str.charCodeAt(i);
        if (code >= 0x20 || code >= 0x3000) {
          text += str[i];
        } else if (text.length > 10) {
          break; // 遇到足够长的文本后遇到控制字符，停止
        } else {
          text = ""; // 还不够长，重置
        }
      }
      if (text.trim().length > 10) return text.trim();
    }
    // 回退：清理非可读字符，取最长连续段
    const cleaned = str.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
    return cleaned;
  } catch {
    return "";
  }
}

function extractWorkflowInput(snapshot: Buffer | string | null): string {
  if (!snapshot) return "";
  const buf = Buffer.isBuffer(snapshot) ? snapshot : Buffer.from(snapshot, "utf8");
  const text = extractMsgpackText(buf, "transcript") || extractMsgpackText(buf, "opinionSummary");
  return truncatePreview(text || "", 100);
}

function extractWorkflowError(snapshot: Buffer | string | null): string | null {
  if (!snapshot) return null;
  const str = Buffer.isBuffer(snapshot) ? snapshot.toString("utf8") : snapshot;
  if (str.includes("failed")) return "Workflow execution failed";
  return null;
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
        snapshot: Buffer | null;
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
