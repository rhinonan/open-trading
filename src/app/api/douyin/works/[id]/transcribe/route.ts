// src/app/api/douyin/works/[id]/transcribe/route.ts
import { NextRequest } from "next/server";
import { startTranscribeWork } from "@/services/douyin/pipeline-service";
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

    const result = startTranscribeWork(workId);
    if (!result.success) {
      const status = result.error === "该作品正在转写中" ? 409 : 400;
      return Response.json({ error: result.error }, { status });
    }
    return Response.json({ success: true, workId });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
