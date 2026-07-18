// src/app/api/skills/staging/route.ts
import * as skillService from "@/services/skills-service";

export async function GET() {
  try {
    const staging = skillService.listStaging();
    return Response.json({ success: true, staging });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "获取暂存列表失败" },
      { status: 500 },
    );
  }
}
