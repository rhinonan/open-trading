import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { requireAdmin } from "@/lib/admin-auth";
import { jsonError } from "@/lib/api-error";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;


  const { slug } = await ctx.params;
  try {
    const updated = await bloggerService.updateBloggerProfile(slug);
    return Response.json({ success: true, blogger: updated });
  } catch (err) {
    return jsonError(err, { request: req, status: 500, body: "success-false", fallback: "更新失败" });
  }
}
