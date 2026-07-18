// src/app/api/skills/staging/[name]/review/route.ts
import { NextRequest } from "next/server";
import { mastra } from "@/mastra";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await ctx.params;
    const run = await mastra.getWorkflow("skillReviewWorkflow").createRun();
    const result = await run.start({ inputData: { name } });
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "审查失败" },
      { status: 500 },
    );
  }
}
