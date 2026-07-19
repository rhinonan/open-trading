// src/app/api/douyin/works/[id]/summarize/route.ts
import { NextRequest } from "next/server";
import { summarizeWork } from "@/services/douyin/works-service";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;


  try {
    const { id } = await ctx.params;
    const workId = parseInt(id, 10);
    if (isNaN(workId)) {
      return Response.json({ error: "Invalid work ID" }, { status: 400 });
    }

    const result = await summarizeWork(workId);
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json({ success: true, workId, summary: result.summary });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Summarization failed" },
      { status: 500 }
    );
  }
}
