import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { summarizeBloggerWorks } from "@/services/douyin/works-service";
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
    const result = await summarizeBloggerWorks(blogger.id);
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "观点提取失败" },
      { status: 500 }
    );
  }
}
