// src/app/api/agents/logs/route.ts
// 查询 Mastra observability 落库的 agent 调用 root span（AGENT_RUN）
import { NextRequest } from "next/server";
import { SpanType, EntityType } from "@mastra/core/observability";
import { mastra } from "@/mastra";
import {
  AGENT_ID_BY_KEY,
  AGENT_KEY_BY_ID,
  type AgentKey,
} from "@/mastra/agent-meta";
import { isAgentKey } from "@/mastra/get-agent";
import {
  parseSpanToReplayMessages,
  textFromContent,
} from "@/lib/agent-log-messages";

export interface AgentLogItem {
  traceId: string;
  spanId: string;
  /** 展示用：优先注册键，否则原始 entityName（通常是 agent id） */
  entityName: string;
  /** span 原始 entityName（agent id） */
  entityId: string;
  spanType: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  error: unknown | null;
  inputPreview: string;
  outputPreview: string;
  callSource: "chat" | "workflow" | "test";
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

/** 安全截断，不切断多字节字符 */
function clip(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const chars = Array.from(text);
  return chars.length > maxLen
    ? chars.slice(0, maxLen).join("") + "…"
    : text;
}

/**
 * 列表摘要：优先按 UIMessage / {text} / parts 抽纯文本，
 * 避免把 chat span 的 JSON 直接 stringify 成乱码预览。
 */
function truncatePreview(value: unknown, maxLen = 100): string {
  if (value == null) return "";
  // 尝试当「整段 input」解析（UIMessage[] / string / {text}）
  const asMessages = parseSpanToReplayMessages(value, null);
  if (asMessages.length > 0) {
    const joined = asMessages.map((m) => m.text).filter(Boolean).join(" / ");
    if (joined) return clip(joined, maxLen);
  }
  const fromContent = textFromContent(value).trim();
  if (fromContent) return clip(fromContent, maxLen);
  if (typeof value === "string") return clip(value, maxLen);
  try {
    return clip(JSON.stringify(value), maxLen);
  } catch {
    return "";
  }
}

function inferCallSource(span: {
  threadId?: string | null;
  runId?: string | null;
}): "chat" | "workflow" | "test" {
  if (span.threadId) return "chat";
  if (span.runId) return "workflow";
  return "test";
}

/** 查询参数 agentName 支持注册键或 agent id */
function resolveEntityNameFilter(agentName: string): string {
  if (isAgentKey(agentName)) {
    return AGENT_ID_BY_KEY[agentName as AgentKey];
  }
  return agentName;
}

function displayEntityName(raw: string): string {
  return AGENT_KEY_BY_ID[raw] ?? raw;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const agentNameParam = searchParams.get("agentName") || undefined;
  const page = Math.max(0, Number(searchParams.get("page")) || 0);
  const perPage = Math.min(
    Math.max(1, Number(searchParams.get("perPage")) || 20),
    100,
  );

  try {
    const storage = mastra.getStorage();
    const obsStore = await storage?.getStore("observability");
    if (!obsStore) {
      return Response.json(
        { error: "Observability store not available" },
        { status: 500 },
      );
    }

    const entityNameFilter = agentNameParam
      ? resolveEntityNameFilter(agentNameParam)
      : undefined;

    const result = await obsStore.listTraces({
      mode: "page",
      filters: {
        entityType: EntityType.AGENT,
        spanType: SpanType.AGENT_RUN,
        ...(entityNameFilter ? { entityName: entityNameFilter } : {}),
      },
      pagination: { page, perPage },
      orderBy: { field: "startedAt", direction: "DESC" },
    });

    const logs: AgentLogItem[] = (result.spans ?? []).map((span) => {
      const s = span as {
        traceId: string;
        spanId: string;
        entityName?: string | null;
        spanType: string;
        name: string;
        startedAt: Date | string;
        endedAt?: Date | string | null;
        error?: unknown | null;
        input?: unknown;
        output?: unknown;
        threadId?: string | null;
        runId?: string | null;
      };
      const rawEntity = s.entityName ?? "";
      return {
        traceId: s.traceId,
        spanId: s.spanId,
        entityName: displayEntityName(rawEntity),
        entityId: rawEntity,
        spanType: s.spanType,
        name: s.name,
        startedAt: toIso(s.startedAt),
        endedAt: s.endedAt ? toIso(s.endedAt) : null,
        error: s.error ?? null,
        inputPreview: truncatePreview(s.input),
        outputPreview: truncatePreview(s.output),
        callSource: inferCallSource(s),
        runId: s.runId ?? null,
        threadId: s.threadId ?? null,
      };
    });

    const pagination = result.pagination ?? {
      total: logs.length,
      page,
      perPage,
      hasMore: false,
    };

    return Response.json({
      logs,
      pagination: {
        total: pagination.total,
        page: pagination.page,
        perPage:
          typeof pagination.perPage === "number" ? pagination.perPage : perPage,
        hasMore: pagination.hasMore,
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
