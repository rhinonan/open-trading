import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { startTranscribeBloggerWorks } from "@/services/douyin/pipeline-service";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;


  const { slug } = await ctx.params;
  try {
    const blogger = await bloggerService.getBloggerBySlug(slug);
    if (!blogger) {
      return Response.json({ success: false, error: "博主不存在" }, { status: 404 });
    }
    const result = startTranscribeBloggerWorks(blogger.id);
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "转写失败" },
      { status: 500 }
    );
  }
}
