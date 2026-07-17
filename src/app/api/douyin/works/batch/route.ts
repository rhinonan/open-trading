// src/app/api/douyin/works/batch/route.ts
import { batchOperate } from "@/services/douyin/works-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { workIds, action } = body;

    if (!Array.isArray(workIds) || workIds.length === 0) {
      return Response.json({ error: "workIds must be a non-empty array" }, { status: 400 });
    }

    if (action !== "transcribe" && action !== "summarize") {
      return Response.json({ error: "action must be 'transcribe' or 'summarize'" }, { status: 400 });
    }

    const result = await batchOperate(workIds, action);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Batch operation failed" },
      { status: 500 }
    );
  }
}
