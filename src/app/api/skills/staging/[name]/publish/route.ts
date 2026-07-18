// src/app/api/skills/staging/[name]/publish/route.ts
import { NextRequest } from "next/server";
import * as skillService from "@/services/skills-service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await ctx.params;
    skillService.publishStaging(name);
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "发布失败" },
      { status: 500 },
    );
  }
}
