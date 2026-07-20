import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";
import { db } from "@/db";
import { works, predictionItems } from "@/db/schema";
import { eq, desc, and, ne } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { jsonError, errorMessage } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const include = searchParams.get("include");

  try {
    let bloggers = await bloggerService.listBloggers();

    if (include === "latest_opinion") {
      // 雷达页：隐藏停用博主；运维列表（无 include）返回全部
      bloggers = bloggers.filter((b) => b.disabled === 0);
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

        // Accuracy (new schema: prediction_items → works via workId)
        const judgmentRows = db
          .select({ judgment: predictionItems.judgment })
          .from(predictionItems)
          .innerJoin(works, eq(predictionItems.workId, works.id))
          .where(
            and(
              eq(works.bloggerId, blogger.id),
              ne(predictionItems.judgment, "not_applicable"),
              ne(predictionItems.judgment, "not_yet")
            )
          )
          .all() as Array<{ judgment: string }>;

        let accuracy: number | null = null;
        if (judgmentRows.length > 0) {
          const correct = judgmentRows.filter(
            (r) => r.judgment === "correct"
          ).length;
          const mostlyCorrect = judgmentRows.filter(
            (r) => r.judgment === "mostly_correct"
          ).length;
          accuracy = Math.round(
            ((correct + 0.5 * mostlyCorrect) / judgmentRows.length) * 100
          );
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
    return jsonError(err, { request: request, status: 500, fallback: "Internal error" });
  }
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;


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
    const message = errorMessage(err, "Internal error");
    const status = message.includes("已存在") ? 409 : 500;
    return jsonError(err, { request: request, status, fallback: "Internal error" });
  }
}
