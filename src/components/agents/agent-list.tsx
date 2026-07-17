"use client";

import { Bot } from "lucide-react";
import type { AgentInfo } from "@/hooks/use-agents";

interface AgentListProps {
  agents: AgentInfo[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function AgentList({ agents, selectedKey, onSelect }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground px-3 py-8 text-center">
        暂无已注册的 Agent
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {agents.map((agent) => {
        const isSelected = agent.key === selectedKey;
        return (
          <button
            key={agent.key}
            onClick={() => onSelect(agent.key)}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isSelected
                ? "bg-primary/10 text-primary border border-primary/20"
                : "hover:bg-muted border border-transparent"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <Bot className="h-4 w-4 shrink-0" />
              <span className="truncate">{agent.name}</span>
            </div>
            {agent.description && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {agent.description}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
