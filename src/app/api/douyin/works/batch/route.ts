// src/app/api/douyin/works/batch/route.ts
import { jsonError } from "@/lib/api-error";
import { batchOperate } from "@/services/douyin/works-service";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;


  try {
    const body = await request.json();
    const { workIds, action } = body;

    if (!Array.isArray(workIds) || workIds.length === 0) {
      return Response.json({ error: "workIds must be a non-empty array" }, { status: 400 });
    }

    if (action !== "transcribe" && action !== "summarize" && action !== "evaluate") {
      return Response.json({ error: "action must be 'transcribe', 'summarize' or 'evaluate'" }, { status: 400 });
    }

    const result = await batchOperate(workIds, action);
    return Response.json(result);
  } catch (err) {
    return jsonError(err, { request: request, status: 500, fallback: "Batch operation failed" });
  }
}
