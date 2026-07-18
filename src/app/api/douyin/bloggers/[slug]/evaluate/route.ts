import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { enqueueForEvaluation } from "@/services/douyin/eval-queue";
import { getEvalRunner } from "@/services/douyin/eval-runner";

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
    const count = enqueueForEvaluation({ bloggerId: blogger.id });
    getEvalRunner().kick();
    return Response.json({ success: true, enqueued: count });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "入队失败" },
      { status: 500 }
    );
  }
}
