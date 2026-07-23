import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { startTranscribeBloggerWorks } from "@/services/douyin/pipeline-service";
import { requireAdmin } from "@/lib/admin-auth";
import { jsonError } from "@/lib/api-error";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { slug } = await ctx.params;
  try {
    const blogger = await bloggerService.getBloggerBySlug(slug);
    if (!blogger) {
      return Response.json({ success: false, error: "博主不存在" }, { status: 404 });
    }
    const result = await startTranscribeBloggerWorks(blogger.id);
    return Response.json({ success: true, ...result });
  } catch (err) {
    return jsonError(err, { request: req, status: 500, body: "success-false", fallback: "转写失败" });
  }
}
