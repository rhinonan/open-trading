// src/app/api/douyin/scan/route.ts
import { scanAllBloggers } from "@/services/douyin/scanner-service";

export async function POST() {
  try {
    const results = await scanAllBloggers();
    const totalNew = results.reduce((sum, r) => sum + r.newWorks, 0);
    return Response.json({
      total: results.length,
      totalNewWorks: totalNew,
      results,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 }
    );
  }
}
