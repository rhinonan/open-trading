// src/app/api/skills/route.ts
import { NextRequest } from "next/server";
import * as skillService from "@/services/skills-service";
import { mastra } from "@/mastra";

export async function GET() {
  try {
    const skills = skillService.listSkills();
    return Response.json({ success: true, skills });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "获取列表失败" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string" || !url.trim()) {
      return Response.json({ success: false, error: "请提供 GitHub 仓库 URL" }, { status: 400 });
    }

    // 1. 下载到 staging
    const batch = await skillService.installToStaging(url.trim());

    // 2. 触发审查
    const run = await mastra.getWorkflow("skillReviewWorkflow").createRun();
    await run.start({ inputData: { batchId: batch.batchId } });

    // 3. 返回批次信息
    const stagingInfo = skillService.getStaging(batch.batchId);
    return Response.json({
      success: true,
      batch: stagingInfo,
    });
  } catch (err) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : "安装失败" },
      { status: 500 },
    );
  }
}
