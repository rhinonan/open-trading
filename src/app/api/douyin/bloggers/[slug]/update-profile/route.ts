import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;


  const { slug } = await ctx.params;
  try {
    const updated = await bloggerService.updateBloggerProfile(slug);
    return Response.json({ success: true, blogger: updated });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "更新失败" },
      { status: 500 }
    );
  }
}
