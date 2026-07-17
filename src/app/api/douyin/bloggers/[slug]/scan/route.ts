import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { scanBlogger } from "@/services/douyin/scanner-service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  try {
    const blogger = await bloggerService.getBloggerBySlug(slug);
    if (!blogger) {
      return Response.json({ success: false, error: "博主不存在" }, { status: 404 });
    }
    const result = await scanBlogger(blogger);
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "扫描失败" },
      { status: 500 }
    );
  }
}
