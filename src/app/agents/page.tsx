"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Play,
  History,
} from "lucide-react";

interface AgentInfo {
  key: string;
  name: string;
  description: string;
  flow: string;
  model: string;
  instructions: string;
}

interface RunStep {
  id: string;
  status: string;
}

interface RunSummary {
  runId: string;
  workflowName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  steps: RunStep[];
  parseError?: boolean;
}

const PER_PAGE = 10;

function statusBadgeClass(status: string): string {
  if (status === "success") return "bg-green-500/15 text-green-600";
  if (status === "failed") return "bg-red-500/15 text-red-500";
  return "bg-muted text-muted-foreground";
}

function formatDuration(createdAt: string, updatedAt: string): string {
  const ms = new Date(updatedAt).getTime() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AgentsPage() {
  // --- Agent 列表状态 ---
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState("");
  const [expandedInstructions, setExpandedInstructions] = useState<Record<string, boolean>>({});

  // --- 测试运行状态（按 agent key 分开） ---
  const [testInput, setTestInput] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [testError, setTestError] = useState<Record<string, string>>({});
  const [testRunning, setTestRunning] = useState<Record<string, boolean>>({});

  // --- 运行历史状态 ---
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState("");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/agents");
        const data = await res.json();
        if (res.ok) {
          setAgents(data.agents ?? []);
        } else {
          setAgentsError(`加载失败: ${data.error}`);
        }
      } catch {
        setAgentsError("加载失败，请检查网络");
      } finally {
        setAgentsLoading(false);
      }
    })();
  }, []);

  const fetchRuns = useCallback(async (targetPage: number, isInitial = false) => {
    if (!isInitial) {
      setRunsLoading(true);
      setRunsError("");
    }
    try {
      const res = await fetch(`/api/agents/runs?page=${targetPage}&perPage=${PER_PAGE}`);
      const data = await res.json();
      if (res.ok) {
        setRuns(data.runs ?? []);
        setTotal(data.total ?? 0);
        setPage(targetPage);
      } else {
        setRunsError(`加载失败: ${data.error}`);
      }
    } catch {
      setRunsError("加载失败，请检查网络");
    }
    setRunsLoading(false);
  }, []);

  useEffect(() => { fetchRuns(0, true); }, [fetchRuns]);

  const handleTest = async (agentKey: string) => {
    const input = (testInput[agentKey] ?? "").trim();
    if (!input) return;
    setTestRunning((s) => ({ ...s, [agentKey]: true }));
    setTestResult((s) => ({ ...s, [agentKey]: "" }));
    setTestError((s) => ({ ...s, [agentKey]: "" }));
    try {
      const res = await fetch("/api/agents/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentKey, input }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult((s) => ({ ...s, [agentKey]: data.text }));
      } else {
        setTestError((s) => ({ ...s, [agentKey]: `运行失败: ${data.error}` }));
      }
    } catch {
      setTestError((s) => ({ ...s, [agentKey]: "运行失败，请检查网络" }));
    }
    setTestRunning((s) => ({ ...s, [agentKey]: false }));
  };

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent 管理</h1>
        <p className="text-muted-foreground mt-1">
          已注册 Agent 的配置、手动测试与 Workflow 运行历史
        </p>
      </div>

      {/* Agent 列表 */}
      {agentsLoading ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
            </p>
          </CardContent>
        </Card>
      ) : agentsError ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-red-500">{agentsError}</p>
          </CardContent>
        </Card>
      ) : (
        agents.map((agent) => (
          <Card key={agent.key}>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Bot className="h-4 w-4" />
                {agent.name}
                {agent.flow && (
                  <span className="text-xs font-normal rounded bg-muted px-2 py-0.5 text-muted-foreground">
                    {agent.flow}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {agent.description && (
                <p className="text-sm text-muted-foreground">{agent.description}</p>
              )}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">当前模型:</span>
                <span className="font-mono">{agent.model || "-"}</span>
              </div>

              {/* instructions 折叠 */}
              <div>
                <button
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setExpandedInstructions((s) => ({ ...s, [agent.key]: !s[agent.key] }))
                  }
                >
                  {expandedInstructions[agent.key] ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  Instructions
                </button>
                {expandedInstructions[agent.key] && (
                  <pre className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-3 whitespace-pre-wrap">
                    {agent.instructions}
                  </pre>
                )}
              </div>

              {/* 测试运行 */}
              <div className="space-y-2 border-t pt-4">
                <h3 className="text-sm font-medium text-muted-foreground">测试运行</h3>
                <textarea
                  value={testInput[agent.key] ?? ""}
                  onChange={(e) =>
                    setTestInput((s) => ({ ...s, [agent.key]: e.target.value }))
                  }
                  placeholder="输入测试文本..."
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button
                  size="sm"
                  onClick={() => handleTest(agent.key)}
                  disabled={testRunning[agent.key] || !(testInput[agent.key] ?? "").trim()}
                >
                  {testRunning[agent.key] ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  运行
                </Button>
                {testResult[agent.key] && (
                  <p className="text-sm bg-muted/50 rounded-md p-3">{testResult[agent.key]}</p>
                )}
                {testError[agent.key] && (
                  <p className="text-sm text-red-500 bg-muted/50 rounded-md p-3">
                    {testError[agent.key]}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* 运行历史 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <History className="h-4 w-4" />
            Workflow 运行历史
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {runsLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
            </p>
          ) : runsError ? (
            <p className="text-sm text-red-500">{runsError}</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无运行记录</p>
          ) : (
            <>
              <div className="space-y-2">
                {runs.map((run) => (
                  <div key={run.runId} className="rounded-md border">
                    <button
                      className="flex w-full items-center gap-3 p-3 text-left text-sm"
                      onClick={() =>
                        setExpandedRun(expandedRun === run.runId ? null : run.runId)
                      }
                    >
                      {expandedRun === run.runId ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="font-mono text-xs">{run.runId.slice(0, 8)}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${statusBadgeClass(run.status)}`}
                      >
                        {run.status}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(run.createdAt).toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground w-16 text-right">
                        {formatDuration(run.createdAt, run.updatedAt)}
                      </span>
                    </button>
                    {expandedRun === run.runId && (
                      <div className="border-t px-3 py-2 space-y-1">
                        {run.parseError ? (
                          <p className="text-xs text-red-500">快照解析失败</p>
                        ) : run.steps.length === 0 ? (
                          <p className="text-xs text-muted-foreground">无步骤记录</p>
                        ) : (
                          run.steps.map((step) => (
                            <div key={step.id} className="flex items-center gap-2 text-xs">
                              <span className="font-mono">{step.id}</span>
                              <span
                                className={`rounded px-1.5 py-0.5 ${statusBadgeClass(step.status)}`}
                              >
                                {step.status}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 分页 */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  共 {total} 条 · 第 {page + 1}/{totalPages} 页
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 0 || runsLoading}
                    onClick={() => fetchRuns(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> 上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page + 1 >= totalPages || runsLoading}
                    onClick={() => fetchRuns(page + 1)}
                  >
                    下一页 <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
