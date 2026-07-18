import { NextRequest } from "next/server";
import { db } from "@/db";
import { predictionItems, works, bloggers } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { PredictionItem } from "@/types";

/** GET /api/douyin/records?blogger_slug=xxx&workId=xxx */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const bloggerSlug = searchParams.get("blogger_slug");
    const workIdParam = searchParams.get("workId");

    let items: PredictionItem[];

    if (bloggerSlug) {
      const blogger = db
        .select({ id: bloggers.id })
        .from(bloggers)
        .where(eq(bloggers.slug, bloggerSlug))
        .get();
      if (!blogger) {
        return Response.json([]);
      }
      const bloggerWorkIds = db
        .select({ id: works.id })
        .from(works)
        .where(eq(works.bloggerId, blogger.id))
        .all()
        .map((r) => r.id);
      if (bloggerWorkIds.length === 0) {
        return Response.json([]);
      }
      items = db
        .select()
        .from(predictionItems)
        .where(inArray(predictionItems.workId, bloggerWorkIds))
        .all() as PredictionItem[];
      // Backward compat: return array directly for blogger_slug queries
      return Response.json(items);
    }

    if (workIdParam) {
      const parsed = parseInt(workIdParam, 10);
      if (isNaN(parsed)) {
        return Response.json({ success: false, error: "无效 workId" }, { status: 400 });
      }
      items = db
        .select()
        .from(predictionItems)
        .where(eq(predictionItems.workId, parsed))
        .all() as PredictionItem[];
      return Response.json({ success: true, items });
    }

    // Return all items
    items = db.select().from(predictionItems).all() as PredictionItem[];
    return Response.json({ success: true, items });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
