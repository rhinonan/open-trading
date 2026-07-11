// src/app/api/douyin/evaluate/route.ts
import { evaluateAllBloggers } from "@/services/douyin/evaluator-service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const evalDate = body?.evalDate || undefined;

    const results = await evaluateAllBloggers(evalDate);
    const totalItems = results.reduce((sum, r) => sum + r.itemsCount, 0);
    const errors = results.filter((r) => r.error);

    return Response.json({
      date: evalDate || new Date().toISOString().slice(0, 10),
      totalBloggers: results.length,
      totalPredictions: totalItems,
      errors: errors.length,
      results,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Evaluation failed" },
      { status: 500 }
    );
  }
}
