import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { evaluateBlogger } from "@/services/douyin/evaluator-service";

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
    const result = await evaluateBlogger(blogger.id);
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "评判失败" },
      { status: 500 }
    );
  }
}
