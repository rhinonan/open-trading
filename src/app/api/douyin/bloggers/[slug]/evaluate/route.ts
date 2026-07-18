// src/app/api/douyin/bloggers/[slug]/evaluate/route.ts
// Task 6 接入 eval-queue + eval-runner 后实物化；当前为占位
import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";

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
    return Response.json({ success: true, enqueued: 0, message: "待 eval-queue 接入（Task 6）" });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "评判失败" },
      { status: 500 }
    );
  }
}
