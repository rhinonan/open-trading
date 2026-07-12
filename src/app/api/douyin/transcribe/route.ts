// src/app/api/douyin/transcribe/route.ts
import { transcribePendingWorks } from "@/services/douyin/pipeline-service";

export async function POST(request: Request) {
  try {
    let body: { workId?: number; concurrency?: number; maxTasks?: number } = {};
    try {
      body = await request.json();
    } catch {
      // body 可选
    }

    const result = await transcribePendingWorks({
      concurrency: body.concurrency ?? 2,
      maxTasks: body.maxTasks ?? 20,
    });

    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
