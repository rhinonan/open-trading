"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AgentInfo } from "@/hooks/use-agents";

interface AgentDetailProps {
  agent: AgentInfo;
}

export function AgentDetail({ agent }: AgentDetailProps) {
  const [showInstructions, setShowInstructions] = useState(false);

  return (
    <div className="space-y-3 text-sm">
      {agent.flow && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">流程:</span>
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
            {agent.flow}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">模型:</span>
        <span className="font-mono text-xs">{agent.model || "-"}</span>
      </div>

      <div>
        <button
          onClick={() => setShowInstructions((v) => !v)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          {showInstructions ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Instructions
        </button>
        {showInstructions && (
          <pre className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {agent.instructions}
          </pre>
        )}
      </div>
    </div>
  );
}
