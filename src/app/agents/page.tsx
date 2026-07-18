"use client";

import { useState } from "react";
import { useAgents } from "@/hooks/use-agents";
import { AgentList } from "@/components/agents/agent-list";
import { AgentDetail } from "@/components/agents/agent-detail";
import { AgentChat } from "@/components/agents/agent-chat";
import { Loader2, Bot } from "lucide-react";

export default function AgentsPage() {
  const { agents, loading, error } = useAgents();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedAgent = agents.find((a) => a.key === selectedKey) ?? null;

  return (
    <div className="flex gap-4 h-[calc(100vh-12rem)]">
        {/* 左侧面板 */}
        <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Agent 列表
            </h2>
            {loading ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
              </p>
            ) : error ? (
              <p className="text-sm text-red-500">{error}</p>
            ) : (
              <AgentList
                agents={agents}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
              />
            )}
          </div>

          {selectedAgent && (
            <div className="rounded-lg border bg-card p-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Agent 配置
              </h2>
              <AgentDetail agent={selectedAgent} />
            </div>
          )}
        </div>

        {/* 右侧对话区 */}
        <div className="flex-1 min-w-0">
          {selectedAgent ? (
            <AgentChat key={selectedAgent.key} agentKey={selectedAgent.key} />
          ) : (
            <div className="flex items-center justify-center h-full rounded-lg border bg-card text-muted-foreground">
              <div className="text-center space-y-2">
                <Bot className="h-12 w-12 mx-auto opacity-30" />
                <p className="text-sm">选择一个 Agent 开始对话</p>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
