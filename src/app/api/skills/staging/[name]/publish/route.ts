// src/app/api/skills/staging/[name]/publish/route.ts
import { NextRequest } from "next/server";
import * as skillService from "@/services/skills-service";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ name: string }> },
) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const { name: batchId } = await ctx.params;
    const { names, overwrite } = await req.json();
    if (!names || !Array.isArray(names) || names.length === 0) {
      return Response.json({ success: false, error: "请提供要安装的 skill 名称列表" }, { status: 400 });
    }
    const result = skillService.publishCandidates(batchId, names, {
      overwrite: overwrite === true,
    });
    if (result.published.length === 0 && result.errors.length > 0) {
      return Response.json(
        { success: false, error: result.errors.join("; "), ...result },
        { status: 409 },
      );
    }
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "发布失败" },
      { status: 500 },
    );
  }
}
