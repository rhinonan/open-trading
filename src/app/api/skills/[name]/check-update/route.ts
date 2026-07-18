// src/app/api/skills/[name]/check-update/route.ts
import { NextRequest } from "next/server";
import * as skillService from "@/services/skills-service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await ctx.params;
    const result = await skillService.checkUpdate(name);
    if (!result) return Response.json({ success: false, error: "Skill 不存在" }, { status: 404 });
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "检查更新失败" },
      { status: 500 }
    );
  }
}
