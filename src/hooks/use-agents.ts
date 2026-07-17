"use client";

import { useState, useEffect } from "react";

export interface AgentInfo {
  key: string;
  name: string;
  description: string;
  flow: string;
  model: string;
  instructions: string;
}

export function useAgents() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agents");
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setAgents(data.agents ?? []);
        } else {
          setError(`加载失败: ${data.error}`);
        }
      } catch {
        if (!cancelled) setError("加载失败，请检查网络");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { agents, loading, error };
}
