// src/app/api/douyin/bloggers/[id]/route.ts
import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/douyin/bloggers/[id]">
) {
  const { id } = await ctx.params;
  const blogger = await bloggerService.getBloggerById(Number(id));
  if (!blogger) {
    return Response.json({ error: "Blogger not found" }, { status: 404 });
  }
  return Response.json(blogger);
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/douyin/bloggers/[id]">
) {
  const { id } = await ctx.params;
  await bloggerService.deleteBlogger(Number(id));
  return Response.json({ success: true });
}
