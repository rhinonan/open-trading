// src/app/api/douyin/bloggers/route.ts
import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { db } from "@/db";
import { works } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") as
    | "predictor"
    | "technical"
    | null;
  const include = searchParams.get("include");

  try {
    const bloggers = await bloggerService.listBloggers(category || undefined);

    // Attach latest opinion summary per blogger when requested
    if (include === "latest_opinion") {
      const enriched = bloggers.map((blogger) => {
        const latestWork = db
          .select({
            opinionSummary: works.opinionSummary,
            publishedAt: works.publishedAt,
          })
          .from(works)
          .where(
            and(
              eq(works.bloggerId, blogger.id),
              eq(works.transcriptStatus, "done")
            )
          )
          .orderBy(desc(works.publishedAt))
          .limit(1)
          .get();

        return {
          ...blogger,
          latestOpinion: latestWork?.opinionSummary ?? "",
          latestWorkAt: latestWork?.publishedAt ?? null,
        };
      });
      return Response.json(enriched);
    }

    return Response.json(bloggers);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { douyinUid, category } = await request.json();
    if (!douyinUid || typeof douyinUid !== "string") {
      return Response.json(
        { error: "douyinUid is required" },
        { status: 400 }
      );
    }

    // Validate category
    const validCategory = ["predictor", "technical"].includes(category)
      ? category
      : "predictor";

    const blogger = await bloggerService.addBlogger(douyinUid, validCategory);
    return Response.json(blogger, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal error";
    const status = message.includes("已存在") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
