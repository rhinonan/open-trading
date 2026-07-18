"use client";

import { Loader2, Bot, AlertTriangle } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import type { SpanDetail } from "@/hooks/use-agent-logs";

interface AgentLogDetailProps {
  spans: SpanDetail[];
  loading: boolean;
  error: string;
}

/**
 * 从 span 的 input/output 中提取人类可读的文本。
 * Mastra observability 记录的 input/output 可能是：
 * - 直接的字符串
 * - { messages: [...] } 对象（AI SDK 格式）
 * - 其他 JSON 结构
 */
function extractText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return extractText(parsed);
    } catch {
      return value;
    }
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.messages)) {
      return (obj.messages as Array<Record<string, unknown>>)
        .map((m) => {
          const role = m.role === "user" ? "用户" : "助手";
          const content =
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content);
          return `**${role}:** ${content}`;
        })
        .join("\n\n");
    }
    for (const key of ["text", "content", "prompt", "query", "input"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/** 找到 AGENT_RUN 类型的根 span，从中提取用户输入和 agent 输出 */
function findConversationSpans(spans: SpanDetail[]) {
  const rootSpan = spans.find(
    (s) => s.spanType === "agent_run" && !s.parentSpanId
  );
  if (!rootSpan) return null;

  const userInput = extractText(rootSpan.input);
  const assistantOutput = extractText(rootSpan.output);

  return {
    userInput,
    assistantOutput,
    error: rootSpan.error,
    entityName: rootSpan.entityName,
    startedAt: rootSpan.startedAt,
    endedAt: rootSpan.endedAt,
  };
}

export function AgentLogDetail({
  spans,
  loading,
  error,
}: AgentLogDetailProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full py-16 text-red-500 text-sm">
        {error}
      </div>
    );
  }

  const conv = findConversationSpans(spans);

  if (!conv || (!conv.userInput && !conv.assistantOutput)) {
    return (
      <ConversationEmptyState
        icon={<Bot className="size-12" />}
        title="选择一条日志"
        description="从左侧列表选择一条日志查看对话回放"
      />
    );
  }

  return (
    <div className="flex flex-col h-full rounded-lg border bg-card">
      {/* 元信息条 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b text-xs text-muted-foreground bg-muted/30">
        <span className="font-medium text-foreground">{conv.entityName}</span>
        <span>{new Date(conv.startedAt).toLocaleString("zh-CN")}</span>
        {conv.endedAt && (
          <span>
            耗时{" "}
            {(
              (new Date(conv.endedAt).getTime() -
                new Date(conv.startedAt).getTime()) /
              1000
            ).toFixed(1)}
            s
          </span>
        )}
      </div>

      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="px-4 py-4">
          {conv.userInput && (
            <Message from="user">
              <MessageContent>
                <MessageResponse>{conv.userInput}</MessageResponse>
              </MessageContent>
            </Message>
          )}

          {conv.error ? (
            <Message from="assistant">
              <MessageContent>
                <div className="flex items-start gap-2 text-red-500">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">调用出错</p>
                    <p className="text-xs mt-1">
                      {typeof conv.error === "string"
                        ? conv.error
                        : JSON.stringify(conv.error, null, 2)}
                    </p>
                  </div>
                </div>
              </MessageContent>
            </Message>
          ) : conv.assistantOutput ? (
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>{conv.assistantOutput}</MessageResponse>
              </MessageContent>
            </Message>
          ) : (
            <Message from="assistant">
              <MessageContent>
                <span className="text-muted-foreground italic text-sm">
                  运行中…
                </span>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
      </Conversation>
    </div>
  );
}
