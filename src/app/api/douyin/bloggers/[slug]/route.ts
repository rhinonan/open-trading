import { NextRequest } from "next/server";
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import * as bloggerService from "@/services/douyin/blogger-service";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const blogger = await bloggerService.getBloggerBySlug(slug);
  if (!blogger) {
    return Response.json({ error: "Blogger not found" }, { status: 404 });
  }

  const include = req.nextUrl.searchParams.get("include");
  if (include === "works") {
    const worksList = db
      .select()
      .from(works)
      .where(eq(works.bloggerId, blogger.id))
      .orderBy(desc(works.publishedAt))
      .limit(50)
      .all();
    return Response.json({ ...blogger, works: worksList });
  }

  return Response.json(blogger);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const blogger = await bloggerService.getBloggerBySlug(slug);
  if (!blogger) {
    return Response.json({ error: "Blogger not found" }, { status: 404 });
  }
  await bloggerService.deleteBlogger(blogger.id);
  return Response.json({ success: true });
}
