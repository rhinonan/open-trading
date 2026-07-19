"use client";

import { Loader2, Bot, AlertTriangle, Clock } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import type { SpanDetail, LogItem } from "@/hooks/use-agent-logs";
import { AGENT_KEY_BY_ID } from "@/mastra/agent-meta";
import { parseSpanToReplayMessages } from "@/lib/agent-log-messages";

interface AgentLogDetailProps {
  spans: SpanDetail[];
  loading: boolean;
  error: string;
  log: LogItem | null;
}

function findRootSpan(spans: SpanDetail[]): SpanDetail | null {
  return (
    spans.find((s) => s.spanType === "agent_run" && !s.parentSpanId) ??
    spans.find((s) => s.spanType === "agent_run") ??
    spans[0] ??
    null
  );
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
      <div className="flex items-center justify-center h-full py-16 text-danger text-sm">
        {error}
      </div>
    );
  }

  const root = findRootSpan(spans);
  const messages = root
    ? parseSpanToReplayMessages(root.input, root.output)
    : [];
  const entityName = root
    ? (AGENT_KEY_BY_ID[root.entityName] ??
      (root.entityName || root.name))
    : "";
  const hasError = root?.error != null;

  if (!root || (messages.length === 0 && !hasError)) {
    return (
      <ConversationEmptyState
        icon={<Bot className="size-12" />}
        title="暂无对话内容"
        description={
          spans.length
            ? `该 trace 含 ${spans.length} 个 span，但未解析到可回放消息`
            : "该次调用没有记录到输入或输出"
        }
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 元信息条 */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b text-xs text-muted-foreground bg-muted/30">
        <span className="font-medium text-foreground">{entityName}</span>
        {root.startedAt && (
          <span>{new Date(root.startedAt).toLocaleString("zh-CN")}</span>
        )}
        {root.endedAt && root.startedAt && (
          <span>
            耗时{" "}
            {(
              (new Date(root.endedAt).getTime() -
                new Date(root.startedAt).getTime()) /
              1000
            ).toFixed(1)}
            s
          </span>
        )}
        <span>{spans.length} spans</span>
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

      {!root.endedAt && !hasError && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-warning bg-warning/10 border-b">
          <Clock className="h-3 w-3" />
          运行中…
        </div>
      )}

      {/* 与 AgentChat 相同的 ai-elements 对话壳，只读 */}
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="px-4 py-4">
          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                <MessageResponse>{message.text}</MessageResponse>
              </MessageContent>
            </Message>
          ))}

          {hasError ? (
            <Message from="assistant">
              <MessageContent>
                <div className="flex items-start gap-2 text-danger">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">调用出错</p>
                    <pre className="text-xs mt-1 whitespace-pre-wrap font-sans">
                      {typeof root.error === "string"
                        ? root.error
                        : JSON.stringify(root.error, null, 2)}
                    </pre>
                  </div>
                </div>
              </MessageContent>
            </Message>
          ) : null}

          {!hasError && messages.every((m) => m.role === "user") ? (
            <Message from="assistant">
              <MessageContent>
                <span className="text-muted-foreground italic text-sm">
                  无输出或仍在运行…
                </span>
              </MessageContent>
            </Message>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}
