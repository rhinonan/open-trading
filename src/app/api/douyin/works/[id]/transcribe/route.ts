// src/app/api/douyin/works/[id]/transcribe/route.ts
import { NextRequest } from "next/server";
import { transcribeWork } from "@/services/douyin/works-service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const workId = parseInt(id, 10);
    if (isNaN(workId)) {
      return Response.json({ error: "Invalid work ID" }, { status: 400 });
    }

    const result = await transcribeWork(workId);
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
