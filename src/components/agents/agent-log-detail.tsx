"use client";

import { Loader2, Bot, AlertTriangle, Clock } from "lucide-react";
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
import type { SpanDetail, LogItem } from "@/hooks/use-agent-logs";

interface AgentLogDetailProps {
  spans: SpanDetail[];
  loading: boolean;
  error: string;
  log: LogItem | null;
}

/**
 * 从 span 的 input/output 中提取人类可读的文本。
 * input/output 可能直接是字符串，也可能是 MessagePack 解码后的对象。
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

/** 找到 AGENT_RUN 类型根 span，提取对话信息 */
function findConversationSpans(spans: SpanDetail[]) {
  const rootSpan = spans.find(
    (s) => s.spanType === "agent_run" && !s.parentSpanId
  );
  if (!rootSpan) {
    // 兼容 workflow_run：直接用第一个 span
    const first = spans[0];
    if (!first) return null;
    return {
      userInput: extractText(first.input),
      assistantOutput: extractText(first.output),
      error: first.error,
      entityName: first.entityName,
      startedAt: first.startedAt,
      endedAt: first.endedAt,
    };
  }

  return {
    userInput: extractText(rootSpan.input),
    assistantOutput: extractText(rootSpan.output),
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
  log,
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
        title="暂无对话内容"
        description="该次调用没有记录到输入或输出"
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 元信息条 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b text-xs text-muted-foreground bg-muted/30">
        <span className="font-medium text-foreground">{conv.entityName}</span>
        <span>
          {new Date(conv.startedAt).toLocaleString("zh-CN")}
        </span>
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
        {log?.callSource && (
          <span className="bg-secondary px-1.5 py-0.5 rounded">
            {log.callSource === "chat"
              ? "聊天"
              : log.callSource === "workflow"
                ? "工作流"
                : "测试"}
          </span>
        )}
      </div>

      {!conv.endedAt && !conv.error && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 border-b">
          <Clock className="h-3 w-3" />
          运行中…
        </div>
      )}

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
                    <pre className="text-xs mt-1 whitespace-pre-wrap font-mono">
                      {typeof conv.error === "string"
                        ? conv.error
                        : JSON.stringify(conv.error, null, 2)}
                    </pre>
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
          ) : null}
        </ConversationContent>
      </Conversation>
    </div>
  );
}
