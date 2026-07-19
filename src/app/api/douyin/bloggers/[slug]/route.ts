import { NextRequest } from "next/server";
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import * as bloggerService from "@/services/douyin/blogger-service";
import { requireAdmin } from "@/lib/admin-auth";

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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { slug } = await ctx.params;
  try {
    const body = await req.json();
    if (typeof body.disabled !== "boolean") {
      return Response.json({ error: "disabled 必须为 boolean" }, { status: 400 });
    }
    const blogger = await bloggerService.setBloggerDisabled(slug, body.disabled);
    return Response.json({ success: true, blogger });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "更新失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;


  const { slug } = await ctx.params;
  const blogger = await bloggerService.getBloggerBySlug(slug);
  if (!blogger) {
    return Response.json({ error: "Blogger not found" }, { status: 404 });
  }
  await bloggerService.deleteBlogger(blogger.id);
  return Response.json({ success: true });
}
