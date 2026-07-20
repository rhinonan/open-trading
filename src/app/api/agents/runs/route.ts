// src/app/api/agents/runs/route.ts
import { jsonError } from "@/lib/api-error";
import { NextRequest } from "next/server";
import { mastra } from "@/mastra";

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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const page = Math.max(0, Number(searchParams.get("page")) || 0);
  const perPage = Math.min(Math.max(1, Number(searchParams.get("perPage")) || 10), 50);

  try {
    const workflow = mastra.getWorkflow("transcribeWorkWorkflow");
    const { runs, total } = await workflow.listWorkflowRuns({ page, perPage });

    const mapped: RunSummary[] = runs.map((run) => {
      const base = {
        runId: run.runId,
        workflowName: run.workflowName,
        createdAt: new Date(run.createdAt).toISOString(),
        updatedAt: new Date(run.updatedAt).toISOString(),
      };
      try {
        const snapshot =
          typeof run.snapshot === "string"
            ? JSON.parse(run.snapshot)
            : run.snapshot;
        const steps: RunStep[] = Object.entries(snapshot?.context ?? {})
          .filter(([key]) => key !== "input")
          .map(([id, value]) => ({
            id,
            status: (value as { status?: string })?.status ?? "unknown",
          }));
        return { ...base, status: snapshot?.status ?? "unknown", steps };
      } catch {
        // 快照解析失败：该行降级，不影响其余行
        return { ...base, status: "unknown", steps: [], parseError: true };
      }
    });

    return Response.json({ runs: mapped, total });
  } catch (err) {
    return jsonError(err, { request: request, status: 500, fallback: "Internal error" });
  }
}
