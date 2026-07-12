// src/app/api/douyin/bloggers/[id]/route.ts
import { NextRequest } from "next/server";
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import * as bloggerService from "@/services/douyin/blogger-service";

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/douyin/bloggers/[id]">
) {
  const { id } = await ctx.params;
  const bloggerId = Number(id);
  const blogger = await bloggerService.getBloggerById(bloggerId);
  if (!blogger) {
    return Response.json({ error: "Blogger not found" }, { status: 404 });
  }

  // Support ?include=works to return works list
  const include = req.nextUrl.searchParams.get("include");
  if (include === "works") {
    const worksList = db
      .select()
      .from(works)
      .where(eq(works.bloggerId, bloggerId))
      .orderBy(desc(works.publishedAt))
      .limit(50)
      .all();
    return Response.json({ ...blogger, works: worksList });
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
