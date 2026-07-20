// src/app/api/douyin/scan/route.ts
import { jsonError } from "@/lib/api-error";
import { scanAllBloggers } from "@/services/douyin/scanner-service";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;


  try {
    const results = await scanAllBloggers();
    const totalNew = results.reduce((sum, r) => sum + r.newWorks, 0);
    return Response.json({
      total: results.length,
      totalNewWorks: totalNew,
      results,
    });
  } catch (err) {
    return jsonError(err, { request: request, status: 500, fallback: "Scan failed" });
  }
}
