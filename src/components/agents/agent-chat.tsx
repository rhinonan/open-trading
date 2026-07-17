"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageSquare } from "lucide-react";
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
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";

interface AgentChatProps {
  agentKey: string;
}

export function AgentChat({ agentKey }: AgentChatProps) {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/chat?agentKey=${agentKey}`,
    }),
  });

  const handleSubmit = (message: { text: string }) => {
    if (message.text.trim()) {
      sendMessage({ text: message.text });
    }
  };

  return (
    <div className="flex flex-col h-full rounded-lg border card-elevated bg-card">
      <Conversation className="flex-1 min-h-0">
        <ConversationContent className="px-4 py-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageSquare className="size-12" />}
              title="开始对话"
              description={`向 ${agentKey} 发送消息进行测试`}
            />
          ) : (
            messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <MessageResponse key={`${message.id}-${i}`}>
                          {part.text}
                        </MessageResponse>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t px-4 py-3">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="输入测试消息..."
              className="min-h-[60px] max-h-[160px]"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <div className="flex-1" />
            <PromptInputSubmit
              status={
                status === "streaming"
                  ? "streaming"
                  : status === "submitted"
                    ? "submitted"
                    : "ready"
              }
              disabled={status === "streaming" || status === "submitted"}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
