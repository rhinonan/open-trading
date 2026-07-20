// src/app/api/skills/staging/route.ts
import * as skillService from "@/services/skills-service";
import { jsonError } from "@/lib/api-error";

export async function GET() {
  try {
    const staging = skillService.listStaging();
    return Response.json({ success: true, staging });
  } catch (err) {
    return jsonError(err, { status: 500, body: "success-false", fallback: "获取暂存列表失败" });
  }
}
