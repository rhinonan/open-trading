import { NextRequest } from "next/server";
import { db } from "@/db";
import { evaluations, predictionItems, bloggers } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const bloggerSlug = searchParams.get("blogger_slug");
  const evalDate = searchParams.get("eval_date");

  try {
    const query = db
      .select({
        evaluation: evaluations,
        items: predictionItems,
        blogger: bloggers,
      })
      .from(evaluations)
      .leftJoin(
        predictionItems,
        eq(evaluations.id, predictionItems.evaluationId)
      )
      .leftJoin(bloggers, eq(evaluations.bloggerId, bloggers.id))
      .orderBy(desc(evaluations.evalDate))
      .$dynamic();

    const conditions = [];
    if (bloggerSlug) conditions.push(eq(bloggers.slug, bloggerSlug));
    if (evalDate) conditions.push(eq(evaluations.evalDate, evalDate));

    const rows =
      conditions.length > 0
        ? await query.where(
            conditions.length === 1 ? conditions[0] : and(...conditions)
          )
        : await query;

    // Group by evaluation
    const grouped = new Map<number, any>();
    for (const row of rows) {
      if (!grouped.has(row.evaluation.id)) {
        grouped.set(row.evaluation.id, {
          ...row.evaluation,
          blogger: row.blogger,
          items: [],
        });
      }
      if (row.items) {
        grouped.get(row.evaluation.id)!.items.push(row.items);
      }
    }

    return Response.json(Array.from(grouped.values()));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Query failed" },
      { status: 500 }
    );
  }
}
