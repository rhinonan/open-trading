"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { AgentInfo } from "@/hooks/use-agents";

interface AgentDetailProps {
  agent: AgentInfo;
}

export function AgentDetail({ agent }: AgentDetailProps) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [mountedSkills, setMountedSkills] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/skills/mounts")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.mounts) {
          setMountedSkills(d.mounts[agent.key] ?? []);
        }
      })
      .catch(() => {});
  }, [agent.key]);

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

      {/* 已挂载 Skills */}
      <div className="flex items-start gap-2">
        <span className="text-muted-foreground shrink-0">Skills:</span>
        <span className="flex flex-wrap gap-1">
          {mountedSkills.length > 0 ? (
            <>
              {mountedSkills.map((s) => (
                <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                  {s}
                </span>
              ))}
              <Link
                href="/settings/skills"
                className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                管理 <ExternalLink className="h-3 w-3" />
              </Link>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">无</span>
          )}
        </span>
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
