import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { db } from "@/db";
import { works, evaluations, predictionItems } from "@/db/schema";
import { eq, desc, and, ne } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const include = searchParams.get("include");

  try {
    const bloggers = await bloggerService.listBloggers();

    if (include === "latest_opinion") {
      const enriched = bloggers.map((blogger) => {
        // Latest work + opinion
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

        // Accuracy
        const judgmentRows = db
          .select({ judgment: predictionItems.judgment })
          .from(predictionItems)
          .innerJoin(
            evaluations,
            eq(predictionItems.evaluationId, evaluations.id)
          )
          .where(
            and(
              eq(evaluations.bloggerId, blogger.id),
              ne(predictionItems.judgment, "not_applicable")
            )
          )
          .all() as Array<{ judgment: string }>;

        let accuracy: number | null = null;
        if (judgmentRows.length > 0) {
          const correct = judgmentRows.filter(
            (r) =>
              r.judgment === "correct" || r.judgment === "mostly_correct"
          ).length;
          accuracy = Math.round((correct / judgmentRows.length) * 100);
        }

        return {
          ...blogger,
          latestOpinion: latestWork?.opinionSummary ?? "",
          latestWorkAt: latestWork?.publishedAt ?? null,
          accuracy,
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
    const { douyinUid } = await request.json();
    if (!douyinUid || typeof douyinUid !== "string") {
      return Response.json(
        { error: "douyinUid is required" },
        { status: 400 }
      );
    }

    const blogger = await bloggerService.addBlogger(douyinUid);
    return Response.json(blogger, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal error";
    const status = message.includes("已存在") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
